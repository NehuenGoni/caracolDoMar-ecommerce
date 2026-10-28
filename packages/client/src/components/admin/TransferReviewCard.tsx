import type { Order } from "@caracol/shared";
import { Landmark } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { reviewTransferPayment } from "@/lib/adminOrdersApi";
import { ApiError } from "@/lib/apiClient";

const isImage = (url: string) => /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(url);

function Receipt({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block w-fit">
      {isImage(url) ? (
        <img src={url} alt="Comprobante de transferencia" className="max-h-72 rounded-xl border border-border" />
      ) : (
        <span className="text-sm font-medium text-accent-deep hover:underline">Ver comprobante adjunto</span>
      )}
    </a>
  );
}

const STATUS_LABEL: Record<string, { label: string; tone: "neutral" | "accent" }> = {
  pending: { label: "Pendiente", tone: "accent" },
  approved: { label: "Pago confirmado", tone: "neutral" },
  rejected: { label: "Comprobante rechazado", tone: "neutral" },
};

interface TransferReviewCardProps {
  order: Order;
  onChange: (order: Order) => void;
}

/** El admin mira el comprobante y confirma o rechaza la transferencia. */
export function TransferReviewCard({ order, onChange }: TransferReviewCardProps) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rejectedReceipts = (order.paymentDetails?.rejectedReceipts as string[] | undefined) ?? [];
  const status = STATUS_LABEL[order.paymentStatus] ?? { label: order.paymentStatus, tone: "neutral" as const };
  const isPaid = order.paymentStatus === "approved";
  const isCancelled = order.status === "cancelled";

  async function review(paymentStatus: "approved" | "rejected") {
    if (paymentStatus === "approved" && isCancelled) {
      const ok = window.confirm(
        "El pedido está cancelado. Si confirmás el pago se vuelve a reservar el stock (si todavía hay). ¿Seguir?",
      );
      if (!ok) return;
    }
    setBusy(paymentStatus);
    setError(null);
    try {
      const result = await reviewTransferPayment(order._id, { paymentStatus, note: note.trim() || undefined });
      onChange(result.order);
      setNote("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos actualizar el pago");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Landmark className="size-4 text-text-muted" />
          <p className="font-display text-lg text-text">Transferencia</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      {order.receiptUrl ? (
        <Receipt url={order.receiptUrl} />
      ) : (
        !isPaid && <p className="text-sm text-text-muted">El cliente todavía no subió el comprobante.</p>
      )}

      {rejectedReceipts.length > 0 && (
        <div className="text-xs text-text-muted">
          Comprobantes rechazados antes:{" "}
          {rejectedReceipts.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="mr-2 underline">
              #{i + 1}
            </a>
          ))}
        </div>
      )}

      {!isPaid && (
        <>
          <Input
            label="Nota (opcional)"
            placeholder="Por ejemplo: el monto no coincide"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            hint="Si rechazás, el cliente la recibe por email."
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" isLoading={busy === "approved"} disabled={busy !== null} onClick={() => review("approved")}>
              Confirmar pago
            </Button>
            {!isCancelled && (
              <Button
                size="sm"
                variant="danger"
                isLoading={busy === "rejected"}
                disabled={busy !== null || !order.receiptUrl}
                onClick={() => review("rejected")}
              >
                Rechazar comprobante
              </Button>
            )}
          </div>
        </>
      )}
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
    </Card>
  );
}
