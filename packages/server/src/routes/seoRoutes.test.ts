import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { Category } from "../models/Category.js";
import { Product } from "../models/Product.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";

const app = createApp();
const SITE = "http://localhost:5173";

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

async function createProduct(overrides: Record<string, unknown> = {}, variant: Record<string, unknown> = {}) {
  const category = await Category.create({ name: `Velas ${Math.random()}`, description: "Velas de soja hechas a mano." });
  const product = await Product.create({
    name: "Vela de soja",
    category: category._id,
    description: "Vela aromática de soja, 40 horas de duración.",
    images: [{ url: "https://res.cloudinary.com/demo/vela.jpg", source: "cloudinary", order: 0 }],
    variants: [
      {
        sku: `VEL-${Math.random().toString(36).slice(2)}`,
        attributes: [],
        price: 1250000,
        costPrice: 500000,
        stock: 2,
        lowStockThreshold: 0,
        ...variant,
      },
    ],
    ...overrides,
  });
  return { product, category };
}

describe("GET /api/seo/robots.txt", () => {
  it("cierra las rutas privadas y apunta al sitemap de la tienda", async () => {
    const res = await request(app).get("/api/seo/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("Disallow: /admin");
    expect(res.text).toContain("Disallow: /checkout");
    expect(res.text).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });
});

describe("GET /api/seo/sitemap.xml", () => {
  it("lista inicio, catálogo, categorías y productos visibles", async () => {
    const { product, category } = await createProduct();
    await Product.create({
      name: "Producto dado de baja",
      category: category._id,
      isActive: false,
      variants: [{ sku: "BAJA-1", attributes: [], price: 100, costPrice: 50, stock: 1, lowStockThreshold: 0 }],
    });

    const res = await request(app).get("/api/seo/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    expect(res.text).toContain(`<loc>${SITE}/</loc>`);
    expect(res.text).toContain(`<loc>${SITE}/catalogo?categoria=${category.slug}</loc>`);
    expect(res.text).toContain(`<loc>${SITE}/productos/${product.slug}</loc>`);
    expect(res.text).not.toContain("producto-dado-de-baja");
  });

  it("no incluye una pieza única ya vendida", async () => {
    const { product } = await createProduct({ name: "Estatua de Ganesha" }, { stock: 0, isUniquePiece: true });
    const res = await request(app).get("/api/seo/sitemap.xml");
    expect(res.text).not.toContain(product.slug);
  });
});

describe("GET /api/seo/render", () => {
  it("devuelve la ficha del producto con meta, Open Graph y JSON-LD", async () => {
    const { product, category } = await createProduct();

    const res = await request(app).get("/api/seo/render").query({ path: `/productos/${product.slug}` });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("<title>Vela de soja | Caracol do Mar</title>");
    expect(res.text).toContain(`<link rel="canonical" href="${SITE}/productos/${product.slug}">`);
    expect(res.text).toContain(`<meta property="og:image" content="https://res.cloudinary.com/demo/vela.jpg">`);
    expect(res.text).toContain(`<meta property="product:price:amount" content="12500.00">`);
    expect(res.text).toContain('"@type":"Product"');
    expect(res.text).toContain(category.name);
  });

  it("nunca muestra el costo", async () => {
    const { product } = await createProduct();
    const res = await request(app).get("/api/seo/render").query({ path: `/productos/${product.slug}` });
    expect(res.text).not.toContain("5000.00");
    expect(res.text).not.toContain("costPrice");
  });

  it("escapa el texto que carga el admin", async () => {
    const { product } = await createProduct({ name: 'Vela "<script>alert(1)</script>"' });
    const res = await request(app).get("/api/seo/render").query({ path: `/productos/${product.slug}` });
    expect(res.text).not.toContain("<script>alert(1)");
    expect(res.text).toContain("&lt;script&gt;");
  });

  it("devuelve 404 para un producto inactivo o inexistente", async () => {
    const { product } = await createProduct({ isActive: false });
    const inactive = await request(app).get("/api/seo/render").query({ path: `/productos/${product.slug}` });
    expect(inactive.status).toBe(404);
    const missing = await request(app).get("/api/seo/render").query({ path: "/productos/%E0%A4%A" });
    expect(missing.status).toBe(404);
  });

  it("arma la página de una categoría con links a sus productos", async () => {
    const { product, category } = await createProduct();
    const res = await request(app).get("/api/seo/render").query({ path: `/catalogo?categoria=${category.slug}` });
    expect(res.status).toBe(200);
    expect(res.text).toContain(`<h1>${category.name}</h1>`);
    expect(res.text).toContain("Velas de soja hechas a mano.");
    expect(res.text).toContain(`${SITE}/productos/${product.slug}`);
  });

  it("arma el inicio", async () => {
    const res = await request(app).get("/api/seo/render").query({ path: "/" });
    expect(res.status).toBe(200);
    expect(res.text).toContain('"@type":"Store"');
  });

  it("rechaza un path que no es una ruta", async () => {
    const res = await request(app).get("/api/seo/render").query({ path: "https://otro-sitio.com" });
    expect(res.status).toBe(400);
  });
});
