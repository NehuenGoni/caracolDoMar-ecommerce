import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { Cart } from "../models/Cart.js";
import { Category } from "../models/Category.js";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { StoreSale } from "../models/StoreSale.js";
import { User } from "../models/User.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";
import { signAccessToken } from "../utils/jwt.js";
import { dayKey } from "../utils/reportDates.js";

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

type Role = "admin" | "seller" | "customer";

async function actor(role: Role) {
  const user = await User.create({
    email: `${role}-${Date.now()}-${Math.random()}@example.com`,
    password: "supersecreto123",
    firstName: "Test",
    lastName: role,
    role,
  });
  return { user, auth: { Authorization: `Bearer ${signAccessToken({ sub: user._id.toString(), role })}` } };
}

async function product(cost = 4000) {
  const category = await Category.create({ name: `Cat-${Math.random()}` });
  return Product.create({
    name: `Producto ${Math.random()}`,
    category,
    variants: [{ sku: `SKU-${Math.random().toString(36).slice(2, 8)}`, attributes: [], price: 10000, costPrice: cost, stock: 20, lowStockThreshold: 0 }],
  });
}

const costOf = async (collection: "sale" | "order") => {
  const doc = collection === "sale" ? await StoreSale.findOne().lean() : await Order.findOne().lean();
  return (doc?.items as { unitCost?: number }[])[0]?.unitCost;
};

describe("el costo se guarda al vender y nunca sale por la API", () => {
  async function sellAtCounter(sellerAuth: Record<string, string>) {
    const p = await product(4000);
    await request(app).post("/api/admin/cash-sessions").set(sellerAuth).send({ openingAmount: 0 }).expect(201);
    const res = await request(app)
      .post("/api/admin/store-sales")
      .set(sellerAuth)
      .send({ items: [{ productId: p._id.toString(), variantSku: p.variants[0]!.sku, quantity: 2 }], paymentMethod: "debit" })
      .expect(201);
    return { p, saleId: res.body.sale._id as string, createRes: res };
  }

  it("una venta del local guarda el costo del producto", async () => {
    const { auth } = await actor("admin");
    await sellAtCounter(auth);
    expect(await costOf("sale")).toBe(4000);
  });

  it("pero ninguna respuesta de ventas lo devuelve: ni al crear, ni al ver, ni al listar, ni al vendedor", async () => {
    const { auth: admin } = await actor("admin");
    const { auth: seller } = await actor("seller");
    const { saleId, createRes } = await sellAtCounter(seller);

    expect(JSON.stringify(createRes.body)).not.toContain("unitCost");
    for (const auth of [seller, admin]) {
      const detail = await request(app).get(`/api/admin/store-sales/${saleId}`).set(auth).expect(200);
      expect(JSON.stringify(detail.body)).not.toContain("unitCost");
      const list = await request(app).get("/api/admin/store-sales").set(auth).expect(200);
      expect(JSON.stringify(list.body)).not.toContain("unitCost");
      expect(JSON.stringify(list.body)).not.toContain("4000");
    }
  });

  it("un pedido online guarda el costo, y el cliente y el admin no lo ven", async () => {
    const { auth: admin } = await actor("admin");
    await request(app)
      .put("/api/admin/settings/transfer")
      .set(admin)
      .send({ enabled: true, accountHolder: "Caracol", cbu: "", alias: "caracol.mp" })
      .expect(200);

    const { user: customer, auth: customerAuth } = await actor("customer");
    const p = await product(2500);
    await Cart.create({ user: customer._id, items: [{ product: p._id, variantSku: p.variants[0]!.sku, quantity: 1 }] });
    const checkout = await request(app)
      .post("/api/checkout")
      .set(customerAuth)
      .send({ shippingMethod: "pickup", expectedShippingCost: 0, paymentMethod: "transfer" })
      .expect(201);
    const orderId = checkout.body.order._id as string;

    expect(await costOf("order")).toBe(2500);
    expect(JSON.stringify(checkout.body)).not.toContain("unitCost");

    const mine = await request(app).get(`/api/orders/${orderId}`).set(customerAuth).expect(200);
    const list = await request(app).get("/api/orders").set(customerAuth).expect(200);
    const asAdmin = await request(app).get(`/api/admin/orders/${orderId}`).set(admin).expect(200);
    const adminList = await request(app).get("/api/admin/orders").set(admin).expect(200);
    for (const body of [mine.body, list.body, asAdmin.body, adminList.body]) {
      expect(JSON.stringify(body)).not.toContain("unitCost");
      expect(JSON.stringify(body)).not.toContain("2500");
    }
  });

  it("el costo guardado no cambia cuando el producto cambia de costo después", async () => {
    const { auth } = await actor("admin");
    const { p } = await sellAtCounter(auth);

    await Product.updateOne({ _id: p._id }, { $set: { "variants.0.costPrice": 9999 } });

    expect(await costOf("sale")).toBe(4000);
    const today = dayKey(new Date());
    const report = await request(app).get(`/api/admin/reports/sales?from=${today}&to=${today}`).set(auth).expect(200);
    // Se vendieron 2 a $100 con costo $40: ganancia $120 sobre $200, aunque hoy el costo sea otro.
    expect(report.body.totals).toMatchObject({ revenue: 20000, cost: 8000, profit: 12000, marginPercent: 60 });
  });
});

describe("cuándo se cobró un pedido (paidAt)", () => {
  it("se registra al confirmar una transferencia, y no antes", async () => {
    const { auth: admin } = await actor("admin");
    await request(app)
      .put("/api/admin/settings/transfer")
      .set(admin)
      .send({ enabled: true, accountHolder: "Caracol", cbu: "", alias: "caracol.mp" })
      .expect(200);
    const { user: customer, auth: customerAuth } = await actor("customer");
    const p = await product();
    await Cart.create({ user: customer._id, items: [{ product: p._id, variantSku: p.variants[0]!.sku, quantity: 1 }] });
    const checkout = await request(app)
      .post("/api/checkout")
      .set(customerAuth)
      .send({ shippingMethod: "pickup", expectedShippingCost: 0, paymentMethod: "transfer" })
      .expect(201);
    const orderId = checkout.body.order._id as string;

    expect((await Order.findById(orderId))!.paidAt).toBeUndefined();

    const before = Date.now();
    await request(app).post(`/api/admin/orders/${orderId}/transfer-review`).set(admin).send({ paymentStatus: "approved" }).expect(200);

    const paidAt = (await Order.findById(orderId))!.paidAt!;
    expect(paidAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("un pedido aprobado hoy aparece en el reporte de hoy", async () => {
    const { auth: admin } = await actor("admin");
    await request(app)
      .put("/api/admin/settings/transfer")
      .set(admin)
      .send({ enabled: true, accountHolder: "Caracol", cbu: "", alias: "caracol.mp" })
      .expect(200);
    const { user: customer, auth: customerAuth } = await actor("customer");
    const p = await product(3000);
    await Cart.create({ user: customer._id, items: [{ product: p._id, variantSku: p.variants[0]!.sku, quantity: 2 }] });
    const checkout = await request(app)
      .post("/api/checkout")
      .set(customerAuth)
      .send({ shippingMethod: "pickup", expectedShippingCost: 0, paymentMethod: "transfer" })
      .expect(201);

    const today = dayKey(new Date());
    const sales = () => request(app).get(`/api/admin/reports/sales?from=${today}&to=${today}`).set(admin);

    // Todavía sin cobrar: no es una venta.
    expect((await sales()).body.online.revenue).toBe(0);

    await request(app)
      .post(`/api/admin/orders/${checkout.body.order._id}/transfer-review`)
      .set(admin)
      .send({ paymentStatus: "approved" })
      .expect(200);

    const { body } = await sales();
    expect(body.online).toMatchObject({ count: 1, units: 2, revenue: 20000, cost: 6000, profit: 14000 });
    expect(body.paymentMethods).toEqual([{ channel: "online", method: "transfer", count: 1, revenue: 20000 }]);
  });
});
