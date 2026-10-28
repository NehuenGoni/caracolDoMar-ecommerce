import { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Category } from "../models/Category.js";
import { Order } from "../models/Order.js";
import { Product, type ProductDocument } from "../models/Product.js";
import { StockMovement } from "../models/StockMovement.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";
import * as bundleService from "./bundleService.js";
import { decrementStock, restockItems } from "./checkoutService.js";
import * as inventoryService from "./inventoryService.js";
import * as productService from "./productService.js";
import { createSupplierPurchase } from "./supplierPurchaseService.js";

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

const adminId = new Types.ObjectId().toString();

async function createCategory() {
  return Category.create({ name: `Cat-${Math.random()}` });
}

function variant(sku: string, overrides: Record<string, unknown> = {}) {
  return {
    sku,
    attributes: [],
    price: 100000,
    costPrice: 40000,
    stock: 10,
    lowStockThreshold: 1,
    isUniquePiece: false,
    ...overrides,
  };
}

async function createSimple(categoryId: string, sku: string, overrides: Record<string, unknown> = {}) {
  return productService.createProduct(
    {
      name: `Producto ${sku}`,
      category: categoryId,
      tags: [],
      images: [],
      videos: [],
      isBundle: false,
      bundleItems: [],
      variants: [variant(sku, overrides)],
    },
    adminId,
  );
}

type Component = { product: ProductDocument; sku: string; quantity: number };

async function createKit(
  categoryId: string,
  components: Component[],
  overrides: Record<string, unknown> = {},
) {
  return productService.createProduct(
    {
      name: "Kit limpieza",
      category: categoryId,
      tags: [],
      images: [],
      videos: [],
      isBundle: true,
      bundleItems: components.map((c) => ({
        product: c.product._id.toString(),
        variantSku: c.sku,
        quantity: c.quantity,
      })),
      variants: [variant("KIT-1", { price: 500000, costPrice: 0, stock: 99, ...overrides })],
    },
    adminId,
  );
}

async function stockOf(product: ProductDocument) {
  return (await Product.findById(product._id))!.variants[0]!.stock;
}

describe("crear un kit", () => {
  it("calcula el costo como suma de los componentes y no guarda stock propio", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL", { costPrice: 1000 });
    const ruda = await createSimple(category._id.toString(), "RUDA", { costPrice: 500 });

    const kit = await createKit(category._id.toString(), [
      { product: sal, sku: "SAL", quantity: 2 },
      { product: ruda, sku: "RUDA", quantity: 1 },
    ]);

    expect(kit.isBundle).toBe(true);
    expect(kit.variants[0]).toMatchObject({ costPrice: 2500, stock: 0, price: 500000 });
    expect(await StockMovement.countDocuments({ variantSku: "KIT-1" })).toBe(0);
  });

  it("rechaza un kit sin componentes", async () => {
    const category = await createCategory();
    await expect(createKit(category._id.toString(), [])).rejects.toThrow("al menos un componente");
  });

  it("rechaza un kit con más de una variante", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL");
    await expect(
      productService.createProduct(
        {
          name: "Kit",
          category: category._id.toString(),
          tags: [],
          images: [],
          videos: [],
          isBundle: true,
          bundleItems: [{ product: sal._id.toString(), variantSku: "SAL", quantity: 1 }],
          variants: [variant("K1"), variant("K2")],
        },
        adminId,
      ),
    ).rejects.toThrow("una sola variante");
  });

  it("rechaza componentes repetidos, inexistentes o archivados", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL");

    await expect(
      createKit(category._id.toString(), [
        { product: sal, sku: "SAL", quantity: 1 },
        { product: sal, sku: "SAL", quantity: 2 },
      ]),
    ).rejects.toThrow("repetido");

    await expect(
      createKit(category._id.toString(), [{ product: sal, sku: "NO-EXISTE", quantity: 1 }]),
    ).rejects.toThrow("Componente no encontrado");

    await productService.deleteProduct(sal._id.toString());
    await expect(
      createKit(category._id.toString(), [{ product: sal, sku: "SAL", quantity: 1 }]),
    ).rejects.toThrow("archivado");
  });

  it("no deja armar un kit con otro kit adentro", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL");
    const kit = await createKit(category._id.toString(), [{ product: sal, sku: "SAL", quantity: 1 }]);

    await expect(
      productService.createProduct(
        {
          name: "Mega kit",
          category: category._id.toString(),
          tags: [],
          images: [],
          videos: [],
          isBundle: true,
          bundleItems: [{ product: kit._id.toString(), variantSku: "KIT-1", quantity: 1 }],
          variants: [variant("MEGA")],
        },
        adminId,
      ),
    ).rejects.toThrow("no puede incluir otros kits");
  });

  it("rechaza componentes en un producto que no es kit", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL");
    await expect(
      productService.createProduct(
        {
          name: "Vela",
          category: category._id.toString(),
          tags: [],
          images: [],
          videos: [],
          isBundle: false,
          bundleItems: [{ product: sal._id.toString(), variantSku: "SAL", quantity: 1 }],
          variants: [variant("VELA")],
        },
        adminId,
      ),
    ).rejects.toThrow("Solo un kit");
  });
});

describe("stock disponible de un kit", () => {
  it("lo manda el componente más escaso", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL", { stock: 10 });
    const ruda = await createSimple(category._id.toString(), "RUDA", { stock: 3 });
    const kit = await createKit(category._id.toString(), [
      { product: sal, sku: "SAL", quantity: 2 }, // 10 / 2 = 5 kits
      { product: ruda, sku: "RUDA", quantity: 1 }, // 3 / 1 = 3 kits
    ]);

    const components = await bundleService.loadComponents([kit]);
    expect(bundleService.bundleAvailability(kit, components)).toBe(3);

    const view = await productService.getPublicProductBySlug(kit.slug, false);
    expect(view.variants[0]?.stock).toBe(3);
  });

  it("es 0 si un componente se archiva", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL");
    const kit = await createKit(category._id.toString(), [{ product: sal, sku: "SAL", quantity: 1 }]);

    await productService.deleteProduct(sal._id.toString());

    const view = await productService.getPublicProductBySlug(kit.slug, false);
    expect(view.variants[0]?.stock).toBe(0);
  });

  it("informa qué incluye, sin costos ni el stock de cada componente, a un visitante", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL");
    const kit = await createKit(category._id.toString(), [{ product: sal, sku: "SAL", quantity: 2 }]);

    const view = await productService.getPublicProductBySlug(kit.slug, false);
    expect(view.bundleComponents).toEqual([
      { productId: sal._id.toString(), productName: "Producto SAL", variantSku: "SAL", variantLabel: "", quantity: 2 },
    ]);
    expect(JSON.stringify(view)).not.toContain("costPrice");
  });
});

describe("vender, devolver y reponer un kit", () => {
  it("descuenta el stock de cada componente (cantidad del kit × cantidad del componente)", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL", { stock: 10 });
    const ruda = await createSimple(category._id.toString(), "RUDA", { stock: 3 });
    const kit = await createKit(category._id.toString(), [
      { product: sal, sku: "SAL", quantity: 2 },
      { product: ruda, sku: "RUDA", quantity: 1 },
    ]);

    const changes = await decrementStock([{ product: kit._id, variantSku: "KIT-1", quantity: 2 }]);

    expect(await stockOf(sal)).toBe(6);
    expect(await stockOf(ruda)).toBe(1);
    expect(changes).toEqual([
      { product: sal._id.toString(), variantSku: "SAL", quantity: -4, previousStock: 10, newStock: 6 },
      { product: ruda._id.toString(), variantSku: "RUDA", quantity: -2, previousStock: 3, newStock: 1 },
    ]);
  });

  it("suma el kit y el mismo componente vendido suelto en una sola operación", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL", { stock: 10 });
    const kit = await createKit(category._id.toString(), [{ product: sal, sku: "SAL", quantity: 2 }]);

    const changes = await decrementStock([
      { product: kit._id, variantSku: "KIT-1", quantity: 1 },
      { product: sal._id, variantSku: "SAL", quantity: 3 },
    ]);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ quantity: -5, newStock: 5 });
  });

  it("si un componente no alcanza, falla y deja todos los demás como estaban", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL", { stock: 10 });
    const ruda = await createSimple(category._id.toString(), "RUDA", { stock: 3 });
    const kit = await createKit(category._id.toString(), [
      { product: sal, sku: "SAL", quantity: 2 },
      { product: ruda, sku: "RUDA", quantity: 1 },
    ]);

    await expect(
      decrementStock([{ product: kit._id, variantSku: "KIT-1", quantity: 4 }]),
    ).rejects.toThrow("Stock insuficiente");

    expect(await stockOf(sal)).toBe(10);
    expect(await stockOf(ruda)).toBe(3);
  });

  it("restockItems y returnStock reponen los componentes", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL", { stock: 10 });
    const kit = await createKit(category._id.toString(), [{ product: sal, sku: "SAL", quantity: 2 }]);

    await decrementStock([{ product: kit._id, variantSku: "KIT-1", quantity: 2 }]);
    expect(await stockOf(sal)).toBe(6);

    await restockItems([{ product: kit._id, variantSku: "KIT-1", quantity: 1 }]);
    expect(await stockOf(sal)).toBe(8);

    await inventoryService.returnStock(
      [{ product: kit._id.toString(), variantSku: "KIT-1", quantity: 1 }],
      { reference: "orden-1", createdBy: adminId },
    );
    expect(await stockOf(sal)).toBe(10);

    const movements = await StockMovement.find({ type: "return" });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ variantSku: "SAL", quantity: 2, newStock: 10 });
  });
});

describe("operaciones que un kit no admite", () => {
  it("no tiene ajuste de stock propio", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL");
    const kit = await createKit(category._id.toString(), [{ product: sal, sku: "SAL", quantity: 1 }]);

    await expect(
      inventoryService.adjustStock(
        { productId: kit._id.toString(), variantSku: "KIT-1", quantityChange: 5, note: "x" },
        adminId,
      ),
    ).rejects.toThrow("no tiene stock propio");
  });

  it("no se le compra mercadería a un proveedor", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL");
    const kit = await createKit(category._id.toString(), [{ product: sal, sku: "SAL", quantity: 1 }]);

    await expect(
      createSupplierPurchase(
        {
          supplierName: "Proveedor",
          items: [{ productId: kit._id.toString(), variantSku: "KIT-1", quantity: 1, unitCost: 100 }],
        },
        adminId,
      ),
    ).rejects.toThrow("es un kit");
  });

  it("no aparece en las alertas de stock bajo (su stock guardado es siempre 0)", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL", { stock: 10 });
    await createKit(category._id.toString(), [{ product: sal, sku: "SAL", quantity: 1 }]);

    expect(await inventoryService.listLowStock()).toHaveLength(0);
  });
});

describe("editar un kit", () => {
  it("no se puede convertir un producto en kit ni al revés", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL");
    const kit = await createKit(category._id.toString(), [{ product: sal, sku: "SAL", quantity: 1 }]);

    await expect(
      productService.updateProduct(sal._id.toString(), { isBundle: true }, adminId),
    ).rejects.toThrow("no se puede convertir");
    await expect(
      productService.updateProduct(kit._id.toString(), { isBundle: false }, adminId),
    ).rejects.toThrow("no se puede convertir");
  });

  it("cambiar el precio no toca el costo calculado ni el stock", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL", { costPrice: 700 });
    const kit = await createKit(category._id.toString(), [{ product: sal, sku: "SAL", quantity: 2 }]);

    const updated = await productService.updateProduct(
      kit._id.toString(),
      { variants: [variant("KIT-1", { price: 650000, costPrice: 1, stock: 50 })] },
      adminId,
    );

    expect(updated.variants[0]).toMatchObject({ price: 650000, costPrice: 1400, stock: 0 });
  });

  it("se puede cambiar la composición mientras nunca se vendió, y recalcula el costo", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL", { costPrice: 700 });
    const ruda = await createSimple(category._id.toString(), "RUDA", { costPrice: 300 });
    const kit = await createKit(category._id.toString(), [{ product: sal, sku: "SAL", quantity: 1 }]);

    const updated = await productService.updateProduct(
      kit._id.toString(),
      {
        bundleItems: [
          { product: sal._id.toString(), variantSku: "SAL", quantity: 1 },
          { product: ruda._id.toString(), variantSku: "RUDA", quantity: 2 },
        ],
      },
      adminId,
    );

    expect(updated.bundleItems).toHaveLength(2);
    expect(updated.variants[0]?.costPrice).toBe(1300);
  });

  it("no se puede cambiar la composición de un kit que ya se vendió", async () => {
    const category = await createCategory();
    const sal = await createSimple(category._id.toString(), "SAL");
    const ruda = await createSimple(category._id.toString(), "RUDA");
    const kit = await createKit(category._id.toString(), [{ product: sal, sku: "SAL", quantity: 1 }]);

    // Un pedido que ya incluye el kit (insert crudo: solo importa que lo referencie).
    await Order.collection.insertOne({ items: [{ product: kit._id, variantSku: "KIT-1" }] });

    await expect(
      productService.updateProduct(
        kit._id.toString(),
        {
          bundleItems: [
            { product: sal._id.toString(), variantSku: "SAL", quantity: 1 },
            { product: ruda._id.toString(), variantSku: "RUDA", quantity: 1 },
          ],
        },
        adminId,
      ),
    ).rejects.toThrow("ya tiene ventas");

    // Mandar la misma composición (lo que hace el formulario) sí está permitido.
    const unchanged = await productService.updateProduct(
      kit._id.toString(),
      { bundleItems: [{ product: sal._id.toString(), variantSku: "SAL", quantity: 1 }] },
      adminId,
    );
    expect(unchanged.bundleItems).toHaveLength(1);
  });
});
