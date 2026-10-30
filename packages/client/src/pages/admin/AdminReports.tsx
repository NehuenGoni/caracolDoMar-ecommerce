import {
  formatMoney,
  type ReportExportKind,
  type ReportGroupBy,
  type SalesReport,
  type TopProductsSort,
} from "@caracol/shared";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChartPanel } from "@/components/reports/ChartPanel";
import { HorizontalBarChart } from "@/components/reports/HorizontalBarChart";
import { ReportStat } from "@/components/reports/ReportStat";
import { ReportTable } from "@/components/reports/ReportTable";
import { StackedColumnChart } from "@/components/reports/StackedColumnChart";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { useAsyncResource } from "@/hooks/admin/useAsyncResource";
import { ApiError } from "@/lib/apiClient";
import { deltaPercent, longPeriodLabel } from "@/lib/chartScale";
import {
  daysInRange,
  matchPreset,
  presetRange,
  previousRange,
  PRESET_LABELS,
  todayKey,
  type DateRange,
  type RangePreset,
} from "@/lib/dateRanges";
import { GROUP_LABELS, GROUP_NOUN, paymentLabel, salesCount } from "@/lib/reportLabels";
import {
  downloadReportCsv,
  getInventoryValuation,
  getSalesReport,
  getSlowMovers,
  getTopProducts,
} from "@/lib/reportsApi";
import { cn } from "@/lib/utils";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;
const PRESETS = Object.keys(PRESET_LABELS) as RangePreset[];
const GROUPS = Object.keys(GROUP_LABELS) as ReportGroupBy[];

const SORT_OPTIONS: { value: TopProductsSort; label: string }[] = [
  { value: "revenue", label: "Ventas" },
  { value: "units", label: "Unidades" },
  { value: "profit", label: "Ganancia" },
];
const SLOW_DAYS = [30, 60, 90, 180, 365];

/** El período y la agrupación viven en la URL: se puede compartir y el botón "atrás" funciona. */
function useReportFilters() {
  const [params, setParams] = useSearchParams();
  const today = todayKey();

  const fallback = presetRange("month", today);
  const from = params.get("desde") ?? "";
  const to = params.get("hasta") ?? "";
  const valid = DAY_KEY.test(from) && DAY_KEY.test(to) && from <= to && daysInRange(from, to) <= MAX_DAYS;
  const range: DateRange = valid ? { from, to } : fallback;

  const rawGroup = params.get("agrupar");
  const groupBy: ReportGroupBy = GROUPS.includes(rawGroup as ReportGroupBy) ? (rawGroup as ReportGroupBy) : "day";

  function update(next: Partial<DateRange & { groupBy: ReportGroupBy }>) {
    const merged = new URLSearchParams(params);
    if (next.from) merged.set("desde", next.from);
    if (next.to) merged.set("hasta", next.to);
    if (next.groupBy) merged.set("agrupar", next.groupBy);
    setParams(merged, { replace: true });
  }

  return { range, groupBy, today, update };
}

const seriesDefs = [
  { key: "online", label: "Online", color: "var(--viz-series-1)" },
  { key: "store", label: "Local", color: "var(--viz-series-2)" },
] as const;

export default function AdminReports() {
  const { range, groupBy, today, update } = useReportFilters();
  const [sort, setSort] = useState<TopProductsSort>("revenue");
  const [slowDays, setSlowDays] = useState(60);
  const [exporting, setExporting] = useState<ReportExportKind | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const previous = useMemo(() => previousRange(range), [range]);
  const activePreset = matchPreset(range, today);

  const sales = useAsyncResource(
    () => getSalesReport(range.from, range.to, groupBy),
    `sales:${range.from}:${range.to}:${groupBy}`,
    "No pudimos cargar las ventas",
  );
  const before = useAsyncResource(
    () => getSalesReport(previous.from, previous.to, "month"),
    `sales-prev:${previous.from}:${previous.to}`,
    "No pudimos cargar el período anterior",
  );
  const top = useAsyncResource(
    () => getTopProducts(range.from, range.to, sort),
    `top:${range.from}:${range.to}:${sort}`,
    "No pudimos cargar los productos",
  );
  const inventory = useAsyncResource(() => getInventoryValuation(), "inventory", "No pudimos cargar el inventario");
  const slow = useAsyncResource(() => getSlowMovers(slowDays), `slow:${slowDays}`, "No pudimos cargar los productos sin movimiento");

  async function runExport(kind: ReportExportKind) {
    setExporting(kind);
    setExportError(null);
    try {
      await downloadReportCsv({ kind, from: range.from, to: range.to, groupBy, sort, days: slowDays });
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : "No pudimos descargar el archivo");
    } finally {
      setExporting(null);
    }
  }

  const report = sales.data;
  const loadError = sales.error ?? top.error ?? inventory.error ?? slow.error;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-text">Reportes</h1>

      {/* Un solo renglón de filtros, arriba de todo lo que acota. */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={activePreset === preset}
              onClick={() => update(presetRange(preset, today))}
              className={cn(
                "h-9 rounded-full border px-3.5 text-sm font-medium transition-colors",
                activePreset === preset
                  ? "border-primary bg-primary text-on-primary"
                  : "border-border bg-surface text-text hover:bg-surface-alt",
              )}
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Desde
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => e.target.value && update({ from: e.target.value, to: range.to < e.target.value ? e.target.value : range.to })}
              className="h-9 rounded-xl border border-border bg-surface px-3 text-sm text-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Hasta
            <input
              type="date"
              value={range.to}
              min={range.from}
              max={today}
              onChange={(e) => e.target.value && update({ to: e.target.value, from: range.from > e.target.value ? e.target.value : range.from })}
              className="h-9 rounded-xl border border-border bg-surface px-3 text-sm text-text"
            />
          </label>
        </div>

        <div className="flex gap-1.5" role="group" aria-label="Agrupar por">
          {GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              aria-pressed={groupBy === group}
              onClick={() => update({ groupBy: group })}
              className={cn(
                "h-9 rounded-full border px-3.5 text-sm font-medium transition-colors",
                groupBy === group
                  ? "border-primary bg-primary text-on-primary"
                  : "border-border bg-surface text-text hover:bg-surface-alt",
              )}
            >
              {GROUP_LABELS[group]}
            </button>
          ))}
        </div>
      </div>

      {loadError && <InlineMessage tone="error">{loadError}</InlineMessage>}
      {exportError && <InlineMessage tone="error">{exportError}</InlineMessage>}

      {!report ? (
        <Spinner label="Calculando…" />
      ) : (
        <>
          <Kpis report={report} previous={before.data} />

          {report.totals.uncostedRevenue > 0 && (
            <InlineMessage tone="info">
              {formatMoney(report.totals.uncostedRevenue)} de lo vendido son productos sin costo cargado, así que no entran
              en la ganancia ni en el margen. Cargá el costo de esos productos para ver el número completo.
            </InlineMessage>
          )}

          <ChartPanel
            title={`Ventas por ${GROUP_NOUN[groupBy]}`}
            subtitle={`${report.range.from} al ${report.range.to} · sin envíos, anuladas ni canceladas`}
            isRefreshing={sales.isLoading}
            onExport={() => runExport("sales")}
            isExporting={exporting === "sales"}
            table={
              <ReportTable
                caption="Ventas por período"
                rows={report.series}
                rowKey={(p) => p.period}
                columns={[
                  { header: "Período", render: (p) => longPeriodLabel(p.period, groupBy) },
                  { header: "Online", numeric: true, render: (p) => formatMoney(p.online) },
                  { header: "Local", numeric: true, render: (p) => formatMoney(p.store) },
                  { header: "Total", numeric: true, render: (p) => formatMoney(p.revenue) },
                  { header: "Ganancia", numeric: true, render: (p) => formatMoney(p.profit) },
                  { header: "Ventas", numeric: true, render: (p) => p.count },
                ]}
                footer={
                  <tr className="font-semibold" style={{ color: "var(--viz-text)" }}>
                    <td className="px-2 py-2">Total</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatMoney(report.online.revenue)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatMoney(report.store.revenue)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatMoney(report.totals.revenue)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatMoney(report.totals.profit)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{report.totals.count}</td>
                  </tr>
                }
              />
            }
          >
            <StackedColumnChart
              points={report.series}
              groupBy={groupBy}
              series={[...seriesDefs]}
              ariaLabel={`Ventas por ${GROUP_NOUN[groupBy]}, online y local`}
            />
          </ChartPanel>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartPanel
              title="Cómo te pagan"
              subtitle="Ventas por medio de pago"
              isRefreshing={sales.isLoading}
              table={
                <ReportTable
                  caption="Ventas por medio de pago"
                  rows={report.paymentMethods}
                  rowKey={(m) => `${m.channel}:${m.method}`}
                  columns={[
                    { header: "Medio", render: (m) => paymentLabel(m) },
                    { header: "Ventas", numeric: true, render: (m) => m.count },
                    { header: "Importe", numeric: true, render: (m) => formatMoney(m.revenue) },
                  ]}
                />
              }
            >
              {report.paymentMethods.length > 0 ? (
                <HorizontalBarChart
                  ariaLabel="Ventas por medio de pago"
                  valueLabel="Ventas"
                  formatValue={formatMoney}
                  rows={report.paymentMethods.map((m) => ({
                    key: `${m.channel}:${m.method}`,
                    label: paymentLabel(m),
                    value: m.revenue,
                    detail: salesCount(m.count),
                  }))}
                />
              ) : (
                <p className="py-6 text-center text-sm" style={{ color: "var(--viz-text-2)" }}>
                  No hay ventas en este período.
                </p>
              )}
            </ChartPanel>

            <ChartPanel
              title="Stock valorizado"
              subtitle="Cuánta plata hay en mercadería hoy, a costo"
              isRefreshing={inventory.isLoading}
              onExport={() => runExport("inventory")}
              isExporting={exporting === "inventory"}
              table={
                inventory.data && (
                  <ReportTable
                    caption="Stock valorizado por categoría"
                    rows={inventory.data.byCategory}
                    rowKey={(c) => c.categoryId}
                    columns={[
                      { header: "Categoría", render: (c) => c.categoryName },
                      { header: "Unidades", numeric: true, render: (c) => c.units },
                      { header: "A costo", numeric: true, render: (c) => formatMoney(c.costValue) },
                      { header: "A precio de lista", numeric: true, render: (c) => formatMoney(c.retailValue) },
                    ]}
                  />
                )
              }
            >
              {inventory.data ? (
                <div className="flex flex-col gap-4">
                  <p className="font-semibold" style={{ color: "var(--viz-text)" }}>
                    <span className="text-3xl">{formatMoney(inventory.data.totals.costValue)}</span>
                    <span className="ml-2 text-xs font-normal" style={{ color: "var(--viz-text-2)" }}>
                      {inventory.data.totals.units.toLocaleString("es-AR")} unidades · a precio de lista valdría{" "}
                      {formatMoney(inventory.data.totals.retailValue)}
                    </span>
                  </p>
                  {inventory.data.byCategory.length > 0 && (
                    <HorizontalBarChart
                      ariaLabel="Stock a costo por categoría"
                      valueLabel="A costo"
                      formatValue={formatMoney}
                      rows={inventory.data.byCategory.slice(0, 7).map((c) => ({
                        key: c.categoryId,
                        label: c.categoryName,
                        value: c.costValue,
                        detail: `${c.units} unidades`,
                      }))}
                    />
                  )}
                </div>
              ) : (
                <Spinner />
              )}
            </ChartPanel>
          </div>

          <ChartPanel
            title="Productos más vendidos"
            subtitle="Lo que más rinde en el período"
            isRefreshing={top.isLoading}
            onExport={() => runExport("products")}
            isExporting={exporting === "products"}
          >
            <div className="mb-3 max-w-[11rem]">
              <Select aria-label="Ordenar por" value={sort} onChange={(e) => setSort(e.target.value as TopProductsSort)}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    Por {option.label.toLowerCase()}
                  </option>
                ))}
              </Select>
            </div>
            <div className="overflow-x-auto">
              <ReportTable
                caption="Productos más vendidos"
                rows={top.data?.products ?? []}
                rowKey={(p) => `${p.productId}:${p.variantSku}`}
                columns={[
                  {
                    header: "Producto",
                    render: (p) => (
                      <>
                        {p.productName}
                        {p.variantLabel && <span style={{ color: "var(--viz-text-2)" }}> · {p.variantLabel}</span>}
                      </>
                    ),
                  },
                  { header: "Unidades", numeric: true, render: (p) => p.units },
                  { header: "Ventas", numeric: true, render: (p) => formatMoney(p.revenue) },
                  { header: "Costo", numeric: true, render: (p) => formatMoney(p.cost) },
                  { header: "Ganancia", numeric: true, render: (p) => formatMoney(p.profit) },
                  { header: "Margen", numeric: true, render: (p) => (p.marginPercent === null ? "—" : `${p.marginPercent.toLocaleString("es-AR")}%`) },
                ]}
              />
            </div>
          </ChartPanel>

          <ChartPanel
            title="Plata parada"
            subtitle="Productos con stock que no se venden"
            isRefreshing={slow.isLoading}
            onExport={() => runExport("slow-movers")}
            isExporting={exporting === "slow-movers"}
          >
            <div className="mb-3 flex items-center gap-2 text-sm" style={{ color: "var(--viz-text-2)" }}>
              Sin ventas hace más de
              <div className="w-28">
                <Select aria-label="Días sin ventas" value={slowDays} onChange={(e) => setSlowDays(Number(e.target.value))}>
                  {SLOW_DAYS.map((days) => (
                    <option key={days} value={days}>
                      {days} días
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <ReportTable
                caption="Productos sin movimiento"
                empty="No hay productos con stock parado en este plazo."
                rows={slow.data?.items ?? []}
                rowKey={(s) => `${s.productId}:${s.variantSku}`}
                columns={[
                  {
                    header: "Producto",
                    render: (s) => (
                      <>
                        {s.productName}
                        {s.variantLabel && <span style={{ color: "var(--viz-text-2)" }}> · {s.variantLabel}</span>}
                      </>
                    ),
                  },
                  { header: "Stock", numeric: true, render: (s) => s.stock },
                  { header: "Plata parada", numeric: true, render: (s) => formatMoney(s.costValue) },
                  { header: "Última venta", numeric: true, render: (s) => (s.lastSaleAt ? new Date(s.lastSaleAt).toLocaleDateString("es-AR") : "Nunca") },
                  { header: "Días sin vender", numeric: true, render: (s) => s.daysWithoutSales },
                ]}
              />
            </div>
          </ChartPanel>
        </>
      )}
    </div>
  );
}

function Kpis({ report, previous }: { report: SalesReport; previous: SalesReport | null }) {
  const { totals, online, store } = report;
  const salesDelta = previous ? deltaPercent(totals.revenue, previous.totals.revenue) : undefined;
  const profitDelta = previous ? deltaPercent(totals.profit, previous.totals.profit) : undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <ReportStat
        hero
        label="Ventas"
        value={formatMoney(totals.revenue)}
        delta={salesDelta}
        hint={`Online ${formatMoney(online.revenue)} · Local ${formatMoney(store.revenue)}`}
      />
      <ReportStat
        label="Ganancia bruta"
        value={totals.marginPercent === null ? "—" : formatMoney(totals.profit)}
        delta={totals.marginPercent === null ? undefined : profitDelta}
        hint={totals.marginPercent === null ? "Sin costos cargados" : `Margen ${totals.marginPercent.toLocaleString("es-AR")}% sobre lo vendido`}
      />
      <ReportStat
        label="Ventas realizadas"
        value={totals.count.toLocaleString("es-AR")}
        hint={`Ticket promedio ${formatMoney(totals.avgTicket)}${report.shippingCollected > 0 ? ` · Envíos cobrados ${formatMoney(report.shippingCollected)}` : ""}`}
      />
    </div>
  );
}
