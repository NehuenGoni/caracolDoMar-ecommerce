import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { Cart } from "../models/Cart.js";
import { Category } from "../models/Category.js";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { StockMovement } from "../models/StockMovement.js";
import { User } from "../models/User.js";
import { expireStalePendingOrders } from "../services/orderService.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";
import { signAccessToken } from "../utils/jwt.js";

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

const HOUR = 60 * 60 * 1000;
const RECEIPT = "https://res.cloudinary.com/test-cloud/image/upload/v1/caracol/receipts/comprobante.jpg";
const BANK = {
  enabled: true,
  accountHolder: "Caracol do Mar SRL",
  bankName: "Banco Galicia",
  cbu: "0070000030000012345678",
  alias: "caracol.do.mar",
  taxId: "30-12345678-9",
  instructions: "Poné tu número de pedido en el concepto.",
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function adminToken() {
  const admin = await User.create({
    email: `admin-${Date.now()}-${Math.random()}@example.com`,
    password: "supersecreto123",
    firstName: "Ad",
    lastName: "Min",
    role: "admin",
  });
  return signAccessToken({ sub: admin._id.toString(), role: "admin" });
}

async function customer(stock = 4) {
  const user = await User.create({
    email: `cliente-${Date.now()}-${Math.random()}@example.com`,
    password: "supersecreto123",
    firstName: "Cliente",
    lastName: "Test",
  });
  const category = await Category.create({ name: `Cat-${Math.random()}` });
  const unique = Math.random().toString(36).slice(2);
  const product = await Product.create({
    name: `Mantel ${unique}`,
    category,
    variants: [
      {
        sku: `MANTEL-${unique}`,
        attributes: [],
        price: 300000,
        costPrice: 150000,
        stock,
        lowStockThreshold: 1,
      },
    ],
  });
  await Cart.create({ user: user._id, items: [{ product: product._id, variantSku: product.variants[0]!.sku, quantity: 1 }] });
  return { user, product, token: signAccessToken({ sub: user._id.toString(), role: "customer" }) };
}

const stockOf = async (productId: unknown) => (await Product.findById(productId))!.variants[0]!.stock;

async function enableTransfer(admin: string) {
  await request(app).put("/api/admin/settings/transfer").set(auth(admin)).send(BANK).expect(200);
}

/** Cliente con carrito y transferencia habilitada: devuelve el pedido ya creado por checkout. */
async function placeTransferOrder(admin: string, stock = 4) {
  await enableTransfer(admin);
  const c = await customer(stock);
  const res = await request(app)
    .post("/api/checkout")
    .set(auth(c.token))
    .send({ shippingMethod: "pickup", expectedShippingCost: 0, paymentMethod: "transfer" })
    .expect(201);
  return { ...c, orderId: res.body.order._id as string, response: res.body };
}

describe("configuración de la transferencia", () => {
  it("es solo para admins", async () => {
    const c = await customer();
    await request(app).put("/api/admin/settings/transfer").set(auth(c.token)).send(BANK).expect(403);
  });

  it("para habilitarla pide titular y CBU o alias", async () => {
    const admin = await adminToken();
    const put = (body: object) => request(app).put("/api/admin/settings/transfer").set(auth(admin)).send(body);
    await put({ ...BANK, accountHolder: "" }).expect(400);
    await put({ ...BANK, cbu: "", alias: "" }).expect(400);
    await put({ ...BANK, cbu: "123" }).expect(400);
    // Con solo el alias alcanza, y deshabilitada no pide nada.
    await put({ ...BANK, cbu: "" }).expect(200);
    await put({ enabled: false }).expect(200);
  });

  it("GET /settings la incluye", async () => {
    const admin = await adminToken();
    await enableTransfer(admin);
    const res = await request(app).get("/api/admin/settings").set(auth(admin)).expect(200);
    expect(res.body.settings.transfer).toMatchObject({ enabled: true, alias: "caracol.do.mar" });
    expect(res.body.settings.pricing.marginPercent).toBe(100);
  });

  it("guardar la transferencia no pisa la configuración de precios, ni al revés", async () => {
    const admin = await adminToken();
    await request(app)
      .put("/api/admin/settings/pricing")
      .set(auth(admin))
      .send({ marginPercent: 70, roundingStep: 5000, autoPriceOnPurchase: true })
      .expect(200);
    await enableTransfer(admin);
    const res = await request(app).get("/api/admin/settings").set(auth(admin)).expect(200);
    expect(res.body.settings.pricing).toEqual({ marginPercent: 70, roundingStep: 5000, autoPriceOnPurchase: true });
    expect(res.body.settings.transfer.enabled).toBe(true);
  });
});

describe("GET /api/checkout/payment-options", () => {
  it("informa qué métodos hay, sin datos bancarios", async () => {
    const before = await request(app).get("/api/checkout/payment-options").expect(200);
    expect(before.body).toEqual({ mercadoPago: true, transfer: false });

    await enableTransfer(await adminToken());
    const after = await request(app).get("/api/checkout/payment-options").expect(200);
    expect(after.body).toEqual({ mercadoPago: true, transfer: true });
    expect(JSON.stringify(after.body)).not.toContain(BANK.cbu);
  });
});

describe("checkout por transferencia", () => {
  it("rechaza si la transferencia no está habilitada, sin tocar el stock ni el carrito", async () => {
    const c = await customer();
    const res = await request(app)
      .post("/api/checkout")
      .set(auth(c.token))
      .send({ shippingMethod: "pickup", expectedShippingCost: 0, paymentMethod: "transfer" });
    expect(res.status).toBe(400);
    expect(await stockOf(c.product._id)).toBe(4);
    expect((await Cart.findOne({ user: c.user._id }))!.items).toHaveLength(1);
  });

  it("crea el pedido pendiente, reserva el stock, vacía el carrito y no genera link de pago", async () => {
    const admin = await adminToken();
    const { product, user, response, orderId } = await placeTransferOrder(admin);

    expect(response.checkoutUrl).toBeNull();
    expect(response.order).toMatchObject({
      status: "pending",
      paymentMethod: "transfer",
      paymentStatus: "pending",
      total: 300000,
    });

    // 48 horas para subir el comprobante.
    const expiresAt = new Date(response.order.paymentDetails.expiresAt).getTime();
    expect(expiresAt - Date.now()).toBeGreaterThan(47 * HOUR);
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(48 * HOUR);

    expect(await stockOf(product._id)).toBe(3);
    expect((await Cart.findOne({ user: user._id }))!.items).toHaveLength(0);
    const movements = await StockMovement.find({ type: "sale_out" });
    expect(movements).toHaveLength(1);
    expect(movements[0]!.reference).toBe(orderId);
  });

  it("sin stock suficiente falla y no deja nada a medias", async () => {
    const admin = await adminToken();
    await enableTransfer(admin);
    const c = await customer(0);
    await request(app)
      .post("/api/checkout")
      .set(auth(c.token))
      .send({ shippingMethod: "pickup", expectedShippingCost: 0, paymentMethod: "transfer" })
      .expect(400);
    expect(await Order.countDocuments()).toBe(0);
  });
});

describe("datos para transferir", () => {
  it("el dueño del pedido ve la cuenta, el monto y el plazo", async () => {
    const admin = await adminToken();
    const { token, orderId } = await placeTransferOrder(admin);

    const res = await request(app).get(`/api/orders/${orderId}/transfer`).set(auth(token)).expect(200);
    expect(res.body).toMatchObject({ amount: 300000, paymentStatus: "pending" });
    expect(res.body.transfer).toMatchObject({ cbu: BANK.cbu, alias: BANK.alias, accountHolder: BANK.accountHolder });
    expect(res.body.expiresAt).toBeTruthy();
  });

  it("otro cliente no puede verlos", async () => {
    const admin = await adminToken();
    const { orderId } = await placeTransferOrder(admin);
    const other = await customer();
    await request(app).get(`/api/orders/${orderId}/transfer`).set(auth(other.token)).expect(404);
  });

  it("un pedido de Mercado Pago no tiene datos de transferencia", async () => {
    const c = await customer();
    const order = await Order.create({
      orderNumber: 99,
      customer: c.user._id,
      items: [{ product: c.product._id, productName: "x", variantSku: "MANTEL-1", unitPrice: 1, quantity: 1, subtotal: 1 }],
      subtotal: 1,
      shippingCost: 0,
      total: 1,
      status: "pending",
      statusHistory: [{ status: "pending", changedAt: new Date() }],
      paymentMethod: "mercado_pago",
      paymentStatus: "pending",
      shippingMethod: "pickup",
    });
    await request(app).get(`/api/orders/${order._id}/transfer`).set(auth(c.token)).expect(400);
  });
});

describe("comprobante y revisión del admin", () => {
  it("el cliente sube el comprobante y el pedido aparece para revisar", async () => {
    const admin = await adminToken();
    const { token, orderId } = await placeTransferOrder(admin);

    // Todavía sin comprobante: no hay nada para revisar.
    const none = await request(app)
      .get("/api/admin/orders?awaitingTransferReview=true")
      .set(auth(admin))
      .expect(200);
    expect(none.body.total).toBe(0);

    await request(app).patch(`/api/orders/${orderId}/receipt`).set(auth(token)).send({ receiptUrl: RECEIPT }).expect(200);

    const queue = await request(app)
      .get("/api/admin/orders?awaitingTransferReview=true")
      .set(auth(admin))
      .expect(200);
    expect(queue.body.total).toBe(1);
    expect(queue.body.items[0].receiptUrl).toBe(RECEIPT);
  });

  it("solo acepta comprobantes del Cloudinary de la tienda", async () => {
    const admin = await adminToken();
    const { token, orderId } = await placeTransferOrder(admin);
    await request(app)
      .patch(`/api/orders/${orderId}/receipt`)
      .set(auth(token))
      .send({ receiptUrl: "https://evil.example.com/comprobante.jpg" })
      .expect(400);
  });

  it("el admin confirma el pago: el pedido pasa a confirmado", async () => {
    const admin = await adminToken();
    const { token, orderId } = await placeTransferOrder(admin);
    await request(app).patch(`/api/orders/${orderId}/receipt`).set(auth(token)).send({ receiptUrl: RECEIPT }).expect(200);

    const res = await request(app)
      .post(`/api/admin/orders/${orderId}/transfer-review`)
      .set(auth(admin))
      .send({ paymentStatus: "approved" })
      .expect(200);

    expect(res.body.order).toMatchObject({ status: "confirmed", paymentStatus: "approved" });
    expect(res.body.order.statusHistory.at(-1).status).toBe("confirmed");

    // Ya no está en la cola de revisión, ni se puede confirmar de nuevo ni subir otro comprobante.
    const queue = await request(app).get("/api/admin/orders?awaitingTransferReview=true").set(auth(admin)).expect(200);
    expect(queue.body.total).toBe(0);
    await request(app).post(`/api/admin/orders/${orderId}/transfer-review`).set(auth(admin)).send({ paymentStatus: "approved" }).expect(400);
    await request(app).patch(`/api/orders/${orderId}/receipt`).set(auth(token)).send({ receiptUrl: RECEIPT }).expect(400);
  });

  it("al rechazar, el cliente tiene 24 h más y puede subir otro comprobante", async () => {
    const admin = await adminToken();
    const { token, orderId } = await placeTransferOrder(admin);
    await request(app).patch(`/api/orders/${orderId}/receipt`).set(auth(token)).send({ receiptUrl: RECEIPT }).expect(200);

    const rejected = await request(app)
      .post(`/api/admin/orders/${orderId}/transfer-review`)
      .set(auth(admin))
      .send({ paymentStatus: "rejected", note: "El monto no coincide" })
      .expect(200);

    expect(rejected.body.order).toMatchObject({ status: "pending", paymentStatus: "rejected" });
    expect(rejected.body.order.receiptUrl).toBeUndefined();
    expect(rejected.body.order.paymentDetails.rejectedReceipts).toEqual([RECEIPT]);
    const retryMs = new Date(rejected.body.order.paymentDetails.expiresAt).getTime() - Date.now();
    expect(retryMs).toBeGreaterThan(23 * HOUR);
    expect(retryMs).toBeLessThanOrEqual(24 * HOUR);

    // Sube uno nuevo: vuelve a quedar para revisar.
    const retry = await request(app)
      .patch(`/api/orders/${orderId}/receipt`)
      .set(auth(token))
      .send({ receiptUrl: `${RECEIPT}?v=2` })
      .expect(200);
    expect(retry.body.order.paymentStatus).toBe("pending");
    const queue = await request(app).get("/api/admin/orders?awaitingTransferReview=true").set(auth(admin)).expect(200);
    expect(queue.body.total).toBe(1);
  });

  it("solo un admin puede revisar, y solo transferencias", async () => {
    const admin = await adminToken();
    const { token, orderId } = await placeTransferOrder(admin);
    await request(app)
      .post(`/api/admin/orders/${orderId}/transfer-review`)
      .set(auth(token))
      .send({ paymentStatus: "approved" })
      .expect(403);

    await Order.updateOne({ _id: orderId }, { paymentMethod: "mercado_pago" });
    await request(app)
      .post(`/api/admin/orders/${orderId}/transfer-review`)
      .set(auth(admin))
      .send({ paymentStatus: "approved" })
      .expect(400);
  });

  it("un comprobante no se acepta en pedidos de Mercado Pago", async () => {
    const admin = await adminToken();
    const { token, orderId } = await placeTransferOrder(admin);
    await Order.updateOne({ _id: orderId }, { paymentMethod: "mercado_pago" });
    await request(app).patch(`/api/orders/${orderId}/receipt`).set(auth(token)).send({ receiptUrl: RECEIPT }).expect(400);
  });
});

describe("vencimiento de transferencias", () => {
  it("sin comprobante pasado el plazo se cancela y se repone el stock", async () => {
    const admin = await adminToken();
    const { product, orderId } = await placeTransferOrder(admin);
    expect(await stockOf(product._id)).toBe(3);

    // Dentro del plazo: no se toca.
    expect(await expireStalePendingOrders(new Date(Date.now() + 47 * HOUR))).toBe(0);
    expect((await Order.findById(orderId))!.status).toBe("pending");

    expect(await expireStalePendingOrders(new Date(Date.now() + 49 * HOUR))).toBe(1);
    expect((await Order.findById(orderId))!.status).toBe("cancelled");
    expect(await stockOf(product._id)).toBe(4);
  });

  it("con un comprobante esperando revisión no se cancela solo", async () => {
    const admin = await adminToken();
    const { token, product, orderId } = await placeTransferOrder(admin);
    await request(app).patch(`/api/orders/${orderId}/receipt`).set(auth(token)).send({ receiptUrl: RECEIPT }).expect(200);

    expect(await expireStalePendingOrders(new Date(Date.now() + 200 * HOUR))).toBe(0);
    expect((await Order.findById(orderId))!.status).toBe("pending");
    expect(await stockOf(product._id)).toBe(3);
  });

  it("tras un rechazo el pedido vence si no llega otro comprobante en el nuevo plazo", async () => {
    const admin = await adminToken();
    const { token, product, orderId } = await placeTransferOrder(admin);
    await request(app).patch(`/api/orders/${orderId}/receipt`).set(auth(token)).send({ receiptUrl: RECEIPT }).expect(200);
    await request(app)
      .post(`/api/admin/orders/${orderId}/transfer-review`)
      .set(auth(admin))
      .send({ paymentStatus: "rejected" })
      .expect(200);

    expect(await expireStalePendingOrders(new Date(Date.now() + 23 * HOUR))).toBe(0);
    expect(await expireStalePendingOrders(new Date(Date.now() + 25 * HOUR))).toBe(1);
    expect(await stockOf(product._id)).toBe(4);
  });

  it("no hay comprobantes para pedidos cancelados", async () => {
    const admin = await adminToken();
    const { token, orderId } = await placeTransferOrder(admin);
    await expireStalePendingOrders(new Date(Date.now() + 49 * HOUR));
    await request(app).patch(`/api/orders/${orderId}/receipt`).set(auth(token)).send({ receiptUrl: RECEIPT }).expect(400);
  });
});

describe("transferencia que llega después de que el pedido venció", () => {
  it("el admin la confirma: se reserva el stock de nuevo y el pedido se confirma", async () => {
    const admin = await adminToken();
    const { product, orderId } = await placeTransferOrder(admin);
    await expireStalePendingOrders(new Date(Date.now() + 49 * HOUR));
    expect(await stockOf(product._id)).toBe(4);

    const res = await request(app)
      .post(`/api/admin/orders/${orderId}/transfer-review`)
      .set(auth(admin))
      .send({ paymentStatus: "approved", note: "Llegó la plata fuera de plazo" })
      .expect(200);

    expect(res.body.order).toMatchObject({ status: "confirmed", paymentStatus: "approved" });
    expect(await stockOf(product._id)).toBe(3);
  });

  it("si ya no hay stock, avisa y el pedido sigue cancelado", async () => {
    const admin = await adminToken();
    const { product, orderId } = await placeTransferOrder(admin);
    await expireStalePendingOrders(new Date(Date.now() + 49 * HOUR));
    // Alguien más se llevó todo el stock mientras tanto.
    await Product.updateOne({ _id: product._id }, { $set: { "variants.0.stock": 0 } });

    await request(app)
      .post(`/api/admin/orders/${orderId}/transfer-review`)
      .set(auth(admin))
      .send({ paymentStatus: "approved" })
      .expect(400);

    const order = await Order.findById(orderId);
    expect(order).toMatchObject({ status: "cancelled", paymentStatus: "pending" });
    expect(await stockOf(product._id)).toBe(0);
  });
});
