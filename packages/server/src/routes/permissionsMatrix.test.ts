import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { Category } from "../models/Category.js";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { Supplier } from "../models/Supplier.js";
import { User } from "../models/User.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";
import { signAccessToken } from "../utils/jwt.js";

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

type Role = "admin" | "seller" | "customer";
type Method = "get" | "post" | "patch" | "put" | "delete";

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

const ID = "64b7f0f0f0f0f0f0f0f0f0f0";

/** Todo lo que el vendedor NO puede hacer, con el permiso que lo bloquea. */
const SELLER_FORBIDDEN: [Method, string, object | undefined][] = [
  // catálogo
  ["post", "/api/admin/products", { name: "X" }],
  ["patch", `/api/admin/products/${ID}`, { name: "X" }],
  ["delete", `/api/admin/products/${ID}`, undefined],
  ["post", "/api/uploads/products/sign", undefined],
  ["get", "/api/admin/categories", undefined],
  ["post", "/api/admin/categories", { name: "X" }],
  // stock
  ["post", "/api/inventory/adjustments", { productId: ID, variantSku: "X", quantityChange: 1 }],
  // ventas
  ["get", "/api/admin/store-sales/summary", undefined],
  ["post", `/api/admin/store-sales/${ID}/void`, { reason: "x" }],
  // pedidos: todo lo que revierte plata o stock
  ["post", `/api/admin/orders/${ID}/transfer-review`, { paymentStatus: "approved" }],
  ["post", `/api/admin/orders/${ID}/reactivate`, undefined],
  ["post", `/api/admin/orders/${ID}/refund`, undefined],
  // compras y proveedores
  ["get", "/api/admin/suppliers", undefined],
  ["post", "/api/admin/suppliers", { name: "X" }],
  ["get", "/api/supplier-purchases", undefined],
  ["post", "/api/supplier-purchases", { supplierName: "X", items: [] }],
  ["get", "/api/admin/invoice-imports", undefined],
  ["get", "/api/admin/invoice-imports/status", undefined],
  // configuración
  ["get", "/api/admin/settings", undefined],
  ["put", "/api/admin/settings/pricing", { marginPercent: 1, roundingStep: 1, autoPriceOnPurchase: false }],
  ["put", "/api/admin/settings/transfer", { enabled: false }],
  ["get", "/api/admin/shipping/settings", undefined],
  // equipo
  ["get", "/api/admin/staff", undefined],
  ["post", "/api/admin/invites", { email: "x@example.com" }],
  ["patch", `/api/admin/staff/${ID}/role`, { role: "admin" }],
  ["post", `/api/admin/staff/${ID}/revoke`, undefined],
];

/** Lo que sí puede: alcanza con que el permiso no lo frene (después puede dar 404 o 400 por los datos). */
const SELLER_ALLOWED: [Method, string][] = [
  ["get", "/api/admin/products"],
  ["get", `/api/admin/products/${ID}`],
  ["get", "/api/admin/orders"],
  ["get", `/api/admin/orders/${ID}`],
  ["get", "/api/inventory/movements"],
  ["get", "/api/inventory/low-stock"],
  ["get", "/api/admin/cash-sessions/current"],
  ["get", "/api/admin/cash-sessions"],
  ["get", "/api/admin/store-sales"],
  ["get", "/api/admin/store-sales/lookup?code=X"],
  ["get", `/api/admin/store-sales/${ID}`],
];

function send(method: Method, path: string, auth: Record<string, string>, body?: object) {
  const req = request(app)[method](path).set(auth);
  return body === undefined ? req : req.send(body);
}

describe("lo que el vendedor NO puede hacer", () => {
  it.each(SELLER_FORBIDDEN)("%s %s → 403", async (method, path, body) => {
    const { auth } = await actor("seller");
    expect((await send(method, path, auth, body)).status).toBe(403);
  });
});

describe("lo que el vendedor SÍ puede hacer", () => {
  it.each(SELLER_ALLOWED)("%s %s → permitido", async (method, path) => {
    const { auth } = await actor("seller");
    const status = (await send(method, path, auth)).status;
    expect([401, 403]).not.toContain(status);
  });

  it("el cliente no puede ni lo de solo lectura del panel", async () => {
    const { auth } = await actor("customer");
    for (const [method, path] of SELLER_ALLOWED) {
      expect((await send(method, path, auth)).status, `${method} ${path}`).toBe(403);
    }
  });

  it("sin sesión todo da 401", async () => {
    for (const [method, path] of SELLER_ALLOWED) {
      expect((await request(app)[method](path)).status, `${method} ${path}`).toBe(401);
    }
  });

  it("el admin puede todo lo anterior", async () => {
    const { auth } = await actor("admin");
    for (const [method, path, body] of SELLER_FORBIDDEN) {
      const status = (await send(method, path, auth, body)).status;
      expect(status, `${method} ${path}`).not.toBe(403);
      expect(status, `${method} ${path}`).not.toBe(401);
    }
  });
});

describe("el vendedor no ve costos ni proveedores", () => {
  async function productWithCost() {
    const supplier = await Supplier.create({ name: "Mayorista secreto" });
    const category = await Category.create({ name: "Cat" });
    const product = await Product.create({
      name: "Sahumerio",
      category,
      supplier: supplier._id,
      variants: [{ sku: "SAH-1", attributes: [], price: 50000, costPrice: 23456, stock: 5, lowStockThreshold: 1 }],
    });
    return { product, supplier };
  }

  it("el listado y el detalle del panel salen sin costPrice ni proveedor", async () => {
    const { product, supplier } = await productWithCost();
    const { auth } = await actor("seller");

    const list = await send("get", "/api/admin/products", auth);
    const detail = await send("get", `/api/admin/products/${product._id}`, auth);

    for (const res of [list, detail]) {
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain("costPrice");
      expect(text).not.toContain("23456");
      expect(text).not.toContain(supplier._id.toString());
    }
    // Pero sí lo que necesita para vender.
    expect(detail.body.product.variants[0]).toMatchObject({ sku: "SAH-1", price: 50000, stock: 5 });
  });

  it("el admin sí los ve", async () => {
    const { product, supplier } = await productWithCost();
    const { auth } = await actor("admin");

    const detail = await send("get", `/api/admin/products/${product._id}`, auth);

    expect(detail.body.product.variants[0].costPrice).toBe(23456);
    expect(detail.body.product.supplier).toBe(supplier._id.toString());
  });

  it("tampoco los ve por la ficha pública, aunque mande su token", async () => {
    const { product } = await productWithCost();
    const { auth } = await actor("seller");

    const res = await send("get", `/api/products/${product.slug}`, auth);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("costPrice");
  });
});

describe("un día de trabajo del vendedor", () => {
  it("abre la caja, cobra, ve el historial y hace una devolución; anular le corresponde al admin", async () => {
    const category = await Category.create({ name: "Cat" });
    const product = await Product.create({
      name: "Vela",
      category,
      variants: [{ sku: "VELA-1", attributes: [], price: 100000, costPrice: 40000, stock: 10, lowStockThreshold: 1 }],
    });
    const { auth: seller } = await actor("seller");
    const { auth: admin } = await actor("admin");

    await request(app).post("/api/admin/cash-sessions").set(seller).send({ openingAmount: 0 }).expect(201);

    const sale = await request(app)
      .post("/api/admin/store-sales")
      .set(seller)
      .send({ items: [{ productId: product._id.toString(), variantSku: "VELA-1", quantity: 2 }], paymentMethod: "debit" })
      .expect(201);
    const saleId = sale.body.sale._id as string;

    expect((await request(app).get("/api/admin/store-sales").set(seller)).body.total).toBe(1);

    await request(app)
      .post(`/api/admin/store-sales/${saleId}/returns`)
      .set(seller)
      .send({ items: [{ variantSku: "VELA-1", quantity: 1 }], refundMethod: "cash", reason: "No le gustó" })
      .expect((res) => {
        // La devolución es del vendedor: no la frena el permiso (si falla es por los datos).
        expect([401, 403]).not.toContain(res.status);
      });

    // Anular la venta entera no.
    await request(app).post(`/api/admin/store-sales/${saleId}/void`).set(seller).send({ reason: "Error" }).expect(403);
    await request(app).post(`/api/admin/store-sales/${saleId}/void`).set(admin).send({ reason: "Error" }).expect((res) => {
      expect([401, 403]).not.toContain(res.status);
    });

    await request(app).post("/api/admin/cash-sessions/current/close").set(seller).send({ countedCash: 0 }).expect((res) => {
      expect([401, 403]).not.toContain(res.status);
    });
  });

  it("avanza los pedidos pero no puede cancelarlos", async () => {
    const { user: customer } = await actor("customer");
    const order = await Order.create({
      orderNumber: 1,
      customer: customer._id,
      items: [{ product: ID, productName: "Vela", variantSku: "VELA-1", unitPrice: 1000, quantity: 1, subtotal: 1000 }],
      subtotal: 1000,
      shippingCost: 0,
      total: 1000,
      status: "confirmed",
      statusHistory: [{ status: "confirmed", changedAt: new Date() }],
      paymentMethod: "mercado_pago",
      paymentStatus: "approved",
      shippingMethod: "pickup",
    });
    const { auth: seller } = await actor("seller");
    const { auth: admin } = await actor("admin");

    const prepared = await request(app)
      .patch(`/api/admin/orders/${order._id}/status`)
      .set(seller)
      .send({ status: "preparing" })
      .expect(200);
    expect(prepared.body.order.status).toBe("preparing");

    const cancel = await request(app)
      .patch(`/api/admin/orders/${order._id}/status`)
      .set(seller)
      .send({ status: "cancelled" })
      .expect(403);
    expect(cancel.body.message).toContain("administrador");
    expect((await Order.findById(order._id))!.status).toBe("preparing");

    await request(app).patch(`/api/admin/orders/${order._id}/status`).set(admin).send({ status: "cancelled" }).expect(200);
  });
});
