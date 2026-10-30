import { describe, expect, it } from "vitest";
import {
  FiguresAccumulator,
  figuresFromOrder,
  figuresFromStoreSale,
  marginPercent,
  type LeanOrder,
  type LeanStoreSale,
} from "./reportFigures.js";

const item = (sku: string, quantity: number, subtotal: number, unitCost?: number) => ({
  product: `prod-${sku}`,
  productName: `Producto ${sku}`,
  variantSku: sku,
  variantLabel: "",
  quantity,
  subtotal,
  ...(unitCost !== undefined && { unitCost }),
});

function storeSale(overrides: Partial<LeanStoreSale> = {}): LeanStoreSale {
  return {
    status: "completed",
    createdAt: new Date("2026-10-15T15:00:00.000Z"),
    paymentMethod: "cash",
    subtotal: 30000,
    total: 30000,
    items: [item("A", 2, 20000, 4000), item("B", 1, 10000, 3000)],
    returns: [],
    ...overrides,
  };
}

describe("figuresFromStoreSale", () => {
  it("una venta simple: ventas, costo y unidades", () => {
    const f = figuresFromStoreSale(storeSale())!;
    expect(f).toMatchObject({ channel: "store", method: "cash", day: "2026-10-15", units: 3, revenue: 30000, cost: 11000, costedRevenue: 30000 });
  });

  it("una venta anulada no cuenta", () => {
    expect(figuresFromStoreSale(storeSale({ status: "voided" }))).toBeNull();
  });

  it("reparte el descuento general entre las líneas y la suma da exactamente lo cobrado", () => {
    // 3 líneas de $100 con un 10% general: se cobraron 270, no 300.
    const f = figuresFromStoreSale(
      storeSale({
        subtotal: 30000,
        total: 27000,
        items: [item("A", 1, 10000, 1000), item("B", 1, 10000, 1000), item("C", 1, 10000, 1000)],
      }),
    )!;
    expect(f.revenue).toBe(27000);
    expect(f.lines.map((l) => l.revenue)).toEqual([9000, 9000, 9000]);
  });

  it("el redondeo de centavos lo absorbe la última línea", () => {
    // total 10000 repartido en 3 líneas iguales: 3333 + 3333 + 3334
    const f = figuresFromStoreSale(
      storeSale({
        subtotal: 3,
        total: 10000,
        items: [item("A", 1, 1), item("B", 1, 1), item("C", 1, 1)],
      }),
    )!;
    expect(f.lines.map((l) => l.revenue)).toEqual([3333, 3333, 3334]);
    expect(f.revenue).toBe(10000);
  });

  it("una devolución parcial resta unidades, ventas y costo de esa línea", () => {
    const f = figuresFromStoreSale(
      storeSale({
        status: "partially_returned",
        returns: [{ amount: 10000, items: [{ variantSku: "A", quantity: 1, amount: 10000 }] }],
      }),
    )!;
    expect(f.units).toBe(2);
    expect(f.revenue).toBe(20000);
    expect(f.cost).toBe(4000 + 3000); // 1 de A + 1 de B
    const a = f.lines.find((l) => l.variantSku === "A")!;
    expect(a).toMatchObject({ units: 1, revenue: 10000, cost: 4000 });
  });

  it("varias devoluciones de la misma línea se acumulan", () => {
    const f = figuresFromStoreSale(
      storeSale({
        status: "returned",
        returns: [
          { amount: 10000, items: [{ variantSku: "A", quantity: 1, amount: 10000 }] },
          { amount: 20000, items: [{ variantSku: "A", quantity: 1, amount: 10000 }, { variantSku: "B", quantity: 1, amount: 10000 }] },
        ],
      }),
    )!;
    expect(f.units).toBe(0);
    expect(f.revenue).toBe(0);
    expect(f.cost).toBe(0);
  });

  it("con descuento general, la devolución resta lo que realmente se cobró de esa línea", () => {
    // Venta de 2 × $100 con 50% de descuento general: se cobró $100; se devuelve una unidad ($50).
    const f = figuresFromStoreSale(
      storeSale({
        subtotal: 20000,
        total: 10000,
        items: [item("A", 2, 20000, 3000)],
        status: "partially_returned",
        returns: [{ amount: 5000, items: [{ variantSku: "A", quantity: 1, amount: 5000 }] }],
      }),
    )!;
    expect(f.revenue).toBe(5000);
    expect(f.units).toBe(1);
  });

  it("las líneas sin costo registrado no entran en la ganancia", () => {
    const f = figuresFromStoreSale(storeSale({ items: [item("A", 1, 20000, 4000), item("B", 1, 10000)] }))!;
    expect(f.revenue).toBe(30000);
    expect(f.costedRevenue).toBe(20000);
    expect(f.cost).toBe(4000);
    expect(f.lines.find((l) => l.variantSku === "B")!.costKnown).toBe(false);
  });

  it("un costo de 0 es un costo conocido (regalo, muestra), no uno faltante", () => {
    const f = figuresFromStoreSale(storeSale({ items: [item("A", 1, 20000, 0)], subtotal: 20000, total: 20000 }))!;
    expect(f.costedRevenue).toBe(20000);
  });
});

describe("figuresFromOrder", () => {
  const order = (overrides: Partial<LeanOrder> = {}): LeanOrder => ({
    createdAt: new Date("2026-10-10T12:00:00.000Z"),
    paidAt: new Date("2026-10-12T12:00:00.000Z"),
    paymentMethod: "mercado_pago",
    shippingCost: 80000,
    items: [item("A", 2, 20000, 4000)],
    ...overrides,
  });

  it("cuenta las ventas de mercadería, el envío aparte, y el día en que se cobró", () => {
    const f = figuresFromOrder(order());
    expect(f).toMatchObject({ channel: "online", method: "mercado_pago", day: "2026-10-12", revenue: 20000, cost: 8000, shipping: 80000, units: 2 });
  });

  it("sin fecha de pago usa la de creación", () => {
    expect(figuresFromOrder(order({ paidAt: undefined })).day).toBe("2026-10-10");
  });

  it("el día es el de Argentina", () => {
    expect(figuresFromOrder(order({ paidAt: new Date("2026-10-13T01:00:00.000Z") })).day).toBe("2026-10-12");
  });
});

describe("FiguresAccumulator", () => {
  it("suma, calcula ganancia, margen y ticket promedio", () => {
    const acc = new FiguresAccumulator();
    acc.add(figuresFromStoreSale(storeSale())!); // 30000 de ventas, 11000 de costo
    acc.add(figuresFromStoreSale(storeSale({ subtotal: 10000, total: 10000, items: [item("A", 1, 10000, 4000)] }))!);

    expect(acc.toFigures()).toEqual({
      count: 2,
      units: 4,
      revenue: 40000,
      cost: 15000,
      profit: 25000,
      marginPercent: 62.5,
      avgTicket: 20000,
      uncostedRevenue: 0,
    });
  });

  it("una venta totalmente devuelta no cuenta como ticket", () => {
    const acc = new FiguresAccumulator();
    acc.add(
      figuresFromStoreSale(
        storeSale({
          subtotal: 10000,
          total: 10000,
          items: [item("A", 1, 10000, 4000)],
          status: "returned",
          returns: [{ amount: 10000, items: [{ variantSku: "A", quantity: 1, amount: 10000 }] }],
        }),
      )!,
    );
    expect(acc.toFigures().count).toBe(0);
    expect(acc.toFigures().avgTicket).toBe(0);
  });

  it("sin nada vendido, margen y ticket son nulos o cero (no NaN)", () => {
    const f = new FiguresAccumulator().toFigures();
    expect(f.marginPercent).toBeNull();
    expect(f.avgTicket).toBe(0);
  });

  it("informa la parte sin costo y no la mezcla en el margen", () => {
    const acc = new FiguresAccumulator();
    acc.add(figuresFromStoreSale(storeSale({ items: [item("A", 1, 20000, 5000), item("B", 1, 10000)] }))!);
    const f = acc.toFigures();
    expect(f.uncostedRevenue).toBe(10000);
    expect(f.profit).toBe(15000); // 20000 - 5000, sin contar B
    expect(f.marginPercent).toBe(75);
  });
});

describe("marginPercent", () => {
  it("redondea a un decimal y soporta pérdida", () => {
    expect(marginPercent(1, 3)).toBe(33.3);
    expect(marginPercent(-500, 1000)).toBe(-50);
  });

  it("es nulo si no hay base", () => {
    expect(marginPercent(0, 0)).toBeNull();
  });
});
