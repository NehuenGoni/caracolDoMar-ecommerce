import type { SupplierInvoiceImportLine } from "@caracol/shared";
import { formatMoney } from "@caracol/shared";
import { useEffect, useState } from "react";
import { ProductVariantPicker, type VariantSelection } from "@/components/admin/ProductVariantPicker";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { getAdminProduct } from "@/lib/adminProductsApi";
import { ApiError } from "@/lib/apiClient";
import type { LineDecisionInput } from "@/lib/invoiceImportsApi";
import { marginFromPrice, percentChange, priceFromMargin } from "@/lib/invoiceLinePricing";
import { cn } from "@/lib/utils";

interface InvoiceLineRowProps {
  line: SupplierInvoiceImportLine;
  pricingDefaults: { marginPercent: number; roundingStep: number };
  /** true cuando la importación ya salió de "review" (aplicada, aplicándose, etc.). */
  readOnly: boolean;
  onSave: (decision: LineDecisionInput) => Promise<void>;
}

function Delta({ current, previous }: { current: number; previous: number | null }) {
  const change = percentChange(current, previous);
  if (change === null || previous === null) return null;
  return (
    <span className={cn("ml-1", change > 0 ? "text-accent2-deep" : "text-text-muted")}>
      (antes {formatMoney(previous)}, {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%)
    </span>
  );
}

/**
 * Cada línea tiene su propio estado y su propio "Guardar" (en vez de un único submit): se puede
 * revisar y confirmar de a una sin perder el trabajo de las demás, y guardar una línea (que
 * refresca la importación) no reinicia la edición en curso de otra. Por eso el estado se
 * inicializa una sola vez desde `line` y no se resincroniza con cada render del padre.
 */
export function InvoiceLineRow({ line, pricingDefaults, readOnly, onSave }: InvoiceLineRowProps) {
  const [action, setAction] = useState<"link" | "skip">(line.decision.action);
  const [selection, setSelection] = useState<VariantSelection | null>(null);
  const [quantity, setQuantity] = useState(line.decision.quantity);
  const [unitCost, setUnitCost] = useState(line.decision.unitCost);
  const [margin, setMargin] = useState(line.decision.marginPercent ?? pricingDefaults.marginPercent);
  const [salePrice, setSalePrice] = useState(
    line.decision.salePrice ?? priceFromMargin(line.decision.unitCost, pricingDefaults.marginPercent, pricingDefaults.roundingStep),
  );
  const [updateCostPrice, setUpdateCostPrice] = useState(line.decision.updateCostPrice);
  const [updateSalePrice, setUpdateSalePrice] = useState(line.decision.updateSalePrice);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La decisión guarda solo ids: se trae el producto para mostrar su nombre y variante.
  const decidedProduct = line.decision.product;
  const decidedSku = line.decision.variantSku;
  useEffect(() => {
    if (!decidedProduct || !decidedSku) return;
    let cancelled = false;
    getAdminProduct(decidedProduct)
      .then(({ product }) => {
        const variant = product.variants.find((v) => v.sku === decidedSku);
        if (!cancelled && variant) setSelection({ product, variant });
      })
      .catch(() => {
        // Sin el nombre igual se puede guardar: el picker pide elegir de nuevo.
      });
    return () => {
      cancelled = true;
    };
  }, [decidedProduct, decidedSku]);

  function changeCost(cents: number) {
    setUnitCost(cents);
    setSalePrice(priceFromMargin(cents, margin, pricingDefaults.roundingStep));
  }

  function changeMargin(value: number) {
    setMargin(value);
    setSalePrice(priceFromMargin(unitCost, value, pricingDefaults.roundingStep));
  }

  function changePrice(cents: number) {
    setSalePrice(cents);
    setMargin(marginFromPrice(unitCost, cents));
  }

  async function handleSave() {
    setError(null);
    setSaved(false);

    if (action === "link" && !selection) {
      setError("Elegí el producto y la variante.");
      return;
    }

    setSaving(true);
    try {
      await onSave(
        action === "skip" || !selection
          ? { action: "skip" }
          : {
              action: "link",
              product: selection.product._id,
              variantSku: selection.variant.sku,
              quantity,
              unitCost,
              updateCostPrice,
              updateSalePrice,
              marginPercent: margin,
              salePrice,
            },
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar la línea.");
    } finally {
      setSaving(false);
    }
  }

  const tabClass = (active: boolean) =>
    cn(
      "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
      active ? "bg-primary text-on-primary" : "bg-surface-alt text-text-muted",
    );

  return (
    <Card className="flex flex-col gap-4 sm:flex-row">
      {/* Lo que dice la factura: solo lectura */}
      <div className="sm:w-2/5">
        <p className="text-sm font-semibold text-text">{line.raw.description}</p>
        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-text-muted">
          <div>
            SKU proveedor: <span className="font-mono">{line.raw.supplierSku || "—"}</span>
          </div>
          <div>
            Cantidad: {line.raw.quantity} {line.raw.unit}
          </div>
          <div>
            Costo en factura: {line.raw.unitCost != null ? formatMoney(line.raw.unitCost) : "sin precio (remito)"}
          </div>
          <div>Confianza de la IA: {Math.round(line.raw.modelConfidence * 100)}%</div>
        </dl>
        {line.raw.modelNotes && <p className="mt-1.5 text-xs italic text-text-muted">“{line.raw.modelNotes}”</p>}
        {line.match.status === "matched" ? (
          <p className="mt-1.5 text-xs font-semibold text-support">
            Coincidencia automática por {line.match.method === "barcode" ? "código de barras" : "SKU"}
          </p>
        ) : (
          <p className="mt-1.5 text-xs font-semibold text-accent2-deep">Sin coincidencia: vinculala a mano</p>
        )}
      </div>

      {/* La decisión: editable */}
      <div className="flex-1">
        <div className="flex gap-1.5">
          <button type="button" disabled={readOnly} onClick={() => setAction("link")} className={tabClass(action === "link")}>
            Vincular
          </button>
          <button type="button" disabled={readOnly} onClick={() => setAction("skip")} className={tabClass(action === "skip")}>
            Omitir
          </button>
        </div>

        {action === "link" && (
          <div className="mt-3 flex flex-col gap-3">
            {readOnly && selection ? (
              <p className="text-sm text-text">
                {selection.product.name} · SKU {selection.variant.sku}
              </p>
            ) : (
              <ProductVariantPicker
                value={selection}
                onChange={setSelection}
                onClear={() => setSelection(null)}
                // Los kits no reciben mercadería: se compra por componente.
                filter={(product) => !product.isBundle}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Cantidad"
                type="number"
                min={1}
                disabled={readOnly}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
              <MoneyInput label="Costo unitario (sin IVA)" disabled={readOnly} value={unitCost} onChange={changeCost} />
            </div>

            <div className="flex flex-col gap-2.5 rounded-xl bg-surface-alt p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Costo: <strong>{formatMoney(unitCost)}</strong>
                  <Delta current={unitCost} previous={line.match.currentCostPrice} />
                </span>
                <label className="flex items-center gap-1.5 font-semibold text-text">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={updateCostPrice}
                    onChange={(e) => setUpdateCostPrice(e.target.checked)}
                    className="size-4 accent-accent"
                  />
                  Actualizar costo
                </label>
              </div>

              <div className="grid grid-cols-2 items-end gap-3">
                <Input
                  label="Margen (%)"
                  type="number"
                  min={0}
                  disabled={readOnly}
                  value={margin}
                  onChange={(e) => changeMargin(Number(e.target.value))}
                />
                <MoneyInput label="Precio de venta" disabled={readOnly} value={salePrice} onChange={changePrice} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Precio: <strong>{formatMoney(salePrice)}</strong>
                  <Delta current={salePrice} previous={line.match.currentPrice} />
                </span>
                <label className="flex items-center gap-1.5 font-semibold text-text">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={updateSalePrice}
                    onChange={(e) => setUpdateSalePrice(e.target.checked)}
                    className="size-4 accent-accent"
                  />
                  Actualizar precio
                </label>
              </div>
            </div>
          </div>
        )}

        {!readOnly && (
          <div className="mt-3 flex items-center gap-3">
            <Button type="button" size="sm" variant="secondary" isLoading={saving} onClick={handleSave}>
              Guardar línea
            </Button>
            {saved && !error && <span className="text-xs font-semibold text-support">Guardado</span>}
            {error && <span className="text-xs font-semibold text-accent2-deep">{error}</span>}
          </div>
        )}
      </div>
    </Card>
  );
}
