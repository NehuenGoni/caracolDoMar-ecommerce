import { formatMoney } from "@caracol/shared";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { InvoiceImportStatusBadge } from "@/components/admin/InvoiceImportStatusBadge";
import { InvoiceLineRow } from "@/components/admin/InvoiceLineRow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { useInvoiceImport } from "@/hooks/admin/useInvoiceImport";
import { useSuppliers } from "@/hooks/admin/useSuppliers";
import { ApiError } from "@/lib/apiClient";
import {
  applyInvoiceImport,
  discardInvoiceImport,
  patchImportLine,
  updateImportHeader,
  type LineDecisionInput,
} from "@/lib/invoiceImportsApi";

function FilePreview({ fileUrl, mimeType }: { fileUrl: string; mimeType: string }) {
  if (!fileUrl) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-border p-4 text-center text-sm text-text-muted">
        Vista previa no disponible (el archivo no se pudo guardar en este ambiente).
      </div>
    );
  }
  if (mimeType === "application/pdf") {
    return <iframe src={fileUrl} title="Factura" className="h-[32rem] w-full rounded-2xl border border-border" />;
  }
  return <img src={fileUrl} alt="Factura" className="w-full rounded-2xl border border-border object-contain" />;
}

export default function AdminInvoiceImportReview() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refresh } = useInvoiceImport(id);
  const { suppliers } = useSuppliers();

  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [applyNotes, setApplyNotes] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  // Depende de campos puntuales (no de `data`) a propósito: `data` cambia de referencia en cada
  // refresco de la lectura, y pisaría lo que el admin está escribiendo aunque nada haya cambiado.
  const importId = data?.import._id;
  const serverSupplierId = data?.import.supplierId;
  const serverSupplier = data?.import.supplier;
  useEffect(() => {
    if (serverSupplier === undefined) return;
    setSupplierId(serverSupplierId ?? "");
    setSupplierName(serverSupplier);
  }, [importId, serverSupplierId, serverSupplier]);

  if (isLoading && !data) return <Spinner label="Cargando la importación…" />;
  if (error || !data) return <InlineMessage tone="error">{error ?? "No pudimos cargar la importación."}</InlineMessage>;

  const { import: imp, fileUrl, pricingDefaults } = data;
  const editable = imp.status === "review";

  const supplierChanged = supplierId !== (imp.supplierId ?? "") || (!supplierId && supplierName.trim() !== imp.supplier);

  async function handleSaveSupplier() {
    if (!id) return;
    setSavingSupplier(true);
    setHeaderError(null);
    try {
      await updateImportHeader(
        id,
        supplierId ? { supplierId } : { supplierId: null, supplier: supplierName.trim() || undefined },
      );
      await refresh();
    } catch (err) {
      setHeaderError(err instanceof ApiError ? err.message : "No pudimos guardar el proveedor");
    } finally {
      setSavingSupplier(false);
    }
  }

  async function handleSaveLine(lineNumber: number, decision: LineDecisionInput) {
    if (!id) return;
    await patchImportLine(id, lineNumber, decision);
    await refresh();
  }

  async function handleApply() {
    if (!id) return;
    setApplying(true);
    setApplyError(null);
    try {
      await applyInvoiceImport(id, { notes: applyNotes || undefined });
      await refresh();
    } catch (err) {
      setApplyError(err instanceof ApiError ? err.message : "No pudimos aplicar la importación.");
    } finally {
      setApplying(false);
    }
  }

  async function handleDiscard() {
    if (!id) return;
    setDiscarding(true);
    try {
      await discardInvoiceImport(id);
      setConfirmDiscard(false);
      await refresh();
    } catch (err) {
      setConfirmDiscard(false);
      setApplyError(err instanceof ApiError ? err.message : "No pudimos descartar la importación.");
    } finally {
      setDiscarding(false);
    }
  }

  const linked = imp.lines.filter((line) => line.decision.action === "link");
  const totalCents = linked.reduce((sum, line) => sum + line.decision.unitCost * line.decision.quantity, 0);
  const costUpdates = linked.filter((line) => line.decision.updateCostPrice).length;
  const priceUpdates = linked.filter((line) => line.decision.updateSalePrice).length;
  const hasSupplier = Boolean(imp.supplierId || imp.supplier);
  const canApply = editable && linked.length > 0 && hasSupplier && !supplierChanged;
  const showLines = ["review", "applying", "applied"].includes(imp.status);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/admin/compras/importaciones" className="text-sm text-text-muted hover:text-text">
          ← Volver a importaciones
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-text">Revisar factura</h1>
          <InvoiceImportStatusBadge status={imp.status} />
        </div>
      </div>

      {(imp.status === "uploaded" || imp.status === "extracting") && (
        <Card className="flex flex-col items-center gap-2 py-8 text-center">
          <Loader2 className="size-6 animate-spin text-accent-deep" />
          <p className="font-medium text-text">Una IA está leyendo la factura…</p>
          <p className="text-sm text-text-muted">
            Puede tardar hasta un minuto. Esta página se actualiza sola, no hace falta recargarla.
          </p>
        </Card>
      )}

      {imp.status === "failed" && (
        <InlineMessage tone="error">
          No pudimos leer la factura: {imp.extraction.lastError || "ocurrió un error inesperado"}. Para reintentar,
          subí el mismo archivo de nuevo desde{" "}
          <Link to="/admin/compras/importaciones" className="font-semibold underline">
            Importaciones
          </Link>
          .
        </InlineMessage>
      )}

      {imp.status === "discarded" && <p className="text-sm text-text-muted">Esta importación fue descartada.</p>}

      {imp.status === "applied" && (
        <InlineMessage tone="success">
          Importación aplicada: se registró la compra y se actualizaron el stock y los precios.{" "}
          <Link to="/admin/compras" className="font-semibold underline">
            Ver compras
          </Link>
        </InlineMessage>
      )}

      {showLines && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <div className="flex flex-col gap-4">
            <FilePreview fileUrl={fileUrl} mimeType={imp.file.mimeType} />

            <Card className="flex flex-col gap-3 text-sm">
              <Select
                label="Proveedor registrado"
                disabled={!editable}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">Ninguno (usar el nombre de la factura)</option>
                {suppliers.map((supplier) => (
                  <option key={supplier._id} value={supplier._id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
              {!supplierId && (
                <Input
                  label="Nombre en la factura"
                  disabled={!editable}
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                />
              )}
              {editable && supplierChanged && (
                <Button type="button" size="sm" variant="secondary" className="w-fit" isLoading={savingSupplier} onClick={handleSaveSupplier}>
                  Guardar proveedor
                </Button>
              )}
              {headerError && <InlineMessage tone="error">{headerError}</InlineMessage>}
              <p className="text-text-muted">
                {imp.documentType !== "desconocido" && <>Tipo: {imp.documentType} · </>}
                {imp.documentNumber && <>Nº {imp.documentNumber} · </>}
                Moneda: {imp.currency}
                {imp.supplierTaxId && <> · CUIT {imp.supplierTaxId}</>}
              </p>
              {imp.currency === "USD" && (
                <InlineMessage tone="error">
                  Esta factura está en dólares: los importes se leen tal cual vienen. Convertilos a pesos antes de
                  aplicar.
                </InlineMessage>
              )}
              {imp.totals.total != null && (
                <p className="font-semibold text-text">Total de la factura: {formatMoney(imp.totals.total)}</p>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-3">
            {imp.lines.length === 0 && (
              <p className="text-sm text-text-muted">La IA no encontró líneas de productos en este documento.</p>
            )}
            {imp.lines.map((line) => (
              <InvoiceLineRow
                key={line.lineNumber}
                line={line}
                pricingDefaults={pricingDefaults}
                readOnly={!editable}
                onSave={(decision) => handleSaveLine(line.lineNumber, decision)}
              />
            ))}

            {editable && (
              <Card className="flex flex-col gap-3">
                <p className="text-sm text-text">
                  <strong>{imp.lines.length}</strong> líneas: <strong>{linked.length}</strong> para registrar y{" "}
                  <strong>{imp.lines.length - linked.length}</strong> omitidas · Total{" "}
                  <strong>{formatMoney(totalCents)}</strong> · se actualizan <strong>{costUpdates}</strong> costos y{" "}
                  <strong>{priceUpdates}</strong> precios
                </p>
                <Textarea
                  label="Notas de la compra (opcional)"
                  rows={2}
                  value={applyNotes}
                  onChange={(e) => setApplyNotes(e.target.value)}
                />
                {!hasSupplier && <p className="text-xs font-semibold text-accent2-deep">Cargá el proveedor antes de aplicar.</p>}
                {supplierChanged && (
                  <p className="text-xs font-semibold text-accent2-deep">Guardá el proveedor antes de aplicar.</p>
                )}
                {applyError && <InlineMessage tone="error">{applyError}</InlineMessage>}
                <div className="flex flex-wrap gap-3">
                  <Button type="button" size="lg" isLoading={applying} disabled={!canApply} onClick={handleApply}>
                    Aplicar importación
                  </Button>
                  <Button type="button" size="lg" variant="ghost" onClick={() => setConfirmDiscard(true)}>
                    Descartar
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        title="¿Descartar esta importación?"
        description="No se registra ninguna compra. Si la necesitás después, podés volver a subir el archivo."
        confirmLabel="Descartar"
        tone="danger"
        isLoading={discarding}
        onConfirm={handleDiscard}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}
