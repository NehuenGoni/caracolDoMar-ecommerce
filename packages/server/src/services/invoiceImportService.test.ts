import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Sin esto, createImport dispararía una lectura real contra la API de Anthropic.
vi.mock("./anthropicService.js", () => ({
  extractInvoice: vi.fn(() => new Promise(() => {})),
  isRetryableExtractionError: vi.fn(() => false),
}));

import { Category } from "../models/Category.js";
import { Product } from "../models/Product.js";
import { StockMovement } from "../models/StockMovement.js";
import { Supplier } from "../models/Supplier.js";
import { SupplierInvoiceImport, type ISupplierInvoiceImportLine } from "../models/SupplierInvoiceImport.js";
import { SupplierPurchase } from "../models/SupplierPurchase.js";
import { clearTestDB, closeTestDB, connectTestReplSetDB } from "../test/dbTestUtils.js";
import { applyImport, createImport, discardImport, updateImportHeader, updateLine } from "./invoiceImportService.js";
import { createSupplierPurchase } from "./supplierPurchaseService.js";

// Replica set: aplicar una importación es una transacción (stock, costo y precio juntos).
beforeAll(connectTestReplSetDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

const adminId = new Types.ObjectId().toString();
let counter = 0;

async function buildProduct(sku: string, overrides: Record<string, unknown> = {}) {
  counter += 1;
  const category = await Category.create({ name: `Categoría ${counter}` });
  return Product.create({
    name: `Producto ${counter}`,
    category: category._id,
    variants: [{ sku, attributes: [], price: 100000, costPrice: 50000, stock: 10, lowStockThreshold: 1 }],
    ...overrides,
  });
}

function linkedLine(
  product: { _id: Types.ObjectId },
  variantSku: string,
  opts: Partial<{
    lineNumber: number;
    quantity: number;
    unitCost: number;
    updateCostPrice: boolean;
    updateSalePrice: boolean;
    salePrice: number | null;
  }> = {},
): ISupplierInvoiceImportLine {
  const quantity = opts.quantity ?? 5;
  const unitCost = opts.unitCost ?? 60000;
  return {
    lineNumber: opts.lineNumber ?? 1,
    raw: {
      description: "Sahumerio de sándalo",
      supplierSku: variantSku,
      barcode: "",
      quantity,
      unit: "caja",
      unitCost,
      taxPercent: 21,
      unitCostIncludesTax: false,
      discountPercent: 0,
      modelConfidence: 0.9,
      modelNotes: "",
    },
    match: {
      status: "matched",
      method: "sku",
      product: product._id,
      variantSku,
      currentCostPrice: 50000,
      currentPrice: 100000,
    },
    decision: {
      action: "link",
      product: product._id,
      variantSku,
      quantity,
      unitCost,
      updateCostPrice: opts.updateCostPrice ?? true,
      updateSalePrice: opts.updateSalePrice ?? true,
      marginPercent: null,
      salePrice: opts.salePrice === undefined ? 130000 : opts.salePrice,
    },
    result: { ok: false, error: "" },
  };
}

function skippedLine(lineNumber = 2): ISupplierInvoiceImportLine {
  return {
    lineNumber,
    raw: {
      description: "Percepción IIBB",
      supplierSku: "",
      barcode: "",
      quantity: 0,
      unit: "",
      unitCost: null,
      taxPercent: 0,
      unitCostIncludesTax: false,
      discountPercent: 0,
      modelConfidence: 0.5,
      modelNotes: "",
    },
    match: { status: "unmatched", method: "none", product: null, variantSku: "", currentCostPrice: null, currentPrice: null },
    decision: {
      action: "skip",
      product: null,
      variantSku: "",
      quantity: 0,
      unitCost: 0,
      updateCostPrice: false,
      updateSalePrice: false,
      marginPercent: null,
      salePrice: null,
    },
    result: { ok: false, error: "" },
  };
}

function buildImportDoc(overrides: Record<string, unknown> = {}) {
  return SupplierInvoiceImport.create({
    file: { mimeType: "application/pdf", sizeBytes: 1000, sha256: `sha-${Math.random()}` },
    status: "review",
    supplier: "Distribuidora Om SRL",
    createdBy: adminId,
    lines: [],
    ...overrides,
  });
}

const variantOf = async (productId: unknown) => (await Product.findById(productId))!.variants[0]!;

describe("createImport", () => {
  const upload = (buffer: Buffer, extra: Record<string, unknown> = {}) =>
    createImport(
      { buffer, mimeType: "application/pdf", originalName: "factura.pdf", sizeBytes: buffer.length, ...extra },
      adminId,
    );

  it("crea la importación con el hash del archivo, en estado uploaded", async () => {
    const buffer = Buffer.from("contenido de prueba");

    const doc = await upload(buffer);

    expect(doc.status).toBe("uploaded");
    expect(doc.file.sizeBytes).toBe(buffer.length);
    expect(doc.file.sha256).toBe(createHash("sha256").update(buffer).digest("hex"));
  });

  it("si se sabe el proveedor al subirla, queda asignado con su nombre", async () => {
    const supplier = await Supplier.create({ name: "Om Mayorista" });

    const doc = await upload(Buffer.from("otra factura"), { supplierId: supplier._id.toString() });

    expect(doc.supplierId?.toString()).toBe(supplier._id.toString());
    expect(doc.supplier).toBe("Om Mayorista");
  });

  it("rechaza un proveedor que no existe", async () => {
    await expect(
      upload(Buffer.from("factura rara"), { supplierId: new Types.ObjectId().toString() }),
    ).rejects.toThrow("Proveedor no encontrado");
    expect(await SupplierInvoiceImport.countDocuments()).toBe(0);
  });

  it("rechaza el mismo contenido si ya hay una importación en curso o aplicada", async () => {
    const buffer = Buffer.from("misma factura");
    await SupplierInvoiceImport.create({
      file: { mimeType: "application/pdf", sizeBytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") },
      status: "review",
      createdBy: adminId,
    });

    await expect(upload(buffer)).rejects.toThrow("ya fue cargada");
  });

  it("permite volver a subir el mismo contenido si la importación anterior falló o se descartó", async () => {
    const buffer = Buffer.from("factura que falló");
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    for (const status of ["failed", "discarded"]) {
      await SupplierInvoiceImport.create({
        file: { mimeType: "application/pdf", sizeBytes: buffer.length, sha256 },
        status,
        createdBy: adminId,
      });
    }

    const doc = await upload(buffer);
    expect(doc.status).toBe("uploaded");
  });
});

describe("applyImport (camino feliz)", () => {
  it("crea la compra, mueve stock y actualiza costo y precio de la variante, todo junto", async () => {
    const product = await buildProduct("SKU-IMP-1");
    const doc = await buildImportDoc({ lines: [linkedLine(product, "SKU-IMP-1")] });

    const result = await applyImport(doc._id.toString(), {}, adminId);

    expect(result.purchase.supplierName).toBe("Distribuidora Om SRL");
    expect(result.purchase.items).toHaveLength(1);
    expect(result.purchase.totalCost).toBe(300000); // 5 × $600

    expect(await variantOf(product._id)).toMatchObject({ stock: 15, costPrice: 60000, price: 130000 });
    const movement = await StockMovement.findOne({ product: product._id });
    expect(movement).toMatchObject({ type: "purchase_in", quantity: 5, previousStock: 10, newStock: 15 });

    const applied = await SupplierInvoiceImport.findById(doc._id);
    expect(applied!.status).toBe("applied");
    expect(applied!.purchase?.toString()).toBe(result.purchase._id.toString());
    expect(applied!.appliedAt).not.toBeNull();
    expect(applied!.lines[0]!.result.ok).toBe(true);
    expect(applied!.lines[0]!.result.error).toBe("");
  });

  it("respeta no actualizar el costo ni el precio de una línea: mueve stock pero no toca los precios", async () => {
    const product = await buildProduct("SKU-IMP-2");
    const doc = await buildImportDoc({
      lines: [linkedLine(product, "SKU-IMP-2", { updateCostPrice: false, updateSalePrice: false })],
    });

    await applyImport(doc._id.toString(), {}, adminId);

    expect(await variantOf(product._id)).toMatchObject({ stock: 15, costPrice: 50000, price: 100000 });
  });

  it("puede actualizar solo el costo, o solo el precio", async () => {
    const onlyCost = await buildProduct("SKU-C");
    const onlyPrice = await buildProduct("SKU-P");
    const doc = await buildImportDoc({
      lines: [
        linkedLine(onlyCost, "SKU-C", { lineNumber: 1, updateSalePrice: false }),
        linkedLine(onlyPrice, "SKU-P", { lineNumber: 2, updateCostPrice: false }),
      ],
    });

    await applyImport(doc._id.toString(), {}, adminId);

    expect(await variantOf(onlyCost._id)).toMatchObject({ costPrice: 60000, price: 100000 });
    expect(await variantOf(onlyPrice._id)).toMatchObject({ costPrice: 50000, price: 130000 });
  });

  it("no usa el precio automático de Ajustes: el precio lo decide el admin línea por línea", async () => {
    const { updatePricingSettings } = await import("./settingsService.js");
    await updatePricingSettings({ marginPercent: 500, roundingStep: 100, autoPriceOnPurchase: true });
    const product = await buildProduct("SKU-IMP-A");
    const doc = await buildImportDoc({
      lines: [linkedLine(product, "SKU-IMP-A", { updateSalePrice: false })],
    });

    await applyImport(doc._id.toString(), {}, adminId);

    expect((await variantOf(product._id)).price).toBe(100000);
  });

  it("ignora las líneas omitidas", async () => {
    const product = await buildProduct("SKU-IMP-3");
    const doc = await buildImportDoc({ lines: [linkedLine(product, "SKU-IMP-3"), skippedLine(2)] });

    const result = await applyImport(doc._id.toString(), {}, adminId);

    expect(result.purchase.items).toHaveLength(1);
    expect((await SupplierInvoiceImport.findById(doc._id))!.lines[1]!.result.ok).toBe(false);
  });

  it("usa el proveedor registrado de la importación y pasa la fecha y las notas a la compra", async () => {
    const supplier = await Supplier.create({ name: "Om Mayorista" });
    const product = await buildProduct("SKU-IMP-4");
    const doc = await buildImportDoc({
      supplier: "Om Mayorista",
      supplierId: supplier._id,
      lines: [linkedLine(product, "SKU-IMP-4")],
    });
    const purchaseDate = new Date("2026-01-15T00:00:00.000Z");

    const result = await applyImport(doc._id.toString(), { purchaseDate, notes: "Factura escaneada" }, adminId);

    expect(result.purchase.supplier?.toString()).toBe(supplier._id.toString());
    expect(result.purchase.purchaseDate.toISOString()).toBe(purchaseDate.toISOString());
    expect(result.purchase.notes).toBe("Factura escaneada");
  });
});

describe("applyImport (validaciones: no se aplica nada a medias)", () => {
  it("sin ninguna línea vinculada no crea compra y vuelve a revisión", async () => {
    const doc = await buildImportDoc({ lines: [skippedLine(1)] });

    await expect(applyImport(doc._id.toString(), {}, adminId)).rejects.toThrow("al menos una línea");

    expect(await SupplierPurchase.countDocuments()).toBe(0);
    expect((await SupplierInvoiceImport.findById(doc._id))!.status).toBe("review");
  });

  it("sin proveedor no se aplica", async () => {
    const product = await buildProduct("SKU-IMP-5");
    const doc = await buildImportDoc({ supplier: "", lines: [linkedLine(product, "SKU-IMP-5")] });

    await expect(applyImport(doc._id.toString(), {}, adminId)).rejects.toThrow("proveedor");

    expect(await SupplierPurchase.countDocuments()).toBe(0);
    expect((await SupplierInvoiceImport.findById(doc._id))!.status).toBe("review");
  });

  it("si una línea apunta a un producto o SKU que ya no existe, no se aplica ninguna", async () => {
    const good = await buildProduct("SKU-OK");
    const gone = await buildProduct("SKU-GONE");
    await gone.deleteOne();
    const doc = await buildImportDoc({
      lines: [linkedLine(good, "SKU-OK", { lineNumber: 1 }), linkedLine(gone, "SKU-GONE", { lineNumber: 2 })],
    });

    await expect(applyImport(doc._id.toString(), {}, adminId)).rejects.toThrow("Línea 2");

    // La línea buena tampoco se aplicó: todo o nada.
    expect((await variantOf(good._id)).stock).toBe(10);
    expect(await SupplierPurchase.countDocuments()).toBe(0);
    expect(await StockMovement.countDocuments()).toBe(0);
  });

  it("rechaza un SKU que no existe en el producto", async () => {
    const product = await buildProduct("SKU-IMP-7");
    const doc = await buildImportDoc({ lines: [linkedLine(product, "SKU-QUE-NO-EXISTE")] });

    await expect(applyImport(doc._id.toString(), {}, adminId)).rejects.toThrow("ya no existen");
    expect(await SupplierPurchase.countDocuments()).toBe(0);
  });

  it("rechaza una línea con cantidad 0", async () => {
    const product = await buildProduct("SKU-IMP-Q");
    const doc = await buildImportDoc({ lines: [linkedLine(product, "SKU-IMP-Q", { quantity: 0 })] });

    await expect(applyImport(doc._id.toString(), {}, adminId)).rejects.toThrow("la cantidad");
    expect((await variantOf(product._id)).stock).toBe(10);
  });

  it("rechaza vincular una línea a un kit", async () => {
    const sal = await buildProduct("SAL");
    const kit = await buildProduct("KIT-1", {
      isBundle: true,
      bundleItems: [{ product: sal._id, variantSku: "SAL", quantity: 1 }],
    });
    const doc = await buildImportDoc({ lines: [linkedLine(kit, "KIT-1")] });

    await expect(applyImport(doc._id.toString(), {}, adminId)).rejects.toThrow("es un kit");
    expect(await SupplierPurchase.countDocuments()).toBe(0);
  });

  it("una importación que todavía se está leyendo no se puede aplicar", async () => {
    const doc = await buildImportDoc({ status: "extracting" });

    await expect(applyImport(doc._id.toString(), {}, adminId)).rejects.toThrow("no está lista");
    expect(await SupplierPurchase.countDocuments()).toBe(0);
  });
});

describe("applyImport (idempotencia)", () => {
  it("aplicarla dos veces rechaza la segunda y no duplica la compra ni el stock", async () => {
    const product = await buildProduct("SKU-IMP-8");
    const doc = await buildImportDoc({ lines: [linkedLine(product, "SKU-IMP-8")] });

    await applyImport(doc._id.toString(), {}, adminId);
    await expect(applyImport(doc._id.toString(), {}, adminId)).rejects.toThrow();

    expect(await SupplierPurchase.countDocuments()).toBe(1);
    expect((await variantOf(product._id)).stock).toBe(15);
  });

  it("dos clicks simultáneos aplican una sola vez", async () => {
    const product = await buildProduct("SKU-IMP-9");
    const doc = await buildImportDoc({ lines: [linkedLine(product, "SKU-IMP-9")] });

    const results = await Promise.allSettled([
      applyImport(doc._id.toString(), {}, adminId),
      applyImport(doc._id.toString(), {}, adminId),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await SupplierPurchase.countDocuments()).toBe(1);
    expect((await variantOf(product._id)).stock).toBe(15);
  });

  it("si la compra ya se había creado y se cayó antes de marcar la importación, reintentar la reutiliza", async () => {
    const product = await buildProduct("SKU-IMP-R");
    const doc = await buildImportDoc({ lines: [linkedLine(product, "SKU-IMP-R")] });

    // Se simula el corte: la compra de esta importación existe (con su clave) pero la importación
    // quedó en "review". Al reaplicar no debe sumar el stock de nuevo.
    const existing = await createSupplierPurchase(
      {
        supplierName: "Distribuidora Om SRL",
        items: [{ productId: product._id.toString(), variantSku: "SKU-IMP-R", quantity: 5, unitCost: 60000 }],
        idempotencyKey: `invoice-import:${doc._id.toString()}`,
      },
      adminId,
    );
    expect((await variantOf(product._id)).stock).toBe(15);

    const result = await applyImport(doc._id.toString(), {}, adminId);

    expect(result.purchase._id.toString()).toBe(existing._id.toString());
    expect(await SupplierPurchase.countDocuments()).toBe(1);
    expect((await variantOf(product._id)).stock).toBe(15);
    expect((await SupplierInvoiceImport.findById(doc._id))!.status).toBe("applied");
  });
});

describe("updateLine / updateImportHeader / discardImport", () => {
  it("edita la decisión de una línea solo mientras la importación está en revisión", async () => {
    const product = await buildProduct("SKU-U");
    const doc = await buildImportDoc({ lines: [skippedLine(1)] });

    const updated = await updateLine(doc._id.toString(), 1, {
      action: "link",
      product: product._id.toString(),
      variantSku: "sku-u",
      quantity: 3,
      unitCost: 70000,
      updateCostPrice: true,
      updateSalePrice: false,
      marginPercent: null,
      salePrice: null,
    });
    expect(updated.lines[0]!.decision).toMatchObject({ action: "link", variantSku: "SKU-U", quantity: 3, unitCost: 70000 });

    await SupplierInvoiceImport.updateOne({ _id: doc._id }, { status: "applied" });
    await expect(updateLine(doc._id.toString(), 1, { action: "skip" })).rejects.toThrow("en revisión");
  });

  it("una línea que no existe da 404", async () => {
    const doc = await buildImportDoc({ lines: [skippedLine(1)] });
    await expect(updateLine(doc._id.toString(), 9, { action: "skip" })).rejects.toThrow("Línea 9");
  });

  it("al elegir un proveedor registrado en la cabecera, se copia su nombre; se puede quitar con null", async () => {
    const supplier = await Supplier.create({ name: "Om Mayorista" });
    const doc = await buildImportDoc({ supplier: "Leído por la IA" });

    const chosen = await updateImportHeader(doc._id.toString(), { supplierId: supplier._id.toString() });
    expect(chosen.supplierId?.toString()).toBe(supplier._id.toString());
    expect(chosen.supplier).toBe("Om Mayorista");

    const cleared = await updateImportHeader(doc._id.toString(), { supplierId: null });
    expect(cleared.supplierId).toBeNull();
  });

  it("no se edita la cabecera de una importación ya aplicada", async () => {
    const doc = await buildImportDoc({ status: "applied" });
    await expect(updateImportHeader(doc._id.toString(), { notes: "tarde" })).rejects.toThrow("ya no se puede editar");
  });

  it("descartar no borra, y no se puede descartar una ya aplicada", async () => {
    const pending = await buildImportDoc();
    await discardImport(pending._id.toString());
    expect((await SupplierInvoiceImport.findById(pending._id))!.status).toBe("discarded");

    const applied = await buildImportDoc({ status: "applied" });
    await expect(discardImport(applied._id.toString())).rejects.toThrow();
  });
});
