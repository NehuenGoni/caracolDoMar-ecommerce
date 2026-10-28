import { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Se mockea anthropicService completo (no el SDK): es el único punto de contacto con Anthropic.
vi.mock("./anthropicService.js", () => ({
  extractInvoice: vi.fn(),
  isRetryableExtractionError: vi.fn(() => false),
}));

import { Category } from "../models/Category.js";
import { Product } from "../models/Product.js";
import { Supplier } from "../models/Supplier.js";
import { SupplierInvoiceImport } from "../models/SupplierInvoiceImport.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";
import { extractInvoice, isRetryableExtractionError, type ExtractInvoiceResult } from "./anthropicService.js";
import { MAX_EXTRACTION_ATTEMPTS, recoverStaleExtractionLock, runExtraction } from "./invoiceExtractionService.js";
import type { ExtractedInvoice, ExtractedInvoiceLine } from "./prompts/invoiceExtraction.prompt.js";
import * as settingsService from "./settingsService.js";

beforeAll(connectTestDB);
afterEach(async () => {
  vi.resetAllMocks();
  await clearTestDB();
});
afterAll(closeTestDB);

const FAKE_FILE = { buffer: Buffer.from("fake"), mimeType: "application/pdf" as const };
const adminId = new Types.ObjectId();

let counter = 0;

async function buildProduct() {
  counter += 1;
  const category = await Category.create({ name: `Categoría ${counter}` });
  return Product.create({
    name: `Producto ${counter}`,
    category: category._id,
    variants: [{ sku: "SKU-1", attributes: [], price: 100000, costPrice: 50000, stock: 10, lowStockThreshold: 1 }],
  });
}

function buildImportDoc(overrides: Record<string, unknown> = {}) {
  return SupplierInvoiceImport.create({
    file: { mimeType: "application/pdf", sizeBytes: 1000, sha256: `sha-${Math.random()}` },
    createdBy: adminId,
    ...overrides,
  });
}

function extractedLine(overrides: Partial<ExtractedInvoiceLine> = {}): ExtractedInvoiceLine {
  return {
    description: "Sahumerio de sándalo x12",
    supplierSku: null,
    barcode: null,
    quantity: 1,
    unit: "caja",
    unitPriceRaw: "600,00",
    unitPriceIncludesTax: false,
    discountPercent: 0,
    taxPercent: 21,
    lineTotalRaw: "600,00",
    confidence: 0.9,
    notes: "",
    ...overrides,
  };
}

function extraction(lines: ExtractedInvoiceLine[], overrides: Partial<ExtractedInvoice> = {}): ExtractInvoiceResult {
  return {
    data: {
      documentType: "factura",
      supplierName: "Distribuidora Om SRL",
      supplierTaxId: "30-12345678-9",
      documentNumber: "0001-00001234",
      documentDate: "2026-09-10",
      currency: "ARS",
      lines,
      subtotalRaw: null,
      taxRaw: null,
      totalRaw: null,
      ...overrides,
    },
    usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0 },
    model: "claude-sonnet-5-5",
    promptVersion: "invoice-extraction-caracol-v1",
  };
}

describe("runExtraction (camino feliz)", () => {
  it("matchea por SKU, arma la línea y calcula el precio de venta con el margen configurado", async () => {
    await buildProduct();
    const doc = await buildImportDoc();
    vi.mocked(extractInvoice).mockResolvedValueOnce(extraction([extractedLine({ supplierSku: "sku-1" })]));

    await runExtraction(doc._id.toString(), FAKE_FILE);

    const updated = await SupplierInvoiceImport.findById(doc._id);
    expect(updated!.status).toBe("review");
    expect(updated!.supplier).toBe("Distribuidora Om SRL");
    expect(updated!.documentType).toBe("factura");
    expect(updated!.documentDate?.toISOString()).toBe("2026-09-10T00:00:00.000Z");
    expect(updated!.extraction).toMatchObject({ attempts: 1, model: "claude-sonnet-5-5", inputTokens: 1000 });

    const line = updated!.lines[0]!;
    expect(line.match).toMatchObject({ status: "matched", method: "sku", variantSku: "SKU-1" });
    expect(line.decision).toMatchObject({ action: "link", updateCostPrice: true, updateSalePrice: true });
    expect(line.raw.unitCost).toBe(60000); // "600,00" → 60000 centavos
    // $600 + 100% de margen (default) = $1.200, ya múltiplo de $100.
    expect(line.decision.salePrice).toBe(120000);
  });

  it("usa el margen y el redondeo que el admin guardó en Ajustes", async () => {
    await buildProduct();
    await settingsService.updatePricingSettings({
      marginPercent: 55,
      roundingStep: 50000,
      autoPriceOnPurchase: false,
    });
    const doc = await buildImportDoc();
    vi.mocked(extractInvoice).mockResolvedValueOnce(extraction([extractedLine({ supplierSku: "sku-1" })]));

    await runExtraction(doc._id.toString(), FAKE_FILE);

    // $600 + 55% = $930 → redondeado hacia arriba al próximo múltiplo de $500 = $1.000.
    const line = (await SupplierInvoiceImport.findById(doc._id))!.lines[0]!;
    expect(line.decision.salePrice).toBe(100000);
  });

  it("convierte a neto un precio con IVA incluido", async () => {
    const doc = await buildImportDoc();
    vi.mocked(extractInvoice).mockResolvedValueOnce(
      extraction([extractedLine({ unitPriceRaw: "1.210,00", unitPriceIncludesTax: true, taxPercent: 21 })]),
    );

    await runExtraction(doc._id.toString(), FAKE_FILE);

    const line = (await SupplierInvoiceImport.findById(doc._id))!.lines[0]!;
    expect(line.raw.unitCost).toBe(100000); // $1.210 / 1,21 = $1.000
  });

  it("sin match deja la línea para vincular a mano (omitida)", async () => {
    const doc = await buildImportDoc();
    vi.mocked(extractInvoice).mockResolvedValueOnce(extraction([extractedLine({ supplierSku: "NO-EXISTE" })]));

    await runExtraction(doc._id.toString(), FAKE_FILE);

    const line = (await SupplierInvoiceImport.findById(doc._id))!.lines[0]!;
    expect(line.match.status).toBe("unmatched");
    expect(line.decision.action).toBe("skip");
    expect(line.decision.product).toBeNull();
  });

  it("un remito sin precios no marca actualizar costo ni precio y prellena con el costo actual", async () => {
    await buildProduct();
    const doc = await buildImportDoc();
    vi.mocked(extractInvoice).mockResolvedValueOnce(
      extraction([extractedLine({ supplierSku: "sku-1", unitPriceRaw: null, lineTotalRaw: null })]),
    );

    await runExtraction(doc._id.toString(), FAKE_FILE);

    const line = (await SupplierInvoiceImport.findById(doc._id))!.lines[0]!;
    expect(line.raw.unitCost).toBeNull();
    expect(line.decision).toMatchObject({
      updateCostPrice: false,
      updateSalePrice: false,
      salePrice: null,
      unitCost: 50000, // el costo actual de la variante, no 0
    });
  });
});

describe("proveedor", () => {
  it("sugiere el proveedor registrado que coincide por CUIT y usa su nombre", async () => {
    const supplier = await Supplier.create({ name: "Om Mayorista", taxId: "30123456789" });
    const doc = await buildImportDoc();
    vi.mocked(extractInvoice).mockResolvedValueOnce(extraction([extractedLine()]));

    await runExtraction(doc._id.toString(), FAKE_FILE);

    const updated = await SupplierInvoiceImport.findById(doc._id);
    expect(updated!.supplierId?.toString()).toBe(supplier._id.toString());
    expect(updated!.supplier).toBe("Om Mayorista");
    expect(updated!.supplierTaxId).toBe("30-12345678-9");
  });

  it("si no hay ningún proveedor registrado que coincida, deja el nombre que leyó la IA", async () => {
    const doc = await buildImportDoc();
    vi.mocked(extractInvoice).mockResolvedValueOnce(extraction([extractedLine()]));

    await runExtraction(doc._id.toString(), FAKE_FILE);

    const updated = await SupplierInvoiceImport.findById(doc._id);
    expect(updated!.supplierId).toBeNull();
    expect(updated!.supplier).toBe("Distribuidora Om SRL");
  });

  it("no pisa el proveedor que el admin ya eligió al subir el archivo", async () => {
    const chosen = await Supplier.create({ name: "Elegido a mano" });
    await Supplier.create({ name: "Coincide por CUIT", taxId: "30123456789" });
    const doc = await buildImportDoc({ supplier: chosen.name, supplierId: chosen._id });
    vi.mocked(extractInvoice).mockResolvedValueOnce(extraction([extractedLine()]));

    await runExtraction(doc._id.toString(), FAKE_FILE);

    const updated = await SupplierInvoiceImport.findById(doc._id);
    expect(updated!.supplierId?.toString()).toBe(chosen._id.toString());
    expect(updated!.supplier).toBe("Elegido a mano");
  });
});

describe("runExtraction (fallas y reintentos)", () => {
  it("un error no reintentable deja la importación en failed, sin reintentar", async () => {
    const doc = await buildImportDoc();
    vi.mocked(extractInvoice).mockRejectedValueOnce(new Error("Archivo corrupto"));

    await runExtraction(doc._id.toString(), FAKE_FILE);

    expect(extractInvoice).toHaveBeenCalledTimes(1);
    const updated = await SupplierInvoiceImport.findById(doc._id);
    expect(updated!.status).toBe("failed");
    expect(updated!.extraction).toMatchObject({ lastError: "Archivo corrupto", attempts: 1 });
  });

  it("reintenta una vez ante un error transitorio y aplica el resultado del segundo intento", async () => {
    await buildProduct();
    const doc = await buildImportDoc();
    vi.mocked(isRetryableExtractionError).mockReturnValue(true);
    vi.mocked(extractInvoice)
      .mockRejectedValueOnce(new Error("Rate limited"))
      .mockResolvedValueOnce(extraction([extractedLine({ supplierSku: "sku-1" })]));

    await runExtraction(doc._id.toString(), FAKE_FILE, { retryBackoffMs: 0 });

    expect(extractInvoice).toHaveBeenCalledTimes(2);
    expect((await SupplierInvoiceImport.findById(doc._id))!.status).toBe("review");
  });

  it("si el reintento también falla queda failed (nunca más de un reintento automático)", async () => {
    const doc = await buildImportDoc();
    vi.mocked(isRetryableExtractionError).mockReturnValue(true);
    vi.mocked(extractInvoice).mockRejectedValue(new Error("Rate limited"));

    await runExtraction(doc._id.toString(), FAKE_FILE, { retryBackoffMs: 0 });

    expect(extractInvoice).toHaveBeenCalledTimes(2);
    expect((await SupplierInvoiceImport.findById(doc._id))!.status).toBe("failed");
  });

  it("no reintenta si ya alcanzó el máximo de intentos", async () => {
    const doc = await buildImportDoc({ status: "failed", extraction: { attempts: MAX_EXTRACTION_ATTEMPTS } });

    await runExtraction(doc._id.toString(), FAKE_FILE);

    expect(extractInvoice).not.toHaveBeenCalled();
    const updated = await SupplierInvoiceImport.findById(doc._id);
    expect(updated!.status).toBe("failed");
    expect(updated!.extraction.attempts).toBe(MAX_EXTRACTION_ATTEMPTS);
  });

  it("no hace nada si el documento ya no está en un estado bloqueable (por ejemplo, ya aplicado)", async () => {
    const doc = await buildImportDoc({ status: "applied" });

    await runExtraction(doc._id.toString(), FAKE_FILE);

    expect(extractInvoice).not.toHaveBeenCalled();
    expect((await SupplierInvoiceImport.findById(doc._id))!.status).toBe("applied");
  });

  it("un resultado tardío no resucita una importación que se descartó mientras tanto", async () => {
    const doc = await buildImportDoc();
    vi.mocked(extractInvoice).mockImplementationOnce(async () => {
      await SupplierInvoiceImport.updateOne({ _id: doc._id }, { $set: { status: "discarded" } });
      return extraction([extractedLine()]);
    });

    await runExtraction(doc._id.toString(), FAKE_FILE);

    expect((await SupplierInvoiceImport.findById(doc._id))!.status).toBe("discarded");
  });
});

describe("runExtraction (lock optimista)", () => {
  it("dos ejecuciones concurrentes sobre el mismo documento leen la factura una sola vez", async () => {
    await buildProduct();
    const doc = await buildImportDoc();
    vi.mocked(extractInvoice).mockResolvedValue(extraction([extractedLine({ supplierSku: "sku-1" })]));

    await Promise.all([runExtraction(doc._id.toString(), FAKE_FILE), runExtraction(doc._id.toString(), FAKE_FILE)]);

    expect(extractInvoice).toHaveBeenCalledTimes(1);
    const updated = await SupplierInvoiceImport.findById(doc._id);
    expect(updated!.extraction.attempts).toBe(1);
    expect(updated!.status).toBe("review");
  });
});

describe("recoverStaleExtractionLock", () => {
  it("marca como failed un lock 'extracting' de más de 5 minutos", async () => {
    const doc = await buildImportDoc({
      status: "extracting",
      extraction: { attempts: 1, startedAt: new Date(Date.now() - 10 * 60 * 1000) },
    });

    await recoverStaleExtractionLock(doc._id.toString());

    const updated = await SupplierInvoiceImport.findById(doc._id);
    expect(updated!.status).toBe("failed");
    expect(updated!.extraction.lastError).toBe("La lectura se interrumpió");
  });

  it("no toca un lock reciente ni un documento que no está leyéndose", async () => {
    const recent = await buildImportDoc({ status: "extracting", extraction: { attempts: 1, startedAt: new Date() } });
    const inReview = await buildImportDoc({ status: "review" });

    await recoverStaleExtractionLock(recent._id.toString());
    await recoverStaleExtractionLock(inReview._id.toString());

    expect((await SupplierInvoiceImport.findById(recent._id))!.status).toBe("extracting");
    expect((await SupplierInvoiceImport.findById(inReview._id))!.status).toBe("review");
  });
});
