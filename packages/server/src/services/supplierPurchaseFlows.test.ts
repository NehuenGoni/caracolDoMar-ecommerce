import { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Category } from "../models/Category.js";
import { Product } from "../models/Product.js";
import { StockMovement } from "../models/StockMovement.js";
import { Supplier } from "../models/Supplier.js";
import { SupplierPurchase } from "../models/SupplierPurchase.js";
import { clearTestDB, closeTestDB, connectTestReplSetDB } from "../test/dbTestUtils.js";
import { withTransaction } from "../utils/transaction.js";
import * as settingsService from "./settingsService.js";
import { createSupplierPurchase } from "./supplierPurchaseService.js";

// Replica set: acá la compra corre dentro de una transacción de verdad.
beforeAll(connectTestReplSetDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

const adminId = new Types.ObjectId().toString();

async function createProduct(overrides: { stock?: number; costPrice?: number; price?: number } = {}) {
  const unique = Math.random().toString(36).slice(2);
  const category = await Category.create({ name: `Cat-${unique}` });
  const product = await Product.create({
    name: `Producto ${unique}`,
    category,
    variants: [
      {
        sku: `SKU-${unique}`,
        attributes: [],
        price: overrides.price ?? 250000,
        costPrice: overrides.costPrice ?? 100000,
        stock: overrides.stock ?? 5,
        lowStockThreshold: 1,
      },
    ],
  });
  return { product, sku: product.variants[0]!.sku, id: product._id.toString() };
}

const reload = async (id: string) => (await Product.findById(id))!.variants[0]!;

describe("proveedor de la compra", () => {
  it("guarda el proveedor registrado y copia su nombre", async () => {
    const supplier = await Supplier.create({ name: "Mayorista Om" });
    const { id, sku } = await createProduct();

    const purchase = await createSupplierPurchase(
      { supplierId: supplier._id.toString(), items: [{ productId: id, variantSku: sku, quantity: 1, unitCost: 100 }] },
      adminId,
    );

    expect(purchase.supplier?.toString()).toBe(supplier._id.toString());
    expect(purchase.supplierName).toBe("Mayorista Om");

    // El nombre queda como estaba aunque el proveedor cambie después.
    await Supplier.updateOne({ _id: supplier._id }, { name: "Otro nombre" });
    expect((await SupplierPurchase.findById(purchase._id))!.supplierName).toBe("Mayorista Om");
  });

  it("acepta solo el nombre, sin proveedor registrado", async () => {
    const { id, sku } = await createProduct();
    const purchase = await createSupplierPurchase(
      { supplierName: "Feria de Once", items: [{ productId: id, variantSku: sku, quantity: 1, unitCost: 100 }] },
      adminId,
    );
    expect(purchase.supplier).toBeUndefined();
    expect(purchase.supplierName).toBe("Feria de Once");
  });

  it("rechaza un proveedor inexistente o inactivo, sin tocar el stock", async () => {
    const { id, sku } = await createProduct({ stock: 5 });
    const items = [{ productId: id, variantSku: sku, quantity: 3, unitCost: 100 }];

    await expect(
      createSupplierPurchase({ supplierId: new Types.ObjectId().toString(), items }, adminId),
    ).rejects.toThrow("Proveedor no encontrado");

    const inactive = await Supplier.create({ name: "Cerró", isActive: false });
    await expect(
      createSupplierPurchase({ supplierId: inactive._id.toString(), items }, adminId),
    ).rejects.toThrow("inactivo");

    expect((await reload(id)).stock).toBe(5);
    expect(await SupplierPurchase.countDocuments()).toBe(0);
  });
});

describe("costos y precios", () => {
  it("el costo de la compra pasa a ser el costo vigente y el precio de venta no se toca por defecto", async () => {
    const { id, sku } = await createProduct({ costPrice: 100000, price: 250000 });

    await createSupplierPurchase(
      { supplierName: "P", items: [{ productId: id, variantSku: sku, quantity: 2, unitCost: 123400 }] },
      adminId,
    );

    const variant = await reload(id);
    expect(variant.costPrice).toBe(123400);
    expect(variant.price).toBe(250000);
    expect(variant.stock).toBe(7);
  });

  it("con el precio automático activado, recalcula el precio con margen y redondeo", async () => {
    await settingsService.updatePricingSettings({
      marginPercent: 100,
      roundingStep: 10000,
      autoPriceOnPurchase: true,
    });
    const { id, sku } = await createProduct({ price: 1 });

    await createSupplierPurchase(
      { supplierName: "P", items: [{ productId: id, variantSku: sku, quantity: 1, unitCost: 123400 }] },
      adminId,
    );

    // $1.234 + 100% = $2.468 → redondeado hacia arriba a $2.500
    expect((await reload(id)).price).toBe(250000);
  });

  it("autoPrice: false (importación de facturas) no recalcula aunque esté activado", async () => {
    await settingsService.updatePricingSettings({
      marginPercent: 100,
      roundingStep: 10000,
      autoPriceOnPurchase: true,
    });
    const { id, sku } = await createProduct({ price: 777700 });

    await createSupplierPurchase(
      { supplierName: "P", items: [{ productId: id, variantSku: sku, quantity: 1, unitCost: 123400 }] },
      adminId,
      { autoPrice: false },
    );

    const variant = await reload(id);
    expect(variant.price).toBe(777700);
    expect(variant.costPrice).toBe(123400);
  });

  it("si un SKU se repite en la compra gana la última línea, y el stock suma ambas", async () => {
    const { id, sku } = await createProduct({ stock: 0 });

    await createSupplierPurchase(
      {
        supplierName: "P",
        items: [
          { productId: id, variantSku: sku, quantity: 2, unitCost: 100 },
          { productId: id, variantSku: sku, quantity: 3, unitCost: 300 },
        ],
      },
      adminId,
    );

    const variant = await reload(id);
    expect(variant.stock).toBe(5);
    expect(variant.costPrice).toBe(300);
    const movements = await StockMovement.find({ product: id }).sort({ createdAt: 1 });
    expect(movements.map((m) => [m.previousStock, m.newStock])).toEqual([
      [0, 2],
      [2, 5],
    ]);
  });
});

describe("idempotencia", () => {
  it("reintentar con la misma clave devuelve la misma compra y suma el stock una sola vez", async () => {
    const { id, sku } = await createProduct({ stock: 0 });
    const input = {
      supplierName: "P",
      items: [{ productId: id, variantSku: sku, quantity: 4, unitCost: 100 }],
      idempotencyKey: "form-submit-0001",
    };

    const first = await createSupplierPurchase(input, adminId);
    const second = await createSupplierPurchase(input, adminId);

    expect(second._id.toString()).toBe(first._id.toString());
    expect(await SupplierPurchase.countDocuments()).toBe(1);
    expect((await reload(id)).stock).toBe(4);
    expect(await StockMovement.countDocuments({ product: id })).toBe(1);
  });

  it("dos envíos simultáneos con la misma clave crean una sola compra", async () => {
    const { id, sku } = await createProduct({ stock: 0 });
    const input = {
      supplierName: "P",
      items: [{ productId: id, variantSku: sku, quantity: 4, unitCost: 100 }],
      idempotencyKey: "doble-click-0001",
    };

    const [a, b] = await Promise.all([
      createSupplierPurchase(input, adminId),
      createSupplierPurchase(input, adminId),
    ]);

    expect(a._id.toString()).toBe(b._id.toString());
    expect(await SupplierPurchase.countDocuments()).toBe(1);
    expect((await reload(id)).stock).toBe(4);
  });

  it("compras sin clave no chocan entre sí", async () => {
    const { id, sku } = await createProduct({ stock: 0 });
    const input = { supplierName: "P", items: [{ productId: id, variantSku: sku, quantity: 1, unitCost: 100 }] };
    await createSupplierPurchase(input, adminId);
    await createSupplierPurchase(input, adminId);
    expect(await SupplierPurchase.countDocuments()).toBe(2);
    expect((await reload(id)).stock).toBe(2);
  });
});

describe("withTransaction (replica set)", () => {
  it("si algo falla a mitad, no queda ninguna de las escrituras", async () => {
    await expect(
      withTransaction(async (session) => {
        await Supplier.create([{ name: "Fantasma" }], { session });
        await Supplier.create([{ name: "Otro fantasma" }], { session });
        throw new Error("se rompió a mitad de camino");
      }),
    ).rejects.toThrow("a mitad de camino");

    expect(await Supplier.countDocuments()).toBe(0);
  });

  it("devuelve el resultado y confirma las escrituras", async () => {
    const result = await withTransaction(async (session) => {
      await Supplier.create([{ name: "Real" }], { session });
      return 42;
    });
    expect(result).toBe(42);
    expect(await Supplier.countDocuments()).toBe(1);
  });

  it("una compra que falla a mitad no deja stock, movimientos ni compra a medias", async () => {
    const a = await createProduct({ stock: 5 });
    const b = await createProduct({ stock: 5 });

    // El 2º producto se borra entre la validación y la aplicación: la compra debe abortar entera.
    const original = Product.findOneAndUpdate.bind(Product);
    let calls = 0;
    Product.findOneAndUpdate = ((...args: Parameters<typeof original>) => {
      calls++;
      if (calls === 2) return Promise.resolve(null) as ReturnType<typeof original>;
      return original(...args);
    }) as typeof Product.findOneAndUpdate;

    try {
      await expect(
        createSupplierPurchase(
          {
            supplierName: "P",
            items: [
              { productId: a.id, variantSku: a.sku, quantity: 3, unitCost: 100 },
              { productId: b.id, variantSku: b.sku, quantity: 3, unitCost: 100 },
            ],
          },
          adminId,
        ),
      ).rejects.toThrow("no encontrados");
    } finally {
      Product.findOneAndUpdate = original as typeof Product.findOneAndUpdate;
    }

    expect((await reload(a.id)).stock).toBe(5);
    expect((await reload(b.id)).stock).toBe(5);
    expect(await StockMovement.countDocuments()).toBe(0);
    expect(await SupplierPurchase.countDocuments()).toBe(0);
  });
});
