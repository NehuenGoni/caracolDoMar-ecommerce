import type { SupplierInvoiceImportStatus } from "@caracol/shared";
import { Badge } from "@/components/ui/Badge";

type Tone = "neutral" | "accent" | "support" | "warning" | "danger";

const STATUS: Record<SupplierInvoiceImportStatus, { label: string; tone: Tone }> = {
  uploaded: { label: "Subida", tone: "warning" },
  extracting: { label: "Leyendo con IA", tone: "warning" },
  review: { label: "Para revisar", tone: "accent" },
  applying: { label: "Aplicando", tone: "warning" },
  applied: { label: "Aplicada", tone: "support" },
  failed: { label: "Falló", tone: "danger" },
  discarded: { label: "Descartada", tone: "neutral" },
};

export function InvoiceImportStatusBadge({ status }: { status: SupplierInvoiceImportStatus }) {
  const { label, tone } = STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}
