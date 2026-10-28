import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Category } from "../models/Category.js";
import { Product } from "../models/Product.js";
import { Supplier } from "../models/Supplier.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";
import { matchLines, matchSupplier, normalizeSku } from "./invoiceMatchingService.js";

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

let counter = 0;

function variant(sku: string, overrides: Record<string, unknown> = {}) {
  return { sku, attributes: [], price: 100000, costPrice: 50000, stock: 10, lowStockThreshold: 1, ...overrides };
}

async function buildProduct(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const category = await Category.create({ name: `Categoría ${counter}` });
  return Product.create({
    name: `Producto ${counter}`,
    category: category._id,
    variants: [variant("SKU-1")],
    ...overrides,
  });
}

describe("normalizeSku", () => {
  it("ignora mayúsculas, espacios, guiones, puntos y barras", () => {
    expect(normalizeSku("sku-1")).toBe("SKU1");
    expect(normalizeSku("SKU1")).toBe("SKU1");
    expect(normalizeSku(" S.K.U/1 ")).toBe("SKU1");
  });
});

describe("matchLines", () => {
  it("matchea por SKU normalizado y trae los precios actuales", async () => {
    const product = await buildProduct();

    const [result] = await matchLines([{ supplierSku: "sku 1", barcode: "" }]);

    expect(result).toMatchObject({
      status: "matched",
      method: "sku",
      variantSku: "SKU-1",
      currentCostPrice: 50000,
      currentPrice: 100000,
    });
    expect(result!.product?.toString()).toBe(product._id.toString());
  });

  it("matchea por código de barras exacto", async () => {
    const product = await buildProduct({ variants: [variant("SKU-2", { barcode: "7791234567890" })] });

    const [result] = await matchLines([{ supplierSku: "", barcode: "7791234567890" }]);

    expect(result).toMatchObject({ status: "matched", method: "barcode", variantSku: "SKU-2" });
    expect(result!.product?.toString()).toBe(product._id.toString());
  });

  it("el código de barras gana sobre el SKU cuando apuntan a productos distintos", async () => {
    await buildProduct({ variants: [variant("SKU-A")] });
    const byBarcode = await buildProduct({ variants: [variant("SKU-B", { barcode: "7790000000001" })] });

    const [result] = await matchLines([{ supplierSku: "SKU-A", barcode: "7790000000001" }]);

    expect(result!.method).toBe("barcode");
    expect(result!.product?.toString()).toBe(byBarcode._id.toString());
  });

  it("devuelve unmatched si no hay nada que coincida o la línea no trae códigos", async () => {
    await buildProduct();

    const results = await matchLines([
      { supplierSku: "NO-EXISTE", barcode: "" },
      { supplierSku: "", barcode: "" },
    ]);

    for (const result of results) {
      expect(result).toEqual({
        status: "unmatched",
        method: "none",
        product: null,
        variantSku: "",
        currentCostPrice: null,
        currentPrice: null,
      });
    }
  });

  it("resuelve varias líneas en un solo llamado, respetando el orden de entrada", async () => {
    await buildProduct({ variants: [variant("SKU-X")] });
    await buildProduct({ variants: [variant("SKU-Y")] });

    const results = await matchLines([
      { supplierSku: "sku-y", barcode: "" },
      { supplierSku: "no-existe", barcode: "" },
      { supplierSku: "sku-x", barcode: "" },
    ]);

    expect(results.map((r) => r.status)).toEqual(["matched", "unmatched", "matched"]);
    expect(results[0]!.variantSku).toBe("SKU-Y");
    expect(results[2]!.variantSku).toBe("SKU-X");
  });

  it("no matchea los kits: no se les compra mercadería", async () => {
    const sal = await buildProduct({ variants: [variant("SAL")] });
    await buildProduct({
      isBundle: true,
      bundleItems: [{ product: sal._id, variantSku: "SAL", quantity: 1 }],
      variants: [variant("KIT-LIMPIEZA", { stock: 0 })],
    });

    const [result] = await matchLines([{ supplierSku: "KIT-LIMPIEZA", barcode: "" }]);

    expect(result!.status).toBe("unmatched");
  });
});

describe("matchSupplier", () => {
  it("sugiere el proveedor por CUIT, sin importar guiones ni espacios", async () => {
    const supplier = await Supplier.create({ name: "Distribuidora Om", taxId: "30-12345678-9" });

    const match = await matchSupplier("Otro nombre leído", "30 12345678 9");

    expect(match?.id.toString()).toBe(supplier._id.toString());
    expect(match?.name).toBe("Distribuidora Om");
  });

  it("si el CUIT no coincide, prueba con el nombre exacto sin distinguir mayúsculas", async () => {
    const supplier = await Supplier.create({ name: "Distribuidora Om" });

    const match = await matchSupplier("  distribuidora OM ", "");

    expect(match?.id.toString()).toBe(supplier._id.toString());
  });

  it("el nombre se compara literal: los símbolos de regex no matchean de más", async () => {
    await Supplier.create({ name: "Mayorista Om" });

    expect(await matchSupplier("Mayorista .*", "")).toBeNull();
    expect(await matchSupplier(".*", "")).toBeNull();
  });

  it("ignora proveedores inactivos y devuelve null si no hay coincidencia", async () => {
    await Supplier.create({ name: "Cerró", taxId: "30-11111111-1", isActive: false });

    expect(await matchSupplier("Cerró", "30-11111111-1")).toBeNull();
    expect(await matchSupplier("Nadie", "30-99999999-9")).toBeNull();
  });

  it("un CUIT demasiado corto no se usa para matchear", async () => {
    await Supplier.create({ name: "Con CUIT raro", taxId: "123" });
    expect(await matchSupplier("Otro", "123")).toBeNull();
  });
});
