import type {
  InventoryValuation,
  ReportExportKind,
  ReportGroupBy,
  SalesReport,
  SlowMoverRow,
  TopProductRow,
  TopProductsSort,
} from "@caracol/shared";
import { apiFetch, apiGet } from "./apiClient.js";

const BASE = "/admin/reports";

export const getSalesReport = (from: string, to: string, groupBy: ReportGroupBy) =>
  apiGet<SalesReport>(`${BASE}/sales?from=${from}&to=${to}&groupBy=${groupBy}`);

export const getTopProducts = (from: string, to: string, sort: TopProductsSort, limit = 10) =>
  apiGet<{ products: TopProductRow[] }>(`${BASE}/top-products?from=${from}&to=${to}&sort=${sort}&limit=${limit}`);

export const getInventoryValuation = () => apiGet<InventoryValuation>(`${BASE}/inventory`);

export const getSlowMovers = (days: number) => apiGet<{ items: SlowMoverRow[] }>(`${BASE}/slow-movers?days=${days}`);

export interface ExportParams {
  kind: ReportExportKind;
  from: string;
  to: string;
  groupBy?: ReportGroupBy;
  sort?: TopProductsSort;
  days?: number;
}

/** Baja el reporte como CSV (con la sesión: por eso no es un simple link). */
export async function downloadReportCsv(params: ExportParams): Promise<void> {
  const query = new URLSearchParams({ kind: params.kind, from: params.from, to: params.to });
  if (params.groupBy) query.set("groupBy", params.groupBy);
  if (params.sort) query.set("sort", params.sort);
  if (params.days) query.set("days", String(params.days));

  const blob = await apiFetch<Blob>(`${BASE}/export?${query.toString()}`, { responseType: "blob" });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `caracol-${params.kind}-${params.from}_${params.to}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
