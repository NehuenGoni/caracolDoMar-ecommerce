import { Types } from "mongoose";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { Category } from "../models/Category.js";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { StockMovement } from "../models/StockMovement.js";
import { StoreSale } from "../models/StoreSale.js";
import { User } from "../models/User.js";
import { clearTestDB, closeTestDB, connectTestDB } from "../test/dbTestUtils.js";
import { signAccessToken } from "../utils/jwt.js";

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

// ---------- fixtures ----------
let saleNumber = 0;
let orderNumber = 0;
const productA = new Types.ObjectId();
const productB = new Types.ObjectId();

const line = (product: Types.ObjectId, sku: string, quantity: number, subtotal: number, unitCost?: number) => ({
  product,
  productName: `Producto ${sku}`,
  variantSku: sku,
  variantLabel: "",
  unitPrice: Math.round(subtotal / quantity),
  quantity,
  discount: 0,
  subtotal,
  ...(unitCost !== undefined && { unitCost }),
});

function storeSale(overrides: Record<string, unknown> & { createdAt: Date }) {
  const items = (overrides.items as ReturnType<typeof line>[] | undefined) ?? [line(productA, "A", 1, 10000, 4000)];
  const subtotal = items.reduce((n, i) => n + i.subtotal, 0);
  return StoreSale.create({
    saleNumber: ++saleNumber,
    cashSession: new Types.ObjectId(),
    seller: new Types.ObjectId(),
    items,
    subtotal,
    total: subtotal,
    paymentMethod: "cash",
    status: "completed",
    ...overrides,
  });
}

function order(overrides: Record<string, unknown> & { createdAt: Date }) {
  const items = (overrides.items as ReturnType<typeof line>[] | undefined) ?? [line(productA, "A", 1, 10000, 4000)];
  const subtotal = items.reduce((n, i) => n + i.subtotal, 0);
  const shippingCost = (overrides.shippingCost as number | undefined) ?? 0;
  return Order.create({
    orderNumber: ++orderNumber,
    customer: new Types.ObjectId(),
    items: items.map(({ discount: _discount, ...i }) => i),
    subtotal,
    shippingCost,
    total: subtotal + shippingCost,
    status: "delivered",
    statusHistory: [{ status: "delivered", changedAt: new Date() }],
    paymentMethod: "mercado_pago",
    paymentStatus: "approved",
    shippingMethod: "pickup",
    ...overrides,
  });
}

/**
 * Octubre de 2026. Cuentas (en centavos):
 *
 * LOCAL
 *  S1  5/oct   A×2 (20000, costo 4000 c/u) + B×1 (8000, costo 3000)      efectivo   28000   costo 11000
 *  S2  6/oct   A×1                                                       débito     10000   costo  4000
 *  S3  20/oct  A×2 con 10% de descuento general (18000), devuelven 1 A   crédito     9000   costo  4000
 *  S4  7/oct   ANULADA (no cuenta)
 *  S5  31/oct 23:30 hs de Argentina (ya es 1/nov en UTC)                 efectivo   10000   costo  4000
 *  S6  20/oct  vendida SIN costo registrado (A×1, 10000)                 efectivo   10000   sin costo
 * ONLINE
 *  O1  10/oct  Mercado Pago  A×1 (10000, costo 4000) + envío 50000
 *  O2  12/oct  transferencia B×2 (16000, costo 3000 c/u) + envío 20000
 *  O6  creado 30/sep, COBRADO 2/oct, Mercado Pago A×3 (30000, costo 4000 c/u)
 *  (cancelado, sin cobrar y reembolsado: no cuentan)
 */
async function seedOctober() {
  await storeSale({
    createdAt: new Date("2026-10-05T15:00:00.000Z"),
    items: [line(productA, "A", 2, 20000, 4000), line(productB, "B", 1, 8000, 3000)],
  });
  await storeSale({ createdAt: new Date("2026-10-06T15:00:00.000Z"), paymentMethod: "debit" });
  await storeSale({
    createdAt: new Date("2026-10-20T15:00:00.000Z"),
    paymentMethod: "credit",
    items: [line(productA, "A", 2, 20000, 4000)],
    total: 18000,
    status: "partially_returned",
    returns: [
      {
        items: [{ variantSku: "A", quantity: 1, amount: 9000 }],
        amount: 9000,
        refundMethod: "cash",
        cashSession: new Types.ObjectId(),
        createdBy: new Types.ObjectId(),
      },
    ],
  });
  await storeSale({ createdAt: new Date("2026-10-07T15:00:00.000Z"), status: "voided", items: [line(productA, "A", 5, 50000, 4000)] });
  await storeSale({ createdAt: new Date("2026-11-01T02:30:00.000Z") }); // 31/oct 23:30 en Argentina
  await storeSale({ createdAt: new Date("2026-10-21T15:00:00.000Z"), items: [line(productA, "A", 1, 10000)] });

  await order({ createdAt: new Date("2026-10-10T12:00:00.000Z"), paidAt: new Date("2026-10-10T12:30:00.000Z"), shippingCost: 50000 });
  await order({
    createdAt: new Date("2026-10-12T12:00:00.000Z"),
    paidAt: new Date("2026-10-12T14:00:00.000Z"),
    paymentMethod: "transfer",
    shippingCost: 20000,
    items: [line(productB, "B", 2, 16000, 3000)],
  });
  await order({
    createdAt: new Date("2026-09-30T12:00:00.000Z"),
    paidAt: new Date("2026-10-02T12:00:00.000Z"),
    items: [line(productA, "A", 3, 30000, 4000)],
  });
  // No cuentan:
  await order({ createdAt: new Date("2026-10-11T12:00:00.000Z"), paidAt: new Date("2026-10-11T12:00:00.000Z"), status: "cancelled" });
  await order({ createdAt: new Date("2026-10-11T12:00:00.000Z"), status: "pending", paymentStatus: "pending" });
  await order({ createdAt: new Date("2026-10-11T12:00:00.000Z"), paidAt: new Date("2026-10-11T12:00:00.000Z"), paymentStatus: "refunded" });
}

const OCT = "from=2026-10-01&to=2026-10-31";

describe("permisos", () => {
  const paths = [
    "/api/admin/reports/sales",
    "/api/admin/reports/top-products",
    "/api/admin/reports/inventory",
    "/api/admin/reports/slow-movers",
    "/api/admin/reports/export?kind=sales",
  ];

  it("sin sesión 401; cliente y vendedor 403 (los reportes tienen costos y márgenes)", async () => {
    const customer = await actor("customer");
    const seller = await actor("seller");
    for (const path of paths) {
      expect((await request(app).get(path)).status, path).toBe(401);
      expect((await request(app).get(path).set(customer.auth)).status, path).toBe(403);
      expect((await request(app).get(path).set(seller.auth)).status, path).toBe(403);
    }
  });

  it("el admin puede ver todos", async () => {
    const { auth } = await actor("admin");
    for (const path of paths) {
      expect((await request(app).get(path).set(auth)).status, path).toBe(200);
    }
  });
});

describe("GET /reports/sales", () => {
  it("suma local y online sin contar anuladas, canceladas, sin cobrar ni reembolsadas", async () => {
    await seedOctober();
    const { auth } = await actor("admin");

    const res = await request(app).get(`/api/admin/reports/sales?${OCT}`).set(auth).expect(200);

    // Local: 28000 + 10000 + 9000 + 10000 + 10000 = 67000 | Online: 10000 + 16000 + 30000 = 56000
    expect(res.body.store).toMatchObject({ count: 5, units: 7, revenue: 67000 });
    expect(res.body.online).toMatchObject({ count: 3, units: 6, revenue: 56000, cost: 22000 });
    expect(res.body.totals).toMatchObject({ count: 8, units: 13, revenue: 123000 });
  });

  it("la ganancia y el margen salen del costo que tenía cada producto al venderse", async () => {
    await seedOctober();
    const { auth } = await actor("admin");

    const { body } = await request(app).get(`/api/admin/reports/sales?${OCT}`).set(auth);

    // Con costo: 123000 - 10000 (S6 sin costo) = 113000 de ventas; costo 11000+4000+4000+4000 + 22000 = 45000
    expect(body.totals.cost).toBe(45000);
    expect(body.totals.uncostedRevenue).toBe(10000);
    expect(body.totals.profit).toBe(113000 - 45000);
    expect(body.totals.marginPercent).toBe(60.2); // 68000 / 113000
    expect(body.totals.avgTicket).toBe(Math.round(123000 / 8));
  });

  it("el descuento general y la devolución parcial restan de lo cobrado", async () => {
    await seedOctober();
    const { auth } = await actor("admin");

    // El 20/oct: venta de 20000 con 10% de descuento (18000) y se devolvió 1 de 2 unidades (9000).
    const { body } = await request(app)
      .get("/api/admin/reports/sales?from=2026-10-20&to=2026-10-20&groupBy=day")
      .set(auth);

    expect(body.store.revenue).toBe(9000);
    expect(body.store.units).toBe(1);
    expect(body.store.cost).toBe(4000);
  });

  it("los envíos cobrados van aparte de las ventas", async () => {
    await seedOctober();
    const { auth } = await actor("admin");
    const { body } = await request(app).get(`/api/admin/reports/sales?${OCT}`).set(auth);
    expect(body.shippingCollected).toBe(70000);
    expect(body.online.revenue).toBe(56000); // sin el envío
  });

  it("un pedido cuenta el día que se cobró, no el que se creó", async () => {
    await seedOctober();
    const { auth } = await actor("admin");

    // O6 se creó el 30/sep pero se cobró el 2/oct.
    const sept = await request(app).get("/api/admin/reports/sales?from=2026-09-01&to=2026-09-30").set(auth);
    expect(sept.body.online.revenue).toBe(0);

    const oct2 = await request(app).get("/api/admin/reports/sales?from=2026-10-02&to=2026-10-02").set(auth);
    expect(oct2.body.online.revenue).toBe(30000);
  });

  it("una venta de las 23:30 de Argentina cuenta ese día aunque en UTC ya sea el siguiente", async () => {
    await seedOctober();
    const { auth } = await actor("admin");

    const last = await request(app).get("/api/admin/reports/sales?from=2026-10-31&to=2026-10-31").set(auth);
    expect(last.body.store.revenue).toBe(10000);

    const nov = await request(app).get("/api/admin/reports/sales?from=2026-11-01&to=2026-11-01").set(auth);
    expect(nov.body.store.revenue).toBe(0);
  });

  it("reparte por canal y medio de pago", async () => {
    await seedOctober();
    const { auth } = await actor("admin");
    const { body } = await request(app).get(`/api/admin/reports/sales?${OCT}`).set(auth);

    const get = (channel: string, method: string) =>
      body.paymentMethods.find((m: { channel: string; method: string }) => m.channel === channel && m.method === method);
    expect(get("store", "cash")).toMatchObject({ count: 3, revenue: 48000 }); // S1 + S5 + S6
    expect(get("store", "debit")).toMatchObject({ count: 1, revenue: 10000 });
    expect(get("store", "credit")).toMatchObject({ count: 1, revenue: 9000 });
    expect(get("online", "mercado_pago")).toMatchObject({ count: 2, revenue: 40000 });
    expect(get("online", "transfer")).toMatchObject({ count: 1, revenue: 16000 });
    // Ordenado de mayor a menor.
    const revenues = body.paymentMethods.map((m: { revenue: number }) => m.revenue);
    expect(revenues).toEqual([...revenues].sort((a, b) => b - a));
  });

  it("la serie por día incluye los días sin ventas, y su suma da el total", async () => {
    await seedOctober();
    const { auth } = await actor("admin");
    const { body } = await request(app).get(`/api/admin/reports/sales?${OCT}&groupBy=day`).set(auth);

    expect(body.series).toHaveLength(31);
    expect(body.series[0]).toMatchObject({ period: "2026-10-01", revenue: 0, count: 0 });
    expect(body.series.find((p: { period: string }) => p.period === "2026-10-02")).toMatchObject({ online: 30000, store: 0 });
    expect(body.series.find((p: { period: string }) => p.period === "2026-10-05")).toMatchObject({ store: 28000, online: 0, cost: 11000, profit: 17000 });
    const sum = body.series.reduce((n: number, p: { revenue: number }) => n + p.revenue, 0);
    expect(sum).toBe(body.totals.revenue);
  });

  it("agrupa por semana (lunes a domingo) y por mes", async () => {
    await seedOctober();
    const { auth } = await actor("admin");

    const weeks = await request(app).get(`/api/admin/reports/sales?${OCT}&groupBy=week`).set(auth);
    // 1/oct/2026 es jueves: la primera semana arranca el lunes 28/sep.
    expect(weeks.body.series[0].period).toBe("2026-09-28");
    expect(weeks.body.series.map((p: { period: string }) => p.period)).toEqual([
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]);
    const weekSum = weeks.body.series.reduce((n: number, p: { revenue: number }) => n + p.revenue, 0);
    expect(weekSum).toBe(weeks.body.totals.revenue);

    const months = await request(app).get(`/api/admin/reports/sales?${OCT}&groupBy=month`).set(auth);
    expect(months.body.series).toHaveLength(1);
    expect(months.body.series[0]).toMatchObject({ period: "2026-10", revenue: 123000 });
  });

  it("sin ventas devuelve ceros, no errores ni NaN", async () => {
    const { auth } = await actor("admin");
    const { body } = await request(app).get(`/api/admin/reports/sales?${OCT}`).set(auth).expect(200);
    expect(body.totals).toEqual({
      count: 0,
      units: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      marginPercent: null,
      avgTicket: 0,
      uncostedRevenue: 0,
    });
    expect(body.paymentMethods).toEqual([]);
  });

  it("por defecto es el mes en curso, agrupado por día", async () => {
    const { auth } = await actor("admin");
    const { body } = await request(app).get("/api/admin/reports/sales").set(auth).expect(200);
    expect(body.range.groupBy).toBe("day");
    expect(body.range.from.endsWith("-01")).toBe(true);
    expect(body.series.length).toBeGreaterThan(0);
  });

  it("valida el período", async () => {
    const { auth } = await actor("admin");
    const get = (query: string) => request(app).get(`/api/admin/reports/sales?${query}`).set(auth);
    expect((await get("from=hoy")).status).toBe(400);
    expect((await get("from=2026-02-30&to=2026-03-01")).status).toBe(400);
    expect((await get("from=2026-10-20&to=2026-10-10")).status).toBe(400);
    expect((await get("from=2024-01-01&to=2026-01-01")).status).toBe(400);
    expect((await get("from=2026-10-01&to=2026-10-31&groupBy=hora")).status).toBe(400);
  });
});

describe("GET /reports/top-products", () => {
  it("ordena por ventas, con unidades, costo, ganancia y margen por producto", async () => {
    await seedOctober();
    const { auth } = await actor("admin");

    const { body } = await request(app).get(`/api/admin/reports/top-products?${OCT}`).set(auth).expect(200);

    expect(body.products).toHaveLength(2);
    const [a, b] = body.products;
    // A: 20000 + 10000 + 9000 + 10000 + 10000 (S6 sin costo) + 10000 (O1) + 30000 (O6) = 99000
    expect(a).toMatchObject({ variantSku: "A", units: 10, revenue: 99000, cost: 36000 });
    // Sin la venta sin costo: 89000 de base con costo → ganancia 53000
    expect(a.profit).toBe(89000 - 36000);
    expect(a.marginPercent).toBe(59.6);
    // B: 8000 (S1) + 16000 (O2)
    expect(b).toMatchObject({ variantSku: "B", units: 3, revenue: 24000, cost: 9000, profit: 15000, marginPercent: 62.5 });
  });

  it("la suma de los productos coincide con las ventas totales", async () => {
    await seedOctober();
    const { auth } = await actor("admin");
    const sales = await request(app).get(`/api/admin/reports/sales?${OCT}`).set(auth);
    const top = await request(app).get(`/api/admin/reports/top-products?${OCT}&limit=100`).set(auth);

    const sum = top.body.products.reduce((n: number, p: { revenue: number }) => n + p.revenue, 0);
    expect(sum).toBe(sales.body.totals.revenue);
  });

  it("ordena por unidades o por ganancia, y respeta el límite", async () => {
    await seedOctober();
    const { auth } = await actor("admin");

    const byUnits = await request(app).get(`/api/admin/reports/top-products?${OCT}&sort=units&limit=1`).set(auth);
    expect(byUnits.body.products).toHaveLength(1);
    expect(byUnits.body.products[0].variantSku).toBe("A");

    const byProfit = await request(app).get(`/api/admin/reports/top-products?${OCT}&sort=profit`).set(auth);
    expect(byProfit.body.products.map((p: { variantSku: string }) => p.variantSku)).toEqual(["A", "B"]);
  });

  it("no incluye productos totalmente devueltos", async () => {
    await storeSale({
      createdAt: new Date("2026-10-05T15:00:00.000Z"),
      status: "returned",
      items: [line(productB, "B", 1, 8000, 3000)],
      returns: [
        {
          items: [{ variantSku: "B", quantity: 1, amount: 8000 }],
          amount: 8000,
          refundMethod: "cash",
          cashSession: new Types.ObjectId(),
          createdBy: new Types.ObjectId(),
        },
      ],
    });
    const { auth } = await actor("admin");
    const { body } = await request(app).get(`/api/admin/reports/top-products?${OCT}`).set(auth);
    expect(body.products).toEqual([]);
  });

  it("valida el orden y el límite", async () => {
    const { auth } = await actor("admin");
    expect((await request(app).get("/api/admin/reports/top-products?sort=raro").set(auth)).status).toBe(400);
    expect((await request(app).get("/api/admin/reports/top-products?limit=0").set(auth)).status).toBe(400);
    expect((await request(app).get("/api/admin/reports/top-products?limit=1000").set(auth)).status).toBe(400);
  });
});

describe("GET /reports/inventory", () => {
  async function stock() {
    const sahumerios = await Category.create({ name: "Sahumerios" });
    const velas = await Category.create({ name: "Velas" });
    const variant = (sku: string, price: number, costPrice: number, stockUnits: number) => ({
      sku,
      attributes: [],
      price,
      costPrice,
      stock: stockUnits,
      lowStockThreshold: 0,
    });
    await Product.create({ name: "Sándalo", category: sahumerios, variants: [variant("SAN-1", 10000, 4000, 10), variant("SAN-2", 12000, 5000, 4)] });
    await Product.create({ name: "Vela", category: velas, variants: [variant("VEL-1", 30000, 10000, 3)] });
    const sal = await Product.create({ name: "Sal", category: velas, variants: [variant("SAL-1", 1000, 300, 100)] });
    // Un kit no tiene stock propio: no debe contarse.
    await Product.create({
      name: "Kit",
      category: velas,
      isBundle: true,
      bundleItems: [{ product: sal._id, variantSku: "SAL-1", quantity: 2 }],
      variants: [variant("KIT-1", 5000, 600, 0)],
    });
  }

  it("valoriza el stock a costo y a precio de lista, por categoría y en total", async () => {
    await stock();
    const { auth } = await actor("admin");

    const { body } = await request(app).get("/api/admin/reports/inventory").set(auth).expect(200);

    // Sahumerios: 10×4000 + 4×5000 = 60000 a costo; 10×10000 + 4×12000 = 148000 a lista
    // Velas: 3×10000 + 100×300 = 60000 a costo; 3×30000 + 100×1000 = 190000 a lista
    expect(body.totals).toEqual({
      variants: 4,
      units: 117,
      costValue: 120000,
      retailValue: 338000,
      potentialProfit: 218000,
    });
    expect(body.byCategory.map((c: { categoryName: string }) => c.categoryName)).toHaveLength(2);
    const sah = body.byCategory.find((c: { categoryName: string }) => c.categoryName === "Sahumerios");
    expect(sah).toMatchObject({ variants: 2, units: 14, costValue: 60000, retailValue: 148000 });
  });

  it("sin productos devuelve ceros", async () => {
    const { auth } = await actor("admin");
    const { body } = await request(app).get("/api/admin/reports/inventory").set(auth).expect(200);
    expect(body.totals).toMatchObject({ variants: 0, units: 0, costValue: 0, retailValue: 0 });
    expect(body.byCategory).toEqual([]);
  });
});

describe("GET /reports/slow-movers", () => {
  async function productWithStock(name: string, sku: string, stock: number, costPrice: number, createdDaysAgo: number) {
    const category = await Category.create({ name: `Cat ${name}` });
    const product = await Product.create({
      name,
      category,
      createdAt: new Date(Date.now() - createdDaysAgo * 24 * 60 * 60 * 1000),
      variants: [{ sku, attributes: [{ name: "Aroma", value: "Lavanda" }], price: costPrice * 2, costPrice, stock, lowStockThreshold: 0 }],
    });
    return product;
  }

  const saleMovement = (product: Types.ObjectId, sku: string, daysAgo: number) =>
    StockMovement.collection.insertOne({
      product,
      variantSku: sku,
      type: "sale_out",
      quantity: -1,
      previousStock: 5,
      newStock: 4,
      createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    });

  it("lista lo que tiene stock y no se vende hace más de N días, ordenado por plata parada", async () => {
    const { auth } = await actor("admin");
    const viejoCaro = await productWithStock("Estatua", "EST-1", 2, 50000, 200); // nunca se vendió
    const viejoBarato = await productWithStock("Vela", "VEL-1", 10, 1000, 200);
    await saleMovement(viejoBarato._id, "VEL-1", 90); // última venta hace 90 días
    const reciente = await productWithStock("Sahumerio", "SAH-1", 10, 500, 200);
    await saleMovement(reciente._id, "SAH-1", 5); // se vendió hace poco → no entra
    void viejoCaro;

    const { body } = await request(app).get("/api/admin/reports/slow-movers?days=60").set(auth).expect(200);

    expect(body.items.map((i: { variantSku: string }) => i.variantSku)).toEqual(["EST-1", "VEL-1"]);
    expect(body.items[0]).toMatchObject({ stock: 2, costValue: 100000, lastSaleAt: null, variantLabel: "Lavanda" });
    expect(body.items[0].daysWithoutSales).toBeGreaterThanOrEqual(199);
    expect(body.items[1].lastSaleAt).not.toBeNull();
    expect(body.items[1].daysWithoutSales).toBeGreaterThanOrEqual(89);
    expect(body.items[1].daysWithoutSales).toBeLessThanOrEqual(91);
  });

  it("algo recién cargado que todavía no se vendió no es 'sin movimiento'", async () => {
    const { auth } = await actor("admin");
    await productWithStock("Nuevo", "NEW-1", 5, 1000, 3);
    const { body } = await request(app).get("/api/admin/reports/slow-movers?days=60").set(auth);
    expect(body.items).toEqual([]);
  });

  it("no incluye lo que no tiene stock, y el período es configurable", async () => {
    const { auth } = await actor("admin");
    await productWithStock("Agotado", "AGO-1", 0, 1000, 300);
    const vendido = await productWithStock("Vela", "VEL-1", 3, 1000, 300);
    await saleMovement(vendido._id, "VEL-1", 20);

    expect((await request(app).get("/api/admin/reports/slow-movers?days=60").set(auth)).body.items).toEqual([]);
    const strict = await request(app).get("/api/admin/reports/slow-movers?days=10").set(auth);
    expect(strict.body.items.map((i: { variantSku: string }) => i.variantSku)).toEqual(["VEL-1"]);
  });

  it("respeta el límite y valida los parámetros", async () => {
    const { auth } = await actor("admin");
    await productWithStock("A", "A-1", 1, 100, 300);
    await productWithStock("B", "B-1", 1, 200, 300);
    expect((await request(app).get("/api/admin/reports/slow-movers?limit=1").set(auth)).body.items).toHaveLength(1);
    expect((await request(app).get("/api/admin/reports/slow-movers?days=0").set(auth)).status).toBe(400);
    expect((await request(app).get("/api/admin/reports/slow-movers?days=5000").set(auth)).status).toBe(400);
  });
});

describe("GET /reports/export (CSV)", () => {
  it("exporta las ventas listas para Excel: BOM, punto y coma, coma decimal, y la fila de totales", async () => {
    await seedOctober();
    const { auth } = await actor("admin");

    const res = await request(app).get(`/api/admin/reports/export?kind=sales&${OCT}&groupBy=month`).set(auth).expect(200);

    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="caracol-ventas-2026-10-01_2026-10-31.csv"');
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.text.startsWith("﻿")).toBe(true);
    const lines = res.text.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("Período;Ventas online;Ventas del local;Ventas totales;Costo;Ganancia;Cantidad de ventas");
    expect(lines[1]).toBe("2026-10;560,00;670,00;1230,00;450,00;680,00;8");
    expect(lines[2]).toBe("Total;560,00;670,00;1230,00;450,00;680,00;8");
  });

  it("exporta los productos más vendidos", async () => {
    await seedOctober();
    const { auth } = await actor("admin");

    const res = await request(app).get(`/api/admin/reports/export?kind=products&${OCT}`).set(auth).expect(200);

    const lines = res.text.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("Producto;Variante;SKU;Unidades;Ventas;Costo;Ganancia;Margen %");
    expect(lines[1]).toBe("Producto A;;A;10;990,00;360,00;530,00;59,6");
    expect(lines[2]).toBe("Producto B;;B;3;240,00;90,00;150,00;62,5");
  });

  it("exporta el inventario valorizado y lo que no se mueve", async () => {
    const { auth } = await actor("admin");
    const category = await Category.create({ name: "Cristales" });
    await Product.create({
      name: "Cuarzo",
      category,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      variants: [{ sku: "CUA-1", attributes: [], price: 20000, costPrice: 8000, stock: 5, lowStockThreshold: 0 }],
    });

    const inventory = await request(app).get("/api/admin/reports/export?kind=inventory").set(auth).expect(200);
    const inv = inventory.text.replace("﻿", "").trim().split("\r\n");
    expect(inv[0]).toBe("Categoría;Variantes;Unidades;Valor a costo;Valor a precio de lista");
    expect(inv[1]).toBe("Cristales;1;5;400,00;1000,00");
    expect(inv[2]).toBe("Total;1;5;400,00;1000,00");
    expect(inventory.headers["content-disposition"]).toMatch(/caracol-inventario-\d{4}-\d{2}-\d{2}\.csv/);

    const slow = await request(app).get("/api/admin/reports/export?kind=slow-movers&days=30").set(auth).expect(200);
    const rows = slow.text.replace("﻿", "").trim().split("\r\n");
    expect(rows[0]).toBe("Producto;Variante;SKU;Stock;Valor a costo;Última venta;Días sin ventas");
    expect(rows[1]).toMatch(/^Cuarzo;;CUA-1;5;400,00;Nunca;\d+$/);
  });

  it("un nombre de producto que parece una fórmula no se ejecuta en Excel", async () => {
    await storeSale({
      createdAt: new Date("2026-10-05T15:00:00.000Z"),
      items: [{ ...line(productA, "A", 1, 10000, 4000), productName: '=HYPERLINK("http://malo.example")' }],
    });
    const { auth } = await actor("admin");

    const res = await request(app).get(`/api/admin/reports/export?kind=products&${OCT}`).set(auth).expect(200);

    expect(res.text).toContain(`"'=HYPERLINK(""http://malo.example"")"`);
    expect(res.text).not.toMatch(/(^|;)=HYPERLINK/m);
  });

  it("pide el tipo y valida el período", async () => {
    const { auth } = await actor("admin");
    expect((await request(app).get("/api/admin/reports/export").set(auth)).status).toBe(400);
    expect((await request(app).get("/api/admin/reports/export?kind=todo").set(auth)).status).toBe(400);
    expect((await request(app).get("/api/admin/reports/export?kind=sales&from=2026-10-20&to=2026-10-10").set(auth)).status).toBe(400);
  });
});
