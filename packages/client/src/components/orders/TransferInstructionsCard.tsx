import type { Order, TransferInstructions } from "@caracol/shared";
import { formatMoney } from "@caracol/shared";
import { Check, Copy, Landmark, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/apiClient";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import { attachReceipt, getTransferInstructions, signReceiptUpload } from "@/lib/ordersApi";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sin permiso de portapapeles el dato sigue visible para copiarlo a mano.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copiar ${label}`}
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-alt"
    >
      {copied ? <Check className="size-4 text-support" /> : <Copy className="size-4" />}
    </button>
  );
}

function Row({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="flex items-center gap-1 text-right font-medium text-text">
        {value}
        {copyable && <CopyButton value={value} label={label} />}
      </span>
    </div>
  );
}

const formatDeadline = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short" });

interface TransferInstructionsCardProps {
  order: Order;
  /** Se llama con el pedido actualizado después de subir un comprobante. */
  onOrderChange: (order: Order) => void;
}

/** Datos para transferir y subida del comprobante de un pedido pagado por transferencia. */
export function TransferInstructionsCard({ order, onOrderChange }: TransferInstructionsCardProps) {
  const [info, setInfo] = useState<TransferInstructions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    getTransferInstructions(order._id)
      .then(setInfo)
      .catch((err: unknown) =>
        setLoadError(err instanceof ApiError ? err.message : "No pudimos cargar los datos para transferir"),
      );
  }, [order._id]);

  // Se recarga cuando cambia el estado del pago o el comprobante (por ejemplo, tras subirlo).
  useEffect(load, [load, order.paymentStatus, order.receiptUrl]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const signed = await signReceiptUpload(order._id);
      const url = await uploadToCloudinary(file, signed);
      const result = await attachReceipt(order._id, url);
      onOrderChange(result.order);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "No pudimos subir el comprobante");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (loadError) return <InlineMessage tone="error">{loadError}</InlineMessage>;
  if (!info) return <Spinner label="Cargando los datos para transferir…" />;

  const isPaid = order.paymentStatus === "approved";
  const isCancelled = order.status === "cancelled";
  const awaitingReview = Boolean(info.receiptUrl) && order.paymentStatus === "pending";
  const wasRejected = order.paymentStatus === "rejected";
  const canUpload = !isPaid && !isCancelled && !awaitingReview;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Landmark className="size-4 text-text-muted" />
        <h2 className="font-display text-lg text-text">Pago por transferencia</h2>
      </div>

      {isPaid ? (
        <InlineMessage tone="success">¡Recibimos tu transferencia! Tu pedido está confirmado.</InlineMessage>
      ) : isCancelled ? (
        <InlineMessage tone="error">
          El pedido se canceló porque no recibimos el comprobante a tiempo. Si ya transferiste, escribinos y lo
          resolvemos.
        </InlineMessage>
      ) : (
        <>
          <div className="rounded-xl bg-surface-alt px-4 py-3">
            <p className="text-sm text-text-muted">Importe a transferir</p>
            <p className="font-display text-2xl text-text">{formatMoney(info.amount)}</p>
          </div>

          <div className="divide-y divide-border">
            <Row label="Titular" value={info.transfer.accountHolder} />
            <Row label="Banco" value={info.transfer.bankName} />
            <Row label="CBU / CVU" value={info.transfer.cbu} copyable />
            <Row label="Alias" value={info.transfer.alias} copyable />
            <Row label="CUIT / CUIL" value={info.transfer.taxId} />
          </div>

          {info.transfer.instructions && <p className="text-sm text-text-muted">{info.transfer.instructions}</p>}

          {wasRejected && (
            <InlineMessage tone="error">
              No pudimos confirmar el comprobante anterior. Subí uno válido para que podamos confirmar tu pedido.
            </InlineMessage>
          )}

          {awaitingReview ? (
            <InlineMessage tone="info">
              Recibimos tu comprobante y lo estamos revisando. Te avisamos por email cuando confirmemos el pago.{" "}
              {info.receiptUrl && (
                <a href={info.receiptUrl} target="_blank" rel="noreferrer" className="font-medium underline">
                  Ver comprobante
                </a>
              )}
            </InlineMessage>
          ) : (
            canUpload && (
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  className="w-fit"
                  isLoading={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-4" /> Subir comprobante
                </Button>
                {info.expiresAt && (
                  <p className="text-xs text-text-muted">
                    Guardamos tus productos hasta el {formatDeadline(info.expiresAt)}. Si para entonces no subiste
                    el comprobante, el pedido se cancela.
                  </p>
                )}
              </div>
            )
          )}
          {uploadError && <InlineMessage tone="error">{uploadError}</InlineMessage>}
        </>
      )}
    </Card>
  );
}
