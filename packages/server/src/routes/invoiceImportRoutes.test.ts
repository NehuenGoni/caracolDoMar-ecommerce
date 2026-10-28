import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../services/anthropicService.js", () => ({
  extractInvoice: vi.fn(),
  isRetryableExtractionError: vi.fn(() => false),
}));

import { createApp } from "../app.js";
import { Category } from "../models/Category.js";
import { Product } from "../models/Product.js";
import { Supplier } from "../models/Supplier.js";
import { User } from "../models/User.js";
import { extractInvoice } from "../services/anthropicService.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";
import { signAccessToken } from "../utils/jwt.js";

const app = createApp();

beforeAll(connectTestDB);
afterEach(async () => {
  vi.resetAllMocks();
  await clearTestDB();
});
afterAll(closeTestDB);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function tokenFor(role: "admin" | "customer") {
  const user = await User.create({
    email: `${role}-${Date.now()}-${Math.random()}@example.com`,
    password: "supersecreto123",
    firstName: "Test",
    lastName: role,
    role,
  });
  return signAccessToken({ sub: user._id.toString(), role });
}

async function product(sku: string) {
  const category = await Category.create({ name: `Cat-${Math.random()}` });
  return Product.create({
    name: `Producto ${sku}`,
    category,
    variants: [{ sku, attributes: [], price: 100000, costPrice: 50000, stock: 10, lowStockThreshold: 1 }],
  });
}

function extracted(lines: { supplierSku: string; quantity?: number; price?: string }[]) {
  return {
    data: {
      documentType: "factura" as const,
      supplierName: "Distribuidora Om SRL",
      supplierTaxId: "30-12345678-9",
      documentNumber: "0001-00000042",
      documentDate: "2026-09-10",
      currency: "ARS" as const,
      lines: lines.map((l) => ({
        description: "Sahumerio de sándalo",
        supplierSku: l.supplierSku,
        barcode: null,
        quantity: l.quantity ?? 5,
        unit: "caja",
        unitPriceRaw: l.price ?? "600,00",
        unitPriceIncludesTax: false,
        discountPercent: 0,
        taxPercent: 21,
        lineTotalRaw: null,
        confidence: 0.9,
        notes: "",
      })),
      subtotalRaw: null,
      taxRaw: null,
      totalRaw: null,
    },
    usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0 },
    model: "claude-sonnet-5-5",
    promptVersion: "test",
  };
}

let fileCounter = 0;
const upload = (token: string, content = `%PDF-1.4 factura ${++fileCounter}`, contentType = "application/pdf") =>
  request(app)
    .post("/api/admin/invoice-imports")
    .set(auth(token))
    .attach("file", Buffer.from(content), { filename: "factura.pdf", contentType });

/** La lectura corre en segundo plano: se espera a que la importación salga de uploaded/extracting. */
async function waitForReading(token: string, id: string) {
  for (let i = 0; i < 60; i++) {
    const res = await request(app).get(`/api/admin/invoice-imports/${id}`).set(auth(token));
    if (!["uploaded", "extracting"].includes(res.body.import.status)) return res.body;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("La importación no terminó de leerse");
}

describe("permisos", () => {
  it("solo los admins pueden ver, subir ni aplicar facturas", async () => {
    const customer = await tokenFor("customer");
    await request(app).get("/api/admin/invoice-imports").expect(401);
    await request(app).get("/api/admin/invoice-imports").set(auth(customer)).expect(403);
    await upload(customer).expect(403);
    await request(app).get("/api/admin/invoice-imports/status").set(auth(customer)).expect(403);
  });

  it("informa si la lectura por IA está configurada", async () => {
    const admin = await tokenFor("admin");
    const res = await request(app).get("/api/admin/invoice-imports/status").set(auth(admin)).expect(200);
    expect(res.body).toEqual({ extractionConfigured: true });
  });
});

describe("subir una factura", () => {
  it("pide un archivo y solo acepta PDF o imágenes", async () => {
    const admin = await tokenFor("admin");
    await request(app).post("/api/admin/invoice-imports").set(auth(admin)).expect(400);
    await upload(admin, "no soy una factura", "text/plain").expect(400);
  });

  it("lee la factura en segundo plano y deja las líneas listas para revisar", async () => {
    const admin = await tokenFor("admin");
    const p = await product("SAH-SAN");
    vi.mocked(extractInvoice).mockResolvedValue(extracted([{ supplierSku: "sah san" }, { supplierSku: "DESCONOCIDO" }]));

    const created = await upload(admin).expect(201);
    expect(["uploaded", "extracting", "review"]).toContain(created.body.import.status);

    const { import: doc, pricingDefaults } = await waitForReading(admin, created.body.import._id);
    expect(doc.status).toBe("review");
    expect(doc.supplier).toBe("Distribuidora Om SRL");
    expect(doc.documentNumber).toBe("0001-00000042");
    expect(doc.lines).toHaveLength(2);
    expect(doc.lines[0].match).toMatchObject({ status: "matched", method: "sku", variantSku: "SAH-SAN", product: p._id.toString() });
    expect(doc.lines[0].decision).toMatchObject({ action: "link", unitCost: 60000, salePrice: 120000 });
    expect(doc.lines[1].decision.action).toBe("skip");
    expect(pricingDefaults).toEqual({ marginPercent: 100, roundingStep: 10000 });
  });

  it("si la lectura falla queda en failed con el motivo, y se puede volver a subir el mismo archivo", async () => {
    const admin = await tokenFor("admin");
    vi.mocked(extractInvoice).mockRejectedValueOnce(new Error("Archivo ilegible"));

    const created = await upload(admin, "mismo contenido").expect(201);
    const { import: failed } = await waitForReading(admin, created.body.import._id);
    expect(failed.status).toBe("failed");
    expect(failed.extraction.lastError).toBe("Archivo ilegible");

    vi.mocked(extractInvoice).mockResolvedValue(extracted([{ supplierSku: "X" }]));
    const again = await upload(admin, "mismo contenido").expect(201);
    expect((await waitForReading(admin, again.body.import._id)).import.status).toBe("review");
  });

  it("rechaza la misma factura mientras la anterior sigue viva", async () => {
    const admin = await tokenFor("admin");
    vi.mocked(extractInvoice).mockResolvedValue(extracted([{ supplierSku: "X" }]));

    const first = await upload(admin, "factura repetida").expect(201);
    await waitForReading(admin, first.body.import._id);
    await upload(admin, "factura repetida").expect(409);
  });

  it("si se elige un proveedor al subir, queda asignado", async () => {
    const admin = await tokenFor("admin");
    const supplier = await Supplier.create({ name: "Om Mayorista" });
    vi.mocked(extractInvoice).mockResolvedValue(extracted([{ supplierSku: "X" }]));

    const created = await request(app)
      .post("/api/admin/invoice-imports")
      .set(auth(admin))
      .field("supplierId", supplier._id.toString())
      .attach("file", Buffer.from("factura con proveedor"), { filename: "f.pdf", contentType: "application/pdf" })
      .expect(201);

    const { import: doc } = await waitForReading(admin, created.body.import._id);
    expect(doc.supplierId).toBe(supplier._id.toString());
    expect(doc.supplier).toBe("Om Mayorista");
  });
});

describe("revisar y aplicar", () => {
  async function readyImport(admin: string, lines = [{ supplierSku: "sah-san" }]) {
    vi.mocked(extractInvoice).mockResolvedValue(extracted(lines));
    const created = await upload(admin).expect(201);
    const { import: doc } = await waitForReading(admin, created.body.import._id);
    return doc as { _id: string; lines: { lineNumber: number }[] };
  }

  it("el flujo completo: corregir una línea, aplicar y ver stock, costo y precio actualizados", async () => {
    const admin = await tokenFor("admin");
    const p = await product("SAH-SAN");
    const doc = await readyImport(admin);

    // El admin corrige la cantidad (la factura decía 5, llegaron 4) y el precio de venta.
    await request(app)
      .patch(`/api/admin/invoice-imports/${doc._id}/lines/1`)
      .set(auth(admin))
      .send({
        action: "link",
        product: p._id.toString(),
        variantSku: "SAH-SAN",
        quantity: 4,
        unitCost: 60000,
        updateCostPrice: true,
        updateSalePrice: true,
        salePrice: 99000,
      })
      .expect(200);

    const applied = await request(app)
      .post(`/api/admin/invoice-imports/${doc._id}/apply`)
      .set(auth(admin))
      .send({ notes: "Llegó completa" })
      .expect(200);

    expect(applied.body.import.status).toBe("applied");
    expect(applied.body.purchase).toMatchObject({ supplierName: "Distribuidora Om SRL", totalCost: 240000 });

    const variant = (await Product.findById(p._id))!.variants[0]!;
    expect(variant).toMatchObject({ stock: 14, costPrice: 60000, price: 99000 });

    const purchases = await request(app).get("/api/supplier-purchases").set(auth(admin)).expect(200);
    expect(purchases.body.total).toBe(1);
  });

  it("aplicar dos veces da 409 y no duplica", async () => {
    const admin = await tokenFor("admin");
    const p = await product("SAH-SAN");
    const doc = await readyImport(admin);
    await request(app).post(`/api/admin/invoice-imports/${doc._id}/apply`).set(auth(admin)).send({}).expect(200);
    await request(app).post(`/api/admin/invoice-imports/${doc._id}/apply`).set(auth(admin)).send({}).expect(409);
    expect((await Product.findById(p._id))!.variants[0]!.stock).toBe(15);
  });

  it("sin ninguna línea vinculada no se puede aplicar", async () => {
    const admin = await tokenFor("admin");
    const doc = await readyImport(admin, [{ supplierSku: "NO-EXISTE" }]);
    const res = await request(app).post(`/api/admin/invoice-imports/${doc._id}/apply`).set(auth(admin)).send({});
    expect(res.status).toBe(400);
  });

  it("valida el cuerpo y el número de línea", async () => {
    const admin = await tokenFor("admin");
    await product("SAH-SAN");
    const doc = await readyImport(admin);
    const patch = (line: string | number, body: object) =>
      request(app).patch(`/api/admin/invoice-imports/${doc._id}/lines/${line}`).set(auth(admin)).send(body);

    await patch(0, { action: "skip" }).expect(400);
    await patch(1, { action: "borrar" }).expect(400);
    await patch(1, { action: "link", product: "no-es-un-id", variantSku: "X", quantity: 1, unitCost: 1 }).expect(400);
    await patch(1, { action: "link", product: "64b7f0f0f0f0f0f0f0f0f0f0", variantSku: "X", quantity: 0, unitCost: 1 }).expect(400);
    await patch(99, { action: "skip" }).expect(404);
  });

  it("descartar no borra, y una descartada no se puede aplicar", async () => {
    const admin = await tokenFor("admin");
    await product("SAH-SAN");
    const doc = await readyImport(admin);

    await request(app).delete(`/api/admin/invoice-imports/${doc._id}`).set(auth(admin)).expect(204);
    const read = await request(app).get(`/api/admin/invoice-imports/${doc._id}`).set(auth(admin)).expect(200);
    expect(read.body.import.status).toBe("discarded");
    await request(app).post(`/api/admin/invoice-imports/${doc._id}/apply`).set(auth(admin)).send({}).expect(409);
  });

  it("la cabecera se puede corregir: proveedor registrado y datos del documento", async () => {
    const admin = await tokenFor("admin");
    const supplier = await Supplier.create({ name: "Om Mayorista" });
    await product("SAH-SAN");
    const doc = await readyImport(admin);

    const res = await request(app)
      .patch(`/api/admin/invoice-imports/${doc._id}`)
      .set(auth(admin))
      .send({ supplierId: supplier._id.toString(), documentNumber: "0002-00000007" })
      .expect(200);
    expect(res.body.import).toMatchObject({ supplier: "Om Mayorista", documentNumber: "0002-00000007" });
  });
});

describe("listado", () => {
  it("filtra por estado y por proveedor, y trata lo que se escribe como texto, no como patrón", async () => {
    const admin = await tokenFor("admin");
    await product("A");
    vi.mocked(extractInvoice).mockResolvedValue(extracted([{ supplierSku: "A" }]));
    const created = await upload(admin).expect(201);
    await waitForReading(admin, created.body.import._id);

    const all = await request(app).get("/api/admin/invoice-imports").set(auth(admin)).expect(200);
    expect(all.body.total).toBe(1);

    const inReview = await request(app).get("/api/admin/invoice-imports?status=review").set(auth(admin)).expect(200);
    expect(inReview.body.total).toBe(1);
    const applied = await request(app).get("/api/admin/invoice-imports?status=applied").set(auth(admin)).expect(200);
    expect(applied.body.total).toBe(0);

    const byName = await request(app).get("/api/admin/invoice-imports?supplier=om srl").set(auth(admin)).expect(200);
    expect(byName.body.total).toBe(1);
    const regex = await request(app).get("/api/admin/invoice-imports?supplier=.*").set(auth(admin)).expect(200);
    expect(regex.body.total).toBe(0);
  });
});
