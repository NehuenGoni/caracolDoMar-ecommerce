/**
 * Reportes del negocio. Todos los importes están en centavos.
 *
 * Reglas de cuenta (las mismas para todos los reportes):
 * - Se suman las ventas online (pedidos con el pago aprobado, contadas el día que se cobraron) y las
 *   del local. No cuentan: pedidos cancelados, reembolsados o sin cobrar, ni ventas anuladas.
 * - Las devoluciones del local restan de la venta original (aparecen en el día de la venta).
 * - "Ventas" es mercadería: el envío que cobra una venta online se informa aparte.
 * - La ganancia es ventas menos el costo que tenía cada producto AL MOMENTO de venderlo. Las líneas
 *   sin costo registrado no entran en la ganancia ni en el margen (se informan en `uncostedRevenue`).
 * - Los días son los de Argentina (UTC-3).
 */

export type ReportGroupBy = "day" | "week" | "month";

export type SalesChannel = "online" | "store";

export interface SalesFigures {
  /** Ventas (tickets) con al menos una unidad que no se devolvió. */
  count: number;
  units: number;
  revenue: number;
  /** Costo de lo vendido (solo de las líneas con costo conocido). */
  cost: number;
  /** `revenue` de las líneas con costo conocido menos su `cost`. */
  profit: number;
  /** Ganancia sobre ventas, en % con un decimal. `null` si no hay ventas con costo conocido. */
  marginPercent: number | null;
  /** `revenue / count`; 0 si no hay ventas. */
  avgTicket: number;
  /** Parte de `revenue` que no tiene costo registrado y por eso no entra en ganancia ni margen. */
  uncostedRevenue: number;
}

export interface SalesSeriesPoint {
  /** `YYYY-MM-DD` (día), `YYYY-MM-DD` del lunes (semana) o `YYYY-MM` (mes). */
  period: string;
  online: number;
  store: number;
  revenue: number;
  cost: number;
  profit: number;
  count: number;
}

export interface PaymentMethodFigures {
  channel: SalesChannel;
  /** `cash`, `debit`, `credit`, `transfer` (local); `mercado_pago`, `transfer` (online). */
  method: string;
  count: number;
  revenue: number;
}

export interface SalesReport {
  range: { from: string; to: string; groupBy: ReportGroupBy };
  totals: SalesFigures;
  online: SalesFigures;
  store: SalesFigures;
  /** Envíos cobrados en pedidos online del período (no están en `revenue`). */
  shippingCollected: number;
  series: SalesSeriesPoint[];
  paymentMethods: PaymentMethodFigures[];
}

export type TopProductsSort = "revenue" | "units" | "profit";

export interface TopProductRow {
  productId: string;
  productName: string;
  variantSku: string;
  variantLabel: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number | null;
}

export interface InventoryValuationCategory {
  categoryId: string;
  categoryName: string;
  variants: number;
  units: number;
  costValue: number;
  retailValue: number;
}

export interface InventoryValuation {
  totals: {
    variants: number;
    units: number;
    /** Lo que costó el stock que hay hoy (stock × costo). */
    costValue: number;
    /** Lo que valdría vendido a precio de lista (stock × precio). */
    retailValue: number;
    /** `retailValue - costValue`. */
    potentialProfit: number;
  };
  byCategory: InventoryValuationCategory[];
}

export interface SlowMoverRow {
  productId: string;
  productName: string;
  variantSku: string;
  variantLabel: string;
  stock: number;
  /** Plata parada: stock × costo. */
  costValue: number;
  /** Última venta registrada, o `null` si nunca se vendió. */
  lastSaleAt: string | null;
  /** Días desde la última venta (o desde que se cargó el producto, si nunca se vendió). */
  daysWithoutSales: number;
}

export type ReportExportKind = "sales" | "products" | "inventory" | "slow-movers";
