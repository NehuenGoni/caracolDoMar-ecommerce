import { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Category } from "../models/Category.js";
import { Product } from "../models/Product.js";
import { StockMovement } from "../models/StockMovement.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";
import * as productService from "./productService.js";

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

const defaultQuery = { page: 1, limit: 20 } as const;

function buildVariant(sku: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sku,
    attributes: [{ name: "Color", value: "Verde" }],
    price: 250000,
    costPrice: 120000,
    stock: 5,
    lowStockThreshold: 1,
    ...overrides,
  };
}

const adminId = new Types.ObjectId().toString();

async function createProduct(
  categoryId: string,
  sku: string,
  variant: Partial<Record<string, unknown>> = {},
) {
  return productService.createProduct(
    {
      name: "Producto",
      category: categoryId,
      tags: [],
      images: [],
      variants: [buildVariant(sku, variant)],
    },
    adminId,
  );
}

async function createCategory() {
  return Category.create({ name: `Cat-${Math.random()}` });
}

describe("listPublicProducts", () => {
  it("solo devuelve productos activos para un viewer no admin", async () => {
    const category = await createCategory();
    await Product.create({ name: "A", category, variants: [buildVariant("SKU-A")] });
    await Product.create({
      name: "B",
      category,
      isActive: false,
      variants: [buildVariant("SKU-B")],
    });

    const result = await productService.listPublicProducts(defaultQuery, false);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("incluye inactivos cuando el viewer es admin", async () => {
    const category = await createCategory();
    await Product.create({ name: "A", category, variants: [buildVariant("SKU-A")] });
    await Product.create({
      name: "B",
      category,
      isActive: false,
      variants: [buildVariant("SKU-B")],
    });

    const result = await productService.listPublicProducts(defaultQuery, true);
    expect(result.total).toBe(2);
  });

  it("filtra por categoría", async () => {
    const catA = await createCategory();
    const catB = await createCategory();
    await Product.create({ name: "A", category: catA, variants: [buildVariant("SKU-A")] });
    await Product.create({ name: "B", category: catB, variants: [buildVariant("SKU-B")] });

    const result = await productService.listPublicProducts(
      { ...defaultQuery, category: catA._id.toString() },
      false,
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe("A");
  });

  it("filtra por isFeatured", async () => {
    const category = await createCategory();
    await Product.create({
      name: "Destacado",
      category,
      isFeatured: true,
      variants: [buildVariant("SKU-A")],
    });
    await Product.create({ name: "Normal", category, variants: [buildVariant("SKU-B")] });

    const result = await productService.listPublicProducts({ ...defaultQuery, isFeatured: true }, false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe("Destacado");
  });

  it("busca por texto en nombre/descripción/tags", async () => {
    const category = await createCategory();
    await Product.create({
      name: "Vela Aromática",
      description: "Aroma a lavanda",
      category,
      variants: [buildVariant("SKU-A")],
    });
    await Product.create({ name: "Mantel de Lino", category, variants: [buildVariant("SKU-B")] });

    const result = await productService.listPublicProducts({ ...defaultQuery, search: "lavanda" }, false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe("Vela Aromática");
  });

  it("pagina los resultados", async () => {
    const category = await createCategory();
    for (let i = 0; i < 5; i += 1) {
      await Product.create({ name: `P${i}`, category, variants: [buildVariant(`SKU-${i}`)] });
    }

    const result = await productService.listPublicProducts({ page: 1, limit: 2 }, false);
    expect(result.items).toHaveLength(2);
    expect(result.totalPages).toBe(3);
  });
});

describe("getPublicProductBySlug", () => {
  it("lanza NotFoundError para un producto inactivo sin viewer admin", async () => {
    const category = await createCategory();
    await Product.create({
      name: "Oculto",
      category,
      isActive: false,
      variants: [buildVariant("SKU-A")],
    });
    await expect(productService.getPublicProductBySlug("oculto", false)).rejects.toThrow();
  });

  it("devuelve el producto inactivo si el viewer es admin", async () => {
    const category = await createCategory();
    await Product.create({
      name: "Oculto",
      category,
      isActive: false,
      variants: [buildVariant("SKU-A")],
    });
    const product = await productService.getPublicProductBySlug("oculto", true);
    expect(product.name).toBe("Oculto");
  });
});

describe("createProduct / updateProduct / deleteProduct", () => {
  it("rechaza crear con una categoría inexistente", async () => {
    await expect(
      productService.createProduct(
        {
          name: "X",
          category: new Types.ObjectId().toString(),
          tags: [],
          images: [],
          variants: [buildVariant("SKU-X")],
        },
        adminId,
      ),
    ).rejects.toThrow();
  });

  it("crea, actualiza y elimina un producto", async () => {
    const category = await createCategory();
    const product = await createProduct(category._id.toString(), "SKU-Y");

    const updated = await productService.updateProduct(
      product._id.toString(),
      { name: "Producto Actualizado" },
      adminId,
    );
    expect(updated.slug).toBe("producto-actualizado");

    // Baja lógica: el producto sigue existiendo (pedidos, ventas y movimientos lo referencian)
    // pero deja de verse en la tienda.
    await productService.deleteProduct(product._id.toString());
    const archived = await productService.getAdminProductById(product._id.toString());
    expect(archived.isActive).toBe(false);
    await expect(productService.getPublicProductBySlug(archived.slug, false)).rejects.toThrow();
  });

  it("rechaza actualizar hacia una categoría inexistente", async () => {
    const category = await createCategory();
    const product = await createProduct(category._id.toString(), "SKU-Z");

    await expect(
      productService.updateProduct(
        product._id.toString(),
        { category: new Types.ObjectId().toString() },
        adminId,
      ),
    ).rejects.toThrow();
  });

  it("registra el stock inicial como movimiento al crear", async () => {
    const category = await createCategory();
    const product = await createProduct(category._id.toString(), "SKU-INI", { stock: 7 });

    const movements = await StockMovement.find({ product: product._id });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      variantSku: "SKU-INI",
      type: "adjustment",
      quantity: 7,
      previousStock: 0,
      newStock: 7,
    });
  });

  it("no pisa el stock de una variante existente al editar el producto", async () => {
    const category = await createCategory();
    const product = await createProduct(category._id.toString(), "SKU-EDIT", { stock: 5 });

    // Mientras el admin tenía el formulario abierto se vendieron 2 unidades.
    await Product.updateOne(
      { _id: product._id, "variants.sku": "SKU-EDIT" },
      { $inc: { "variants.$.stock": -2 } },
    );

    // El formulario manda el stock viejo (5) junto con el precio nuevo.
    const updated = await productService.updateProduct(
      product._id.toString(),
      { variants: [buildVariant("SKU-EDIT", { price: 300000, stock: 5 })] },
      adminId,
    );

    expect(updated.variants[0]?.price).toBe(300000);
    expect(updated.variants[0]?.stock).toBe(3);
    // Y editar no genera movimientos: solo la creación inicial.
    expect(await StockMovement.countDocuments({ product: product._id })).toBe(1);
  });

  it("agrega una variante nueva con su stock inicial registrado", async () => {
    const category = await createCategory();
    const product = await createProduct(category._id.toString(), "SKU-A1", { stock: 5 });

    const updated = await productService.updateProduct(
      product._id.toString(),
      { variants: [buildVariant("SKU-A1"), buildVariant("sku-a2", { stock: 4 })] },
      adminId,
    );

    expect(updated.variants.map((v) => v.sku)).toEqual(["SKU-A1", "SKU-A2"]);
    const initial = await StockMovement.find({ product: product._id, variantSku: "SKU-A2" });
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({ quantity: 4, newStock: 4, type: "adjustment" });
  });

  it("no deja quitar una variante que todavía tiene stock", async () => {
    const category = await createCategory();
    const product = await productService.createProduct(
      {
        name: "Producto",
        category: category._id.toString(),
        tags: [],
        images: [],
        variants: [buildVariant("SKU-K1", { stock: 2 }), buildVariant("SKU-K2", { stock: 0 })],
      },
      adminId,
    );

    await expect(
      productService.updateProduct(
        product._id.toString(),
        { variants: [buildVariant("SKU-K2", { stock: 0 })] },
        adminId,
      ),
    ).rejects.toThrow("todavía tiene stock");

    // Sin stock sí se puede quitar.
    const updated = await productService.updateProduct(
      product._id.toString(),
      { variants: [buildVariant("SKU-K1", { stock: 2 })] },
      adminId,
    );
    expect(updated.variants.map((v) => v.sku)).toEqual(["SKU-K1"]);
  });

  it("rechaza SKUs repetidos entre las variantes", async () => {
    const category = await createCategory();
    await expect(
      productService.createProduct(
        {
          name: "Producto",
          category: category._id.toString(),
          tags: [],
          images: [],
          variants: [buildVariant("SKU-D"), buildVariant("sku-d")],
        },
        adminId,
      ),
    ).rejects.toThrow("SKUs repetidos");
  });
});

describe("toPublicProduct", () => {
  it("no expone costPrice a un visitante, pero sí al admin", async () => {
    const category = await createCategory();
    await Product.create({ name: "Vela", category, variants: [buildVariant("SKU-PUB")] });

    const list = await productService.listPublicProducts(defaultQuery, false);
    expect(JSON.stringify(list)).not.toContain("costPrice");
    expect(JSON.parse(JSON.stringify(list)).items[0].variants[0]).toMatchObject({
      sku: "SKU-PUB",
      price: 250000,
      stock: 5,
    });

    const detail = await productService.getPublicProductBySlug("vela", false);
    expect(JSON.stringify(detail)).not.toContain("costPrice");

    const adminDetail = await productService.getPublicProductBySlug("vela", true);
    expect(JSON.parse(JSON.stringify(adminDetail)).variants[0].costPrice).toBe(120000);
  });
});
