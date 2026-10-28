import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { Category } from "../models/Category.js";
import { Product } from "../models/Product.js";
import { Supplier } from "../models/Supplier.js";
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

function variant(sku: string) {
  return { sku, attributes: [], price: 50000, costPrice: 20000, stock: 5, lowStockThreshold: 1 };
}

describe("/api/admin/suppliers", () => {
  it("es solo para admins", async () => {
    await request(app).get("/api/admin/suppliers").expect(401);
    const customer = await tokenFor("customer");
    await request(app).get("/api/admin/suppliers").set(auth(customer)).expect(403);
    await request(app).post("/api/admin/suppliers").set(auth(customer)).send({ name: "X" }).expect(403);
  });

  it("crea, lista, edita y borra un proveedor", async () => {
    const admin = await tokenFor("admin");
    const created = await request(app)
      .post("/api/admin/suppliers")
      .set(auth(admin))
      .send({ name: "  Mayorista Om  ", taxId: "30-12345678-9", email: "OM@Mayorista.com" })
      .expect(201);
    const id = created.body.supplier._id;
    expect(created.body.supplier).toMatchObject({
      name: "Mayorista Om",
      email: "om@mayorista.com",
      isActive: true,
      phone: "",
    });

    const list = await request(app).get("/api/admin/suppliers").set(auth(admin)).expect(200);
    expect(list.body.suppliers).toHaveLength(1);

    const updated = await request(app)
      .patch(`/api/admin/suppliers/${id}`)
      .set(auth(admin))
      .send({ phone: "11 5555-0000" })
      .expect(200);
    expect(updated.body.supplier).toMatchObject({ name: "Mayorista Om", phone: "11 5555-0000" });

    await request(app).delete(`/api/admin/suppliers/${id}`).set(auth(admin)).expect(204);
    expect(await Supplier.countDocuments()).toBe(0);
  });

  it("los inactivos no salen en el listado salvo que se pidan", async () => {
    const admin = await tokenFor("admin");
    await Supplier.create({ name: "Activo" });
    await Supplier.create({ name: "Cerró", isActive: false });

    const normal = await request(app).get("/api/admin/suppliers").set(auth(admin)).expect(200);
    expect(normal.body.suppliers.map((s: { name: string }) => s.name)).toEqual(["Activo"]);

    const all = await request(app).get("/api/admin/suppliers?includeInactive=true").set(auth(admin)).expect(200);
    expect(all.body.suppliers).toHaveLength(2);
  });

  it("valida el nombre y el email", async () => {
    const admin = await tokenFor("admin");
    await request(app).post("/api/admin/suppliers").set(auth(admin)).send({ name: "  " }).expect(400);
    await request(app)
      .post("/api/admin/suppliers")
      .set(auth(admin))
      .send({ name: "X", email: "no-es-un-mail" })
      .expect(400);
  });

  it("no se puede borrar un proveedor con productos asociados: se desactiva", async () => {
    const admin = await tokenFor("admin");
    const supplier = await Supplier.create({ name: "Habitual" });
    const category = await Category.create({ name: "Cat" });
    await Product.create({ name: "Vela", category, supplier: supplier._id, variants: [variant("VELA")] });

    await request(app).delete(`/api/admin/suppliers/${supplier._id}`).set(auth(admin)).expect(409);
    expect(await Supplier.countDocuments()).toBe(1);

    await request(app)
      .patch(`/api/admin/suppliers/${supplier._id}`)
      .set(auth(admin))
      .send({ isActive: false })
      .expect(200);
  });

  it("404 para un proveedor inexistente", async () => {
    const admin = await tokenFor("admin");
    await request(app).get("/api/admin/suppliers/64b7f0f0f0f0f0f0f0f0f0f0").set(auth(admin)).expect(404);
  });
});

describe("proveedor habitual de un producto", () => {
  it("el admin lo asigna y lo ve; la tienda pública no", async () => {
    const admin = await tokenFor("admin");
    const supplier = await Supplier.create({ name: "Habitual" });
    const category = await Category.create({ name: "Cat" });

    const created = await request(app)
      .post("/api/admin/products")
      .set(auth(admin))
      .send({
        name: "Sahumerio",
        category: category._id.toString(),
        supplier: supplier._id.toString(),
        variants: [variant("SAH-1")],
      })
      .expect(201);
    expect(created.body.product.supplier).toBe(supplier._id.toString());

    const publicDetail = await request(app).get("/api/products/sahumerio").expect(200);
    expect(publicDetail.body.product.supplier).toBeUndefined();
    expect(JSON.stringify(publicDetail.body)).not.toContain(supplier._id.toString());

    const publicList = await request(app).get("/api/products").expect(200);
    expect(JSON.stringify(publicList.body)).not.toContain(supplier._id.toString());

    const adminDetail = await request(app)
      .get("/api/products/sahumerio")
      .set(auth(admin))
      .expect(200);
    expect(adminDetail.body.product.supplier).toBe(supplier._id.toString());
  });

  it("rechaza un proveedor inexistente y permite quitarlo con null", async () => {
    const admin = await tokenFor("admin");
    const supplier = await Supplier.create({ name: "Habitual" });
    const category = await Category.create({ name: "Cat" });
    const product = await Product.create({
      name: "Vela",
      category,
      supplier: supplier._id,
      variants: [variant("VELA")],
    });

    await request(app)
      .patch(`/api/admin/products/${product._id}`)
      .set(auth(admin))
      .send({ supplier: "64b7f0f0f0f0f0f0f0f0f0f0" })
      .expect(404);

    const cleared = await request(app)
      .patch(`/api/admin/products/${product._id}`)
      .set(auth(admin))
      .send({ supplier: null })
      .expect(200);
    expect(cleared.body.product.supplier).toBeFalsy();
  });
});

describe("/api/admin/settings", () => {
  it("es solo para admins", async () => {
    await request(app).get("/api/admin/settings").expect(401);
    const customer = await tokenFor("customer");
    await request(app).get("/api/admin/settings").set(auth(customer)).expect(403);
    await request(app)
      .put("/api/admin/settings/pricing")
      .set(auth(customer))
      .send({ marginPercent: 50, roundingStep: 100, autoPriceOnPurchase: true })
      .expect(403);
  });

  it("sin configuración guardada devuelve los valores por defecto, con el precio automático apagado", async () => {
    const admin = await tokenFor("admin");
    const res = await request(app).get("/api/admin/settings").set(auth(admin)).expect(200);
    expect(res.body.settings.pricing).toEqual({
      marginPercent: 100,
      roundingStep: 10000,
      autoPriceOnPurchase: false,
    });
  });

  it("guarda la configuración y la devuelve", async () => {
    const admin = await tokenFor("admin");
    const saved = await request(app)
      .put("/api/admin/settings/pricing")
      .set(auth(admin))
      .send({ marginPercent: 80, roundingStep: 5000, autoPriceOnPurchase: true })
      .expect(200);
    expect(saved.body.settings.pricing).toEqual({ marginPercent: 80, roundingStep: 5000, autoPriceOnPurchase: true });

    const read = await request(app).get("/api/admin/settings").set(auth(admin)).expect(200);
    expect(read.body.settings.pricing.marginPercent).toBe(80);
  });

  it("valida los rangos", async () => {
    const admin = await tokenFor("admin");
    const put = (body: object) => request(app).put("/api/admin/settings/pricing").set(auth(admin)).send(body);
    await put({ marginPercent: -1, roundingStep: 100, autoPriceOnPurchase: true }).expect(400);
    await put({ marginPercent: 5000, roundingStep: 100, autoPriceOnPurchase: true }).expect(400);
    await put({ marginPercent: 50, roundingStep: 0, autoPriceOnPurchase: true }).expect(400);
    await put({ marginPercent: 50, roundingStep: 10.5, autoPriceOnPurchase: true }).expect(400);
    await put({ marginPercent: 50, roundingStep: 100 }).expect(400);
  });
});

describe("compras desde la API", () => {
  it("registra la compra con un proveedor, es idempotente y se puede filtrar por proveedor", async () => {
    const admin = await tokenFor("admin");
    const supplier = await Supplier.create({ name: "Mayorista Om" });
    const other = await Supplier.create({ name: "Otro" });
    const category = await Category.create({ name: "Cat" });
    const product = await Product.create({ name: "Vela", category, variants: [variant("VELA")] });
    const body = {
      supplierId: supplier._id.toString(),
      items: [{ productId: product._id.toString(), variantSku: "VELA", quantity: 5, unitCost: 15000 }],
      idempotencyKey: "formulario-compra-001",
    };

    const first = await request(app).post("/api/supplier-purchases").set(auth(admin)).send(body).expect(201);
    expect(first.body.purchase.supplierName).toBe("Mayorista Om");
    const second = await request(app).post("/api/supplier-purchases").set(auth(admin)).send(body).expect(201);
    expect(second.body.purchase._id).toBe(first.body.purchase._id);
    expect((await Product.findById(product._id))!.variants[0]!.stock).toBe(10);

    const mine = await request(app)
      .get(`/api/supplier-purchases?supplier=${supplier._id}`)
      .set(auth(admin))
      .expect(200);
    expect(mine.body.total).toBe(1);
    const theirs = await request(app)
      .get(`/api/supplier-purchases?supplier=${other._id}`)
      .set(auth(admin))
      .expect(200);
    expect(theirs.body.total).toBe(0);
  });

  it("exige proveedor (registrado o por nombre)", async () => {
    const admin = await tokenFor("admin");
    const category = await Category.create({ name: "Cat" });
    const product = await Product.create({ name: "Vela", category, variants: [variant("VELA")] });
    await request(app)
      .post("/api/supplier-purchases")
      .set(auth(admin))
      .send({ items: [{ productId: product._id.toString(), variantSku: "VELA", quantity: 1, unitCost: 100 }] })
      .expect(400);
  });
});
