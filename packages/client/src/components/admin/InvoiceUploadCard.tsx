import type { SupplierInvoiceImport } from "@caracol/shared";
import { Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { Select } from "@/components/ui/Select";
import { useSuppliers } from "@/hooks/admin/useSuppliers";
import { ApiError } from "@/lib/apiClient";
import { uploadInvoice } from "@/lib/invoiceImportsApi";

interface InvoiceUploadCardProps {
  onUploaded: (imp: SupplierInvoiceImport) => void;
  /** false si falta la clave de la IA: se avisa y no se deja subir. */
  extractionConfigured: boolean;
}

export function InvoiceUploadCard({ onUploaded, extractionConfigured }: InvoiceUploadCardProps) {
  const { suppliers } = useSuppliers();
  const [supplierId, setSupplierId] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    try {
      onUploaded(await uploadInvoice(file, supplierId || undefined));
      setSupplierId("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos subir la factura. Probá de nuevo.");
    } finally {
      setIsUploading(false);
      // Permite volver a elegir el mismo archivo si hace falta reintentar.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="font-display text-lg text-text">Importar factura de proveedor</p>
        <p className="mt-1 text-sm text-text-muted">
          Subí el PDF o una foto de la factura o el remito. Una IA lee las líneas y las deja listas para que las
          revises antes de registrar la compra: no toca el stock ni los precios hasta que vos lo confirmes.
        </p>
      </div>

      {!extractionConfigured && (
        <InlineMessage tone="error">
          La lectura por IA no está configurada en este ambiente (falta la clave ANTHROPIC_API_KEY del server).
        </InlineMessage>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <Select
            label="Proveedor (opcional)"
            value={supplierId}
            disabled={isUploading}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Que lo detecte la IA</option>
            {suppliers.map((supplier) => (
              <option key={supplier._id} value={supplier._id}>
                {supplier.name}
              </option>
            ))}
          </Select>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={isUploading || !extractionConfigured}
          onChange={handleFileChange}
        />
        <Button
          type="button"
          isLoading={isUploading}
          disabled={!extractionConfigured}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-4" /> Elegir archivo
        </Button>
      </div>

      {error && <InlineMessage tone="error">{error}</InlineMessage>}
    </Card>
  );
}
