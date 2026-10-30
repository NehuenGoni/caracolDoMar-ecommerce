import type { SalesChannel, SalesFigures } from "@caracol/shared";
import { dayKey } from "../utils/reportDates.js";

/**
 * Cálculo de cuánto vendió, costó y rindió UNA venta (online o del local). Es puro (sin base de
 * datos) a propósito: es donde están las reglas de cuenta y conviene probarlas a fondo.
 */

export interface LineFigure {
  productId: string;
  variantSku: string;
  productName: string;
  variantLabel: string;
  /** Unidades que quedaron vendidas (descontadas las devueltas). */
  units: number;
  /** Lo que se cobró por esas unidades (con descuentos aplicados y sin las devoluciones). */
  revenue: number;
  /** Costo de esas unidades; 0 si no se sabe. */
  cost: number;
  costKnown: boolean;
}

export interface SaleFigures {
  channel: SalesChannel;
  /** Día de Argentina (`YYYY-MM-DD`) en el que se cuenta la venta. */
  day: string;
  method: string;
  units: number;
  revenue: number;
  /** Costo de las líneas con costo conocido. */
  cost: number;
  /** Ventas de las líneas con costo conocido (la base sobre la que se mide la ganancia). */
  costedRevenue: number;
  /** Envío cobrado (solo online); no está en `revenue`. */
  shipping: number;
  lines: LineFigure[];
}

interface LeanItem {
  product: unknown;
  productName: string;
  variantSku: string;
  variantLabel?: string;
  unitCost?: number | null;
  quantity: number;
  subtotal: number;
}

export interface LeanStoreSale {
  status: string;
  createdAt: Date;
  paymentMethod: string;
  subtotal: number;
  total: number;
  items: LeanItem[];
  returns?: { amount: number; items: { variantSku: string; quantity: number; amount: number }[] }[];
}

export interface LeanOrder {
  createdAt: Date;
  paidAt?: Date | null;
  paymentMethod: string;
  shippingCost?: number;
  items: LeanItem[];
}

function line(item: LeanItem, units: number, revenue: number): LineFigure {
  const costKnown = typeof item.unitCost === "number";
  return {
    productId: String(item.product),
    variantSku: item.variantSku,
    productName: item.productName,
    variantLabel: item.variantLabel ?? "",
    units,
    revenue,
    cost: costKnown ? units * (item.unitCost as number) : 0,
    costKnown,
  };
}

function summarize(
  channel: SalesChannel,
  day: string,
  method: string,
  lines: LineFigure[],
  shipping: number,
): SaleFigures {
  return {
    channel,
    day,
    method,
    units: lines.reduce((n, l) => n + l.units, 0),
    revenue: lines.reduce((n, l) => n + l.revenue, 0),
    cost: lines.reduce((n, l) => n + l.cost, 0),
    costedRevenue: lines.filter((l) => l.costKnown).reduce((n, l) => n + l.revenue, 0),
    shipping,
    lines,
  };
}

/**
 * Una venta del local. Devuelve `null` si no cuenta (anulada). Cada línea se queda con lo que
 * realmente se cobró por ella: el descuento general se reparte entre las líneas en proporción
 * (con el redondeo absorbido por la última, así la suma da exactamente el total cobrado) y se le
 * restan las devoluciones de ese producto.
 */
export function figuresFromStoreSale(sale: LeanStoreSale): SaleFigures | null {
  if (sale.status === "voided") return null;

  const ratio = sale.subtotal > 0 ? sale.total / sale.subtotal : 1;
  let allocated = 0;
  const paid = sale.items.map((item, index) => {
    const isLast = index === sale.items.length - 1;
    const amount = isLast ? sale.total - allocated : Math.round(item.subtotal * ratio);
    allocated += amount;
    return amount;
  });

  const returnedUnits = new Map<string, number>();
  const returnedAmount = new Map<string, number>();
  for (const ret of sale.returns ?? []) {
    for (const item of ret.items) {
      returnedUnits.set(item.variantSku, (returnedUnits.get(item.variantSku) ?? 0) + item.quantity);
      returnedAmount.set(item.variantSku, (returnedAmount.get(item.variantSku) ?? 0) + item.amount);
    }
  }

  const lines = sale.items.map((item, index) =>
    line(
      item,
      item.quantity - (returnedUnits.get(item.variantSku) ?? 0),
      paid[index]! - (returnedAmount.get(item.variantSku) ?? 0),
    ),
  );
  return summarize("store", dayKey(sale.createdAt), sale.paymentMethod, lines, 0);
}

/** Un pedido online ya cobrado (el filtro de estado lo hace la consulta). Se cuenta el día que se cobró. */
export function figuresFromOrder(order: LeanOrder): SaleFigures {
  const lines = order.items.map((item) => line(item, item.quantity, item.subtotal));
  return summarize("online", dayKey(order.paidAt ?? order.createdAt), order.paymentMethod, lines, order.shippingCost ?? 0);
}

export function emptyFigures(): SalesFigures {
  return { count: 0, units: 0, revenue: 0, cost: 0, profit: 0, marginPercent: null, avgTicket: 0, uncostedRevenue: 0 };
}

/** Acumulador mutable: se le suman ventas y al final se lo convierte en `SalesFigures`. */
export class FiguresAccumulator {
  count = 0;
  units = 0;
  revenue = 0;
  cost = 0;
  costedRevenue = 0;

  add(sale: Pick<SaleFigures, "units" | "revenue" | "cost" | "costedRevenue">): void {
    // Una venta con todo devuelto ya no es una venta: no suma al conteo ni al ticket promedio.
    if (sale.units > 0) this.count += 1;
    this.units += sale.units;
    this.revenue += sale.revenue;
    this.cost += sale.cost;
    this.costedRevenue += sale.costedRevenue;
  }

  get profit(): number {
    return this.costedRevenue - this.cost;
  }

  toFigures(): SalesFigures {
    return {
      count: this.count,
      units: this.units,
      revenue: this.revenue,
      cost: this.cost,
      profit: this.profit,
      marginPercent: marginPercent(this.profit, this.costedRevenue),
      avgTicket: this.count > 0 ? Math.round(this.revenue / this.count) : 0,
      uncostedRevenue: this.revenue - this.costedRevenue,
    };
  }
}

/** Ganancia sobre ventas, en % con un decimal. `null` si no hay ventas con costo conocido. */
export function marginPercent(profit: number, costedRevenue: number): number | null {
  if (costedRevenue <= 0) return null;
  return Math.round((profit / costedRevenue) * 1000) / 10;
}
