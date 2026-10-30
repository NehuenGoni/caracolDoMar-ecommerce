import { formatMoney } from "@caracol/shared";
import { AlertTriangle, ArrowRight, Clock, Package } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { StatCard } from "@/components/admin/StatCard";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { ChartPanel } from "@/components/reports/ChartPanel";
import { HorizontalBarChart } from "@/components/reports/HorizontalBarChart";
import { ReportStat } from "@/components/reports/ReportStat";
import { StackedColumnChart } from "@/components/reports/StackedColumnChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { Spinner } from "@/components/ui/Spinner";
import { useAdminOrders } from "@/hooks/admin/useAdminOrders";
import { useAsyncResource } from "@/hooks/admin/useAsyncResource";
import { useLowStock } from "@/hooks/admin/useLowStock";
import { deltaPercent } from "@/lib/chartScale";
import { presetRange, sameDaysLastMonth, todayKey } from "@/lib/dateRanges";
import { salesCount } from "@/lib/reportLabels";
import { getSalesReport, getTopProducts } from "@/lib/reportsApi";

const VS_LAST_MONTH = "vs. los mismos días del mes pasado";

const seriesDefs = [
  { key: "online", label: "Online", color: "var(--viz-series-1)" },
  { key: "store", label: "Local", color: "var(--viz-series-2)" },
] as const;

/**
 * El tablero del admin: cómo viene el mes (con los mismos números y reglas que Reportes) y lo que
 * pide atención hoy. El detalle y los otros períodos están en Reportes.
 */
export default function AdminDashboard() {
  const today = todayKey();
  const month = useMemo(() => presetRange("month", today), [today]);
  const lastMonth = useMemo(() => sameDaysLastMonth(month), [month]);

  const sales = useAsyncResource(
    () => getSalesReport(month.from, month.to, "day"),
    `dash-sales:${month.from}:${month.to}`,
    "No pudimos cargar las ventas del mes",
  );
  const before = useAsyncResource(
    () => getSalesReport(lastMonth.from, lastMonth.to, "month"),
    `dash-prev:${lastMonth.from}:${lastMonth.to}`,
    "No pudimos cargar el mes pasado",
  );
  const top = useAsyncResource(
    () => getTopProducts(month.from, month.to, "revenue", 5),
    `dash-top:${month.from}:${month.to}`,
    "No pudimos cargar los productos más vendidos",
  );

  const { data: pendingOrders } = useAdminOrders({ status: "pending", limit: 1 });
  const { data: recentOrders, isLoading: loadingRecent } = useAdminOrders({ limit: 6 });
  const { items: lowStock } = useLowStock();

  const report = sales.data;
  const previous = before.data;
  const todayPoint = report?.series.find((p) => p.period === today);
  const loadError = sales.error ?? top.error;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-text">Dashboard</h1>
        <Link
          to="/admin/reportes"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Ver todos los reportes <ArrowRight className="size-4" />
        </Link>
      </div>

      {loadError && <InlineMessage tone="error">{loadError}</InlineMessage>}

      {!report ? (
        !sales.error && <Spinner label="Calculando…" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ReportStat
              hero
              label="Ventas del mes"
              value={formatMoney(report.totals.revenue)}
              delta={previous ? deltaPercent(report.totals.revenue, previous.totals.revenue) : undefined}
              deltaLabel={VS_LAST_MONTH}
              hint={`Online ${formatMoney(report.online.revenue)} · Local ${formatMoney(report.store.revenue)}`}
            />
            <ReportStat
              label="Ganancia bruta del mes"
              value={report.totals.marginPercent === null ? "—" : formatMoney(report.totals.profit)}
              delta={
                previous && report.totals.marginPercent !== null
                  ? deltaPercent(report.totals.profit, previous.totals.profit)
                  : undefined
              }
              deltaLabel={VS_LAST_MONTH}
              hint={
                report.totals.marginPercent === null
                  ? "Sin costos cargados"
                  : `Margen ${report.totals.marginPercent.toLocaleString("es-AR")}% · Ticket promedio ${formatMoney(report.totals.avgTicket)}`
              }
            />
            <ReportStat
              label="Hoy"
              value={formatMoney(todayPoint?.revenue ?? 0)}
              hint={`${salesCount(todayPoint?.count ?? 0)} · Online ${formatMoney(todayPoint?.online ?? 0)} · Local ${formatMoney(todayPoint?.store ?? 0)}`}
            />
          </div>

          {report.totals.uncostedRevenue > 0 && (
            <InlineMessage tone="info">
              {formatMoney(report.totals.uncostedRevenue)} de lo vendido este mes son productos sin costo cargado, así que
              no entran en la ganancia ni en el margen.
            </InlineMessage>
          )}
        </>
      )}

      {/* Lo que pide atención: va aunque los números del mes todavía estén cargando. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          icon={Clock}
          label="Pedidos pendientes de pago"
          value={pendingOrders?.total ?? 0}
          to="/admin/pedidos?status=pending"
          tone={(pendingOrders?.total ?? 0) > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={AlertTriangle}
          label="Variantes con stock bajo"
          value={lowStock.length}
          to="/admin/inventario"
          tone={lowStock.length > 0 ? "warning" : "neutral"}
        />
      </div>

      {report && (
        <div className="grid gap-6 lg:grid-cols-5">
          <ChartPanel
            className="lg:col-span-3"
            title="Ventas del mes, día por día"
            subtitle="Sin envíos, anuladas ni canceladas"
            isRefreshing={sales.isLoading}
          >
            <StackedColumnChart
              points={report.series}
              groupBy="day"
              series={[...seriesDefs]}
              ariaLabel="Ventas del mes por día, online y local"
              height={220}
            />
          </ChartPanel>

          <ChartPanel
            className="lg:col-span-2"
            title="Lo más vendido del mes"
            subtitle="Por importe vendido"
            isRefreshing={top.isLoading}
          >
            {top.data && top.data.products.length > 0 ? (
              <HorizontalBarChart
                ariaLabel="Productos más vendidos del mes"
                valueLabel="Ventas"
                formatValue={formatMoney}
                rows={top.data.products.map((p) => ({
                  key: `${p.productId}:${p.variantSku}`,
                  label: p.variantLabel ? `${p.productName} · ${p.variantLabel}` : p.productName,
                  value: p.revenue,
                  detail: `${p.units.toLocaleString("es-AR")} u.`,
                }))}
              />
            ) : (
              <p className="py-6 text-center text-sm" style={{ color: "var(--viz-text-2)" }}>
                {top.isLoading ? "Cargando…" : "Todavía no hay ventas este mes."}
              </p>
            )}
          </ChartPanel>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-text">Pedidos recientes</h2>
        {loadingRecent && !recentOrders ? (
          <Spinner />
        ) : recentOrders && recentOrders.items.length > 0 ? (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {recentOrders.items.map((order) => (
              <Link
                key={order._id}
                to={`/admin/pedidos/${order._id}`}
                className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface-alt"
              >
                <div>
                  <p className="text-sm font-medium text-text">Pedido #{order.orderNumber}</p>
                  <p className="text-xs text-text-muted">
                    {new Date(order.createdAt).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-text">{formatMoney(order.total)}</span>
                  <OrderStatusBadge status={order.status} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={Package} title="Todavía no hay pedidos" />
        )}
      </div>
    </div>
  );
}
