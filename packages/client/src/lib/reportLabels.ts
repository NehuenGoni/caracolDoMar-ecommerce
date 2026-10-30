import type { PaymentMethodFigures, ReportGroupBy } from "@caracol/shared";

export const GROUP_LABELS: Record<ReportGroupBy, string> = { day: "Día", week: "Semana", month: "Mes" };
/** "Ventas por día / semana / mes". */
export const GROUP_NOUN: Record<ReportGroupBy, string> = { day: "día", week: "semana", month: "mes" };

const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  debit: "Débito",
  credit: "Crédito",
  transfer: "Transferencia",
  mercado_pago: "Mercado Pago",
};

const CHANNEL_LABELS = { online: "Online", store: "Local" } as const;

export function paymentLabel(figures: Pick<PaymentMethodFigures, "channel" | "method">): string {
  return `${CHANNEL_LABELS[figures.channel]} · ${METHOD_LABELS[figures.method] ?? figures.method}`;
}

export function salesCount(count: number): string {
  return `${count} venta${count === 1 ? "" : "s"}`;
}
