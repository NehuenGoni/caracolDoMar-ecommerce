import {
  formatVariantLabel,
  type InventoryValuation,
  type PaymentMethodFigures,
  type ReportExportKind,
  type SalesReport,
  type SalesSeriesPoint,
  type SlowMoverRow,
  type TopProductRow,
} from "@caracol/shared";
import { Category } from "../models/Category.js";
import { Order } from "../models/Order.js";
import { Product, type IProductVariantAttribute } from "../models/Product.js";
import { StockMovement } from "../models/StockMovement.js";
import { StoreSale } from "../models/StoreSale.js";
import { type CsvCell, percent, pesos, toCsv } from "../utils/csv.js";
import { bucketKey, dayKey, listBuckets, resolveRange, type ReportRange } from "../utils/reportDates.js";
import type {
  ExportReportQuery,
  SalesReportQuery,
  SlowMoversQuery,
  TopProductsQuery,
} from "../validators/reportValidators.js";
import {
  FiguresAccumulator,
  figuresFromOrder,
  figuresFromStoreSale,
  marginPercent,
  type LeanOrder,
  type LeanStoreSale,
  type SaleFigures,
} from "./reportFigures.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Recorre las ventas del período, una por una, ya convertidas en cifras (ver `reportFigures`).
 * Se lee con `lean()` y un cursor: así no se arma un documento de Mongoose por venta, y es la
 * única forma de leer el costo guardado en cada línea (`toJSON` lo oculta a propósito).
 */
async function* collectSales(range: ReportRange): AsyncGenerator<SaleFigures> {
  const stores = StoreSale.find({
    createdAt: { $gte: range.start, $lte: range.end },
    status: { $ne: "voided" },
  })
    .select("status createdAt paymentMethod subtotal total items returns")
    .lean()
    .cursor();
  for await (const sale of stores) {
    const figures = figuresFromStoreSale(sale as unknown as LeanStoreSale);
    if (figures) yield figures;
  }

  // Un pedido cuenta cuando se cobró: los que no tienen `paidAt` (viejos) caen en su día de creación.
  const orders = Order.find({
    paymentStatus: "approved",
    status: { $ne: "cancelled" },
    $or: [
      { paidAt: { $gte: range.start, $lte: range.end } },
      { paidAt: { $exists: false }, createdAt: { $gte: range.start, $lte: range.end } },
    ],
  })
    .select("createdAt paidAt paymentMethod shippingCost items")
    .lean()
    .cursor();
  for await (const order of orders) {
    yield figuresFromOrder(order as unknown as LeanOrder);
  }
}

interface Bucket {
  online: number;
  store: number;
  cost: number;
  costedRevenue: number;
  count: number;
}

export async function getSalesReport(query: SalesReportQuery): Promise<SalesReport> {
  const range = resolveRange(query.from, query.to);

  const buckets = new Map<string, Bucket>(
    listBuckets(range.fromKey, range.toKey, query.groupBy).map((key) => [
      key,
      { online: 0, store: 0, cost: 0, costedRevenue: 0, count: 0 },
    ]),
  );
  const all = new FiguresAccumulator();
  const online = new FiguresAccumulator();
  const store = new FiguresAccumulator();
  const methods = new Map<string, PaymentMethodFigures>();
  let shippingCollected = 0;

  for await (const sale of collectSales(range)) {
    (sale.channel === "online" ? online : store).add(sale);
    all.add(sale);
    shippingCollected += sale.shipping;

    const bucket = buckets.get(bucketKey(sale.day, query.groupBy));
    if (bucket) {
      bucket[sale.channel] += sale.revenue;
      bucket.cost += sale.cost;
      bucket.costedRevenue += sale.costedRevenue;
      if (sale.units > 0) bucket.count += 1;
    }

    const key = `${sale.channel}:${sale.method}`;
    const method = methods.get(key) ?? { channel: sale.channel, method: sale.method, count: 0, revenue: 0 };
    if (sale.units > 0) method.count += 1;
    method.revenue += sale.revenue;
    methods.set(key, method);
  }

  const series: SalesSeriesPoint[] = [...buckets].map(([period, b]) => ({
    period,
    online: b.online,
    store: b.store,
    revenue: b.online + b.store,
    cost: b.cost,
    profit: b.costedRevenue - b.cost,
    count: b.count,
  }));

  return {
    range: { from: range.fromKey, to: range.toKey, groupBy: query.groupBy },
    totals: all.toFigures(),
    online: online.toFigures(),
    store: store.toFigures(),
    shippingCollected,
    series,
    paymentMethods: [...methods.values()].filter((m) => m.revenue !== 0 || m.count > 0).sort((a, b) => b.revenue - a.revenue),
  };
}

export async function getTopProducts(query: TopProductsQuery): Promise<TopProductRow[]> {
  const range = resolveRange(query.from, query.to);

  const rows = new Map<string, TopProductRow & { costedRevenue: number }>();
  for await (const sale of collectSales(range)) {
    for (const line of sale.lines) {
      if (line.units <= 0) continue;
      const key = `${line.productId}:${line.variantSku}`;
      const row =
        rows.get(key) ??
        {
          productId: line.productId,
          productName: line.productName,
          variantSku: line.variantSku,
          variantLabel: line.variantLabel,
          units: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          marginPercent: null,
          costedRevenue: 0,
        };
      row.units += line.units;
      row.revenue += line.revenue;
      row.cost += line.cost;
      if (line.costKnown) row.costedRevenue += line.revenue;
      rows.set(key, row);
    }
  }

  return [...rows.values()]
    .map(({ costedRevenue, ...row }) => {
      const profit = costedRevenue - row.cost;
      return { ...row, profit, marginPercent: marginPercent(profit, costedRevenue) };
    })
    .sort((a, b) => b[query.sort] - a[query.sort] || a.productName.localeCompare(b.productName, "es"))
    .slice(0, query.limit);
}

/** Cuánta plata hay en stock hoy, total y por categoría. Los kits no cuentan: su stock sale de los componentes. */
export async function getInventoryValuation(): Promise<InventoryValuation> {
  const rows = await Product.aggregate<{
    _id: unknown;
    variants: number;
    units: number;
    costValue: number;
    retailValue: number;
  }>([
    { $match: { isBundle: { $ne: true } } },
    { $unwind: "$variants" },
    {
      $group: {
        _id: "$category",
        variants: { $sum: 1 },
        units: { $sum: "$variants.stock" },
        costValue: { $sum: { $multiply: ["$variants.stock", "$variants.costPrice"] } },
        retailValue: { $sum: { $multiply: ["$variants.stock", "$variants.price"] } },
      },
    },
  ]);

  const categories = await Category.find({ _id: { $in: rows.map((r) => r._id) } })
    .select("name")
    .lean();
  const nameById = new Map(categories.map((c) => [String(c._id), c.name]));

  const byCategory = rows
    .map((r) => ({
      categoryId: String(r._id),
      categoryName: nameById.get(String(r._id)) ?? "Sin categoría",
      variants: r.variants,
      units: r.units,
      costValue: r.costValue,
      retailValue: r.retailValue,
    }))
    .sort((a, b) => b.costValue - a.costValue);

  const costValue = byCategory.reduce((n, c) => n + c.costValue, 0);
  const retailValue = byCategory.reduce((n, c) => n + c.retailValue, 0);
  return {
    totals: {
      variants: byCategory.reduce((n, c) => n + c.variants, 0),
      units: byCategory.reduce((n, c) => n + c.units, 0),
      costValue,
      retailValue,
      potentialProfit: retailValue - costValue,
    },
    byCategory,
  };
}

/**
 * Productos con stock que no se venden: la plata parada. Una variante entra si no se vendió en los
 * últimos `days` días; si nunca se vendió, se cuenta desde que se cargó el producto (así algo recién
 * cargado no figura como "sin movimiento").
 */
export async function getSlowMovers(query: SlowMoversQuery, now: Date = new Date()): Promise<SlowMoverRow[]> {
  const cutoff = new Date(now.getTime() - query.days * DAY_MS);

  const [variants, lastSales] = await Promise.all([
    Product.aggregate<{
      _id: unknown;
      name: string;
      createdAt: Date;
      sku: string;
      attributes: IProductVariantAttribute[];
      stock: number;
      cost: number;
    }>([
      { $match: { isBundle: { $ne: true } } },
      { $unwind: "$variants" },
      { $match: { "variants.stock": { $gt: 0 } } },
      {
        $project: {
          name: 1,
          createdAt: 1,
          sku: "$variants.sku",
          attributes: "$variants.attributes",
          stock: "$variants.stock",
          cost: "$variants.costPrice",
        },
      },
    ]),
    StockMovement.aggregate<{ _id: { product: unknown; sku: string }; last: Date }>([
      { $match: { type: "sale_out" } },
      { $group: { _id: { product: "$product", sku: "$variantSku" }, last: { $max: "$createdAt" } } },
    ]),
  ]);

  const lastSaleByVariant = new Map(lastSales.map((s) => [`${String(s._id.product)}:${s._id.sku}`, s.last]));

  return variants
    .map((v) => {
      const lastSaleAt = lastSaleByVariant.get(`${String(v._id)}:${v.sku}`) ?? null;
      const reference = lastSaleAt ?? v.createdAt;
      return { v, lastSaleAt, reference };
    })
    .filter(({ reference }) => reference < cutoff)
    .map(({ v, lastSaleAt, reference }) => ({
      productId: String(v._id),
      productName: v.name,
      variantSku: v.sku,
      variantLabel: formatVariantLabel(v.attributes),
      stock: v.stock,
      costValue: v.stock * v.cost,
      lastSaleAt: lastSaleAt ? lastSaleAt.toISOString() : null,
      daysWithoutSales: Math.floor((now.getTime() - reference.getTime()) / DAY_MS),
    }))
    .sort((a, b) => b.costValue - a.costValue)
    .slice(0, query.limit);
}

const SALES_CHANNEL_HEADERS = ["Ventas online", "Ventas del local"] as const;

/** El mismo reporte que se ve en pantalla, listo para abrir en Excel. */
export async function buildReportCsv(query: ExportReportQuery): Promise<{ filename: string; csv: string }> {
  const kind: ReportExportKind = query.kind;
  const today = dayKey(new Date());

  if (kind === "sales") {
    const report = await getSalesReport(query);
    const rows: CsvCell[][] = [
      ["Período", ...SALES_CHANNEL_HEADERS, "Ventas totales", "Costo", "Ganancia", "Cantidad de ventas"],
      ...report.series.map((p) => [p.period, pesos(p.online), pesos(p.store), pesos(p.revenue), pesos(p.cost), pesos(p.profit), p.count]),
      [
        "Total",
        pesos(report.online.revenue),
        pesos(report.store.revenue),
        pesos(report.totals.revenue),
        pesos(report.totals.cost),
        pesos(report.totals.profit),
        report.totals.count,
      ],
    ];
    return { filename: `caracol-ventas-${report.range.from}_${report.range.to}.csv`, csv: toCsv(rows) };
  }

  if (kind === "products") {
    const range = resolveRange(query.from, query.to);
    const products = await getTopProducts({ ...query, limit: query.limit });
    const rows: CsvCell[][] = [
      ["Producto", "Variante", "SKU", "Unidades", "Ventas", "Costo", "Ganancia", "Margen %"],
      ...products.map((p) => [p.productName, p.variantLabel, p.variantSku, p.units, pesos(p.revenue), pesos(p.cost), pesos(p.profit), percent(p.marginPercent)]),
    ];
    return { filename: `caracol-productos-${range.fromKey}_${range.toKey}.csv`, csv: toCsv(rows) };
  }

  if (kind === "inventory") {
    const valuation = await getInventoryValuation();
    const rows: CsvCell[][] = [
      ["Categoría", "Variantes", "Unidades", "Valor a costo", "Valor a precio de lista"],
      ...valuation.byCategory.map((c) => [c.categoryName, c.variants, c.units, pesos(c.costValue), pesos(c.retailValue)]),
      ["Total", valuation.totals.variants, valuation.totals.units, pesos(valuation.totals.costValue), pesos(valuation.totals.retailValue)],
    ];
    return { filename: `caracol-inventario-${today}.csv`, csv: toCsv(rows) };
  }

  const slow = await getSlowMovers(query);
  const rows: CsvCell[][] = [
    ["Producto", "Variante", "SKU", "Stock", "Valor a costo", "Última venta", "Días sin ventas"],
    ...slow.map((s) => [s.productName, s.variantLabel, s.variantSku, s.stock, pesos(s.costValue), s.lastSaleAt ? s.lastSaleAt.slice(0, 10) : "Nunca", s.daysWithoutSales]),
  ];
  return { filename: `caracol-sin-movimiento-${today}.csv`, csv: toCsv(rows) };
}
