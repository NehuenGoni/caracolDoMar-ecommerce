import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { Category } from "../models/Category.js";
import { Product } from "../models/Product.js";
import { StockMovement } from "../models/StockMovement.js";
import { User } from "../models/User.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";
import { signAccessToken } from "../utils/jwt.js";

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

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

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

function variant(sku: string, overrides: Record<string, unknown> = {}) {
  return {
    sku,
    attributes: [],
    price: 50000,
    costPrice: 20000,
    stock: 5,
    lowStockThreshold: 1,
    ...overrides,
  };
}

async function product(
  name: string,
  categoryId: unknown,
  options: Record<string, unknown> = {},
  variantOverrides: Record<string, unknown> = {},
) {
  return Product.create({
    name,
    category: categoryId,
    variants: [variant(`SKU-${name.replace(/\W/g, "").toUpperCase()}`, variantOverrides)],
    ...options,
  });
}

async function names(query: string) {
  const res = await request(app).get(`/api/products?${query}`).expect(200);
  return (res.body.items as { name: string }[]).map((p) => p.name);
}

describe("filtros y orden del catálogo", () => {
  it("filtra por rango de precio (en centavos)", async () => {
    const cat = await Category.create({ name: "Cat" });
    await product("Barato", cat._id, {}, { price: 10000 });
    await product("Medio", cat._id, {}, { price: 50000 });
    await product("Caro", cat._id, {}, { price: 90000 });

    expect(await names("minPrice=40000&maxPrice=60000")).toEqual(["Medio"]);
    expect((await names("minPrice=50000")).sort()).toEqual(["Caro", "Medio"]);
    expect(await names("maxPrice=10000")).toEqual(["Barato"]);
  });

  it("filtra por marca y por tags", async () => {
    const cat = await Category.create({ name: "Cat" });
    await product("A", cat._id, { brand: "Nag Champa", tags: ["limpieza"] });
    await product("B", cat._id, { brand: "Goloka", tags: ["abundancia", "limpieza"] });
    await product("C", cat._id, { brand: "Goloka", tags: ["amor"] });

    expect((await names("brand=Goloka")).sort()).toEqual(["B", "C"]);
    expect((await names("tags=limpieza")).sort()).toEqual(["A", "B"]);
    expect(await names("brand=Goloka&tags=amor")).toEqual(["C"]);
  });

  it("ordena por precio y por nombre (sin distinguir mayúsculas ni tildes)", async () => {
    const cat = await Category.create({ name: "Cat" });
    await product("Zafiro", cat._id, {}, { price: 30000 });
    await product("árbol de vida", cat._id, {}, { price: 90000 });
    await product("Bruma", cat._id, {}, { price: 10000 });

    expect(await names("sort=price_asc")).toEqual(["Bruma", "Zafiro", "árbol de vida"]);
    expect(await names("sort=price_desc")).toEqual(["árbol de vida", "Zafiro", "Bruma"]);
    expect(await names("sort=name")).toEqual(["árbol de vida", "Bruma", "Zafiro"]);
  });

  it("rechaza un orden desconocido", async () => {
    await request(app).get("/api/products?sort=al_azar").expect(400);
  });

  it("la categoría incluye a sus subcategorías", async () => {
    const sahumerios = await Category.create({ name: "Sahumerios" });
    const sandalo = await Category.create({ name: "Sándalo", parent: sahumerios._id });
    const hindu = await Category.create({ name: "Sándalo hindú", parent: sandalo._id });
    const velas = await Category.create({ name: "Velas" });
    await product("Sahumerio genérico", sahumerios._id);
    await product("Sándalo clásico", sandalo._id);
    await product("Sándalo del Himalaya", hindu._id);
    await product("Vela", velas._id);

    expect((await names(`category=${sahumerios._id}`)).sort()).toEqual([
      "Sahumerio genérico",
      "Sándalo clásico",
      "Sándalo del Himalaya",
    ]);
    expect((await names(`category=${sandalo._id}`)).sort()).toEqual(["Sándalo clásico", "Sándalo del Himalaya"]);
    expect(await names(`category=${hindu._id}`)).toEqual(["Sándalo del Himalaya"]);
  });

  it("combina filtros, también con los paginados", async () => {
    const cat = await Category.create({ name: "Cat" });
    for (let i = 1; i <= 5; i++) await product(`P${i}`, cat._id, { brand: "X" }, { price: i * 10000 });

    const res = await request(app)
      .get("/api/products?brand=X&minPrice=20000&sort=price_asc&limit=2&page=2")
      .expect(200);
    expect(res.body.total).toBe(4);
    expect(res.body.items.map((p: { name: string }) => p.name)).toEqual(["P4", "P5"]);
  });
});

describe("GET /api/products/facets", () => {
  it("devuelve marcas, tags y rango de precios de lo que está a la venta", async () => {
    const cat = await Category.create({ name: "Cat" });
    await product("A", cat._id, { brand: "Goloka", tags: ["limpieza"] }, { price: 10000 });
    await product("B", cat._id, { brand: "Nag Champa", tags: ["amor", "limpieza"] }, { price: 90000 });
    await product("C", cat._id, { brand: "Oculta", tags: ["secreto"], isActive: false }, { price: 5 });

    const res = await request(app).get("/api/products/facets").expect(200);
    expect(res.body).toEqual({
      brands: ["Goloka", "Nag Champa"],
      tags: ["amor", "limpieza"],
      price: { min: 10000, max: 90000 },
    });
  });

  it("sin productos devuelve listas vacías y precio nulo", async () => {
    const res = await request(app).get("/api/products/facets").expect(200);
    expect(res.body).toEqual({ brands: [], tags: [], price: null });
  });
});

describe("piezas únicas", () => {
  it("una pieza única vendida sale del listado pero la ficha sigue accesible", async () => {
    const cat = await Category.create({ name: "Cat" });
    await product("Selenita única", cat._id, {}, { isUniquePiece: true, stock: 0 });
    await product("Vela", cat._id);

    expect(await names("")).toEqual(["Vela"]);
    const detail = await request(app).get("/api/products/selenita-unica").expect(200);
    expect(detail.body.product.variants[0]).toMatchObject({ isUniquePiece: true, stock: 0 });
  });

  it("una pieza única con stock se ve, y el admin la ve siempre", async () => {
    const cat = await Category.create({ name: "Cat" });
    await product("Pirámide", cat._id, {}, { isUniquePiece: true, stock: 1 });
    await product("Vendida", cat._id, {}, { isUniquePiece: true, stock: 0 });
    const admin = await tokenFor("admin");

    expect(await names("")).toEqual(["Pirámide"]);
    const adminList = await request(app).get("/api/admin/products").set(auth(admin)).expect(200);
    expect(adminList.body.total).toBe(2);
  });

  it("una variante entre varias agotada no oculta el producto", async () => {
    const cat = await Category.create({ name: "Cat" });
    await Product.create({
      name: "Collar",
      category: cat._id,
      variants: [
        variant("COLLAR-1", { isUniquePiece: true, stock: 0 }),
        variant("COLLAR-2", { isUniquePiece: true, stock: 1 }),
      ],
    });
    expect(await names("")).toEqual(["Collar"]);
  });

  it("al reponerse (devolución) vuelve al listado", async () => {
    const cat = await Category.create({ name: "Cat" });
    const p = await product("Estatua", cat._id, {}, { isUniquePiece: true, stock: 0 });
    expect(await names("")).toEqual([]);

    await Product.updateOne({ _id: p._id }, { $set: { "variants.0.stock": 1 } });
    expect(await names("")).toEqual(["Estatua"]);
  });

  it("no se puede cargar una pieza única con más de una unidad", async () => {
    const admin = await tokenFor("admin");
    const cat = await Category.create({ name: "Cat" });
    const res = await request(app)
      .post("/api/admin/products")
      .set(auth(admin))
      .send({
        name: "Cuarzo",
        category: cat._id.toString(),
        variants: [variant("CUARZO", { isUniquePiece: true, stock: 2 })],
      });
    expect(res.status).toBe(400);
  });
});

describe("videos del producto", () => {
  const video = (n: number) => ({
    url: `https://res.cloudinary.com/test-cloud/video/upload/v1/reel-${n}.mp4`,
    source: "cloudinary",
    order: n,
  });

  it("guarda y devuelve los videos", async () => {
    const admin = await tokenFor("admin");
    const cat = await Category.create({ name: "Cat" });
    const created = await request(app)
      .post("/api/admin/products")
      .set(auth(admin))
      .send({
        name: "Pirámide",
        category: cat._id.toString(),
        variants: [variant("PIRA")],
        videos: [video(0), video(1)],
      })
      .expect(201);
    expect(created.body.product.videos).toEqual([video(0), video(1)]);

    const detail = await request(app).get("/api/products/piramide").expect(200);
    expect(detail.body.product.videos).toHaveLength(2);
  });

  it("admite hasta 3 videos por producto", async () => {
    const admin = await tokenFor("admin");
    const cat = await Category.create({ name: "Cat" });
    await request(app)
      .post("/api/admin/products")
      .set(auth(admin))
      .send({
        name: "Reels",
        category: cat._id.toString(),
        variants: [variant("REELS")],
        videos: [video(0), video(1), video(2), video(3)],
      })
      .expect(400);
  });
});

describe("kits: de punta a punta", () => {
  async function setup() {
    const admin = await tokenFor("admin");
    const cat = await Category.create({ name: "Cat" });
    const sal = await product("Sal gruesa", cat._id, {}, { stock: 10, costPrice: 1000 });
    const ruda = await product("Ruda", cat._id, {}, { stock: 3, costPrice: 500 });
    const created = await request(app)
      .post("/api/admin/products")
      .set(auth(admin))
      .send({
        name: "Kit limpieza",
        category: cat._id.toString(),
        isBundle: true,
        bundleItems: [
          { product: sal._id.toString(), variantSku: sal.variants[0]!.sku, quantity: 2 },
          { product: ruda._id.toString(), variantSku: ruda.variants[0]!.sku, quantity: 1 },
        ],
        variants: [variant("KIT-LIMPIEZA", { price: 400000, stock: 0 })],
      })
      .expect(201);
    return { admin, sal, ruda, kit: created.body.product, kitSku: "KIT-LIMPIEZA" };
  }

  const stockOf = async (id: string) => (await Product.findById(id))!.variants[0]!.stock;

  it("lo ve la tienda con el stock disponible, qué incluye y sin costos", async () => {
    const { kit } = await setup();
    expect(kit.variants[0]).toMatchObject({ costPrice: 2500, stock: 3 }); // admin: ve el costo calculado

    const res = await request(app).get("/api/products/kit-limpieza").expect(200);
    expect(res.body.product.variants[0].stock).toBe(3);
    expect(res.body.product.bundleComponents.map((c: { productName: string }) => c.productName)).toEqual([
      "Sal gruesa",
      "Ruda",
    ]);
    expect(JSON.stringify(res.body)).not.toContain("costPrice");
  });

  it("el carrito respeta el stock que permiten los componentes", async () => {
    const { kit, kitSku } = await setup();
    const customer = await tokenFor("customer");

    await request(app)
      .post("/api/cart/items")
      .set(auth(customer))
      .send({ productId: kit._id, variantSku: kitSku, quantity: 3 })
      .expect(201);
    const over = await request(app)
      .post("/api/cart/items")
      .set(auth(customer))
      .send({ productId: kit._id, variantSku: kitSku, quantity: 1 });
    expect(over.status).toBe(400); // ya hay 3 en el carrito y la ruda alcanza para 3

    const cart = await request(app).get("/api/cart").set(auth(customer)).expect(200);
    expect(cart.body.items[0].availableStock).toBe(3);
  });

  it("una venta en el local descuenta los componentes y anularla los repone", async () => {
    const { admin, sal, ruda, kit, kitSku } = await setup();
    await request(app).post("/api/admin/cash-sessions").set(auth(admin)).send({ openingAmount: 0 }).expect(201);

    const sale = await request(app)
      .post("/api/admin/store-sales")
      .set(auth(admin))
      .send({ items: [{ productId: kit._id, variantSku: kitSku, quantity: 2 }], paymentMethod: "debit" })
      .expect(201);

    expect(await stockOf(sal._id.toString())).toBe(6); // 10 - 2 kits × 2
    expect(await stockOf(ruda._id.toString())).toBe(1); // 3 - 2 kits × 1
    const movements = await StockMovement.find({ type: "sale_out" });
    expect(movements.map((m) => [m.variantSku, m.quantity]).sort()).toEqual(
      [
        [sal.variants[0]!.sku, -4],
        [ruda.variants[0]!.sku, -2],
      ].sort(),
    );

    // Con 1 ruda alcanza para 1 kit más, no para 2.
    await request(app)
      .post("/api/admin/store-sales")
      .set(auth(admin))
      .send({ items: [{ productId: kit._id, variantSku: kitSku, quantity: 2 }], paymentMethod: "debit" })
      .expect(400);

    await request(app)
      .post(`/api/admin/store-sales/${sale.body.sale._id}/void`)
      .set(auth(admin))
      .send({ reason: "Error de carga" })
      .expect(200);
    expect(await stockOf(sal._id.toString())).toBe(10);
    expect(await stockOf(ruda._id.toString())).toBe(3);
  });

  it("el buscador del POS informa el stock del kit", async () => {
    const { admin, kitSku } = await setup();
    const res = await request(app)
      .get("/api/admin/store-sales/lookup")
      .query({ code: kitSku })
      .set(auth(admin))
      .expect(200);
    expect(res.body.result).toMatchObject({ variantSku: kitSku, price: 400000, stock: 3 });
  });
});
