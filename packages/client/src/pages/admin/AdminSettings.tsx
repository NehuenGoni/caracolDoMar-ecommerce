import { formatMoney, suggestedPrice, type PricingSettings, type TransferSettings } from "@caracol/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError } from "@/lib/apiClient";
import { getSettings, updatePricingSettings, updateTransferSettings } from "@/lib/settingsApi";

/** Un costo de ejemplo para que se vea qué precio daría la configuración elegida. */
const EXAMPLE_COST = 123400;

type SaveState = { isSaving: boolean; error: string | null; success: boolean };
const IDLE: SaveState = { isSaving: false, error: null, success: false };

function SaveFeedback({ state }: { state: SaveState }) {
  return (
    <>
      {state.error && <InlineMessage tone="error">{state.error}</InlineMessage>}
      {state.success && <InlineMessage tone="success">Configuración guardada.</InlineMessage>}
    </>
  );
}

export default function AdminSettings() {
  const [pricing, setPricing] = useState<PricingSettings | null>(null);
  const [transfer, setTransfer] = useState<TransferSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pricingSave, setPricingSave] = useState<SaveState>(IDLE);
  const [transferSave, setTransferSave] = useState<SaveState>(IDLE);

  useEffect(() => {
    getSettings()
      .then(({ settings }) => {
        setPricing(settings.pricing);
        setTransfer(settings.transfer);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "No pudimos cargar la configuración"))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <Spinner label="Cargando configuración…" />;
  if (!pricing || !transfer) {
    return <InlineMessage tone="error">{loadError ?? "No pudimos cargar la configuración."}</InlineMessage>;
  }

  function patchPricing(next: Partial<PricingSettings>) {
    setPricing((prev) => (prev ? { ...prev, ...next } : prev));
    setPricingSave(IDLE);
  }

  function patchTransfer(next: Partial<TransferSettings>) {
    setTransfer((prev) => (prev ? { ...prev, ...next } : prev));
    setTransferSave(IDLE);
  }

  async function savePricing() {
    if (!pricing) return;
    setPricingSave({ isSaving: true, error: null, success: false });
    try {
      const { settings } = await updatePricingSettings(pricing);
      setPricing(settings.pricing);
      setPricingSave({ isSaving: false, error: null, success: true });
    } catch (err) {
      setPricingSave({
        isSaving: false,
        error: err instanceof ApiError ? err.message : "No pudimos guardar la configuración",
        success: false,
      });
    }
  }

  async function saveTransfer() {
    if (!transfer) return;
    setTransferSave({ isSaving: true, error: null, success: false });
    try {
      const { settings } = await updateTransferSettings(transfer);
      setTransfer(settings.transfer);
      setTransferSave({ isSaving: false, error: null, success: true });
    } catch (err) {
      setTransferSave({
        isSaving: false,
        error: err instanceof ApiError ? err.message : "No pudimos guardar la configuración",
        success: false,
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-text">Ajustes</h1>

      <Card className="flex flex-col gap-4">
        <div>
          <p className="font-display text-lg text-text">Precios</p>
          <p className="text-sm text-text-muted">
            Con estos valores se calcula el precio de venta sugerido a partir del costo (al registrar una compra o
            importar una factura).
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Margen sobre el costo (%)"
            type="number"
            min={0}
            max={1000}
            step="any"
            value={pricing.marginPercent}
            onChange={(e) => patchPricing({ marginPercent: Number(e.target.value) })}
          />
          <MoneyInput
            label="Redondear hacia arriba de a"
            value={pricing.roundingStep}
            onChange={(cents) => patchPricing({ roundingStep: Math.max(1, cents) })}
          />
        </div>

        <p className="rounded-xl bg-surface-alt px-4 py-3 text-sm text-text-muted">
          Ejemplo: un producto que te cuesta {formatMoney(EXAMPLE_COST)} se vendería a{" "}
          <span className="font-medium text-text">{formatMoney(suggestedPrice(EXAMPLE_COST, pricing))}</span>.
        </p>

        <label className="flex items-start gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={pricing.autoPriceOnPurchase}
            onChange={(e) => patchPricing({ autoPriceOnPurchase: e.target.checked })}
            className="mt-0.5 size-4 rounded border-border accent-accent"
          />
          <span>
            Recalcular el precio de venta al registrar una compra
            <span className="block text-xs text-text-muted">
              Si está apagado, una compra solo actualiza el costo y el stock: los precios que cargaste a mano no
              cambian. En la importación de facturas el precio siempre lo decidís línea por línea.
            </span>
          </span>
        </label>

        <SaveFeedback state={pricingSave} />
        <div>
          <Button isLoading={pricingSave.isSaving} onClick={savePricing}>
            Guardar precios
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-lg text-text">Transferencia bancaria</p>
            <p className="text-sm text-text-muted">
              Si la habilitás, en el checkout el cliente puede elegir pagar por transferencia: reservamos sus
              productos 48 horas y él sube el comprobante, que vos confirmás desde el pedido.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={transfer.enabled}
              onChange={(e) => patchTransfer({ enabled: e.target.checked })}
              className="size-4 rounded border-border accent-accent"
            />
            Habilitada
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Titular de la cuenta"
            value={transfer.accountHolder}
            onChange={(e) => patchTransfer({ accountHolder: e.target.value })}
          />
          <Input
            label="Banco (opcional)"
            value={transfer.bankName}
            onChange={(e) => patchTransfer({ bankName: e.target.value })}
          />
          <Input
            label="CBU / CVU"
            inputMode="numeric"
            maxLength={22}
            hint="22 dígitos"
            value={transfer.cbu}
            onChange={(e) => patchTransfer({ cbu: e.target.value.replace(/\D/g, "") })}
          />
          <Input label="Alias" value={transfer.alias} onChange={(e) => patchTransfer({ alias: e.target.value })} />
          <Input
            label="CUIT / CUIL (opcional)"
            value={transfer.taxId}
            onChange={(e) => patchTransfer({ taxId: e.target.value })}
          />
        </div>
        <Textarea
          label="Mensaje para el cliente (opcional)"
          placeholder="Por ejemplo: poné tu número de pedido en el concepto"
          value={transfer.instructions}
          onChange={(e) => patchTransfer({ instructions: e.target.value })}
        />

        <SaveFeedback state={transferSave} />
        <div>
          <Button isLoading={transferSave.isSaving} onClick={saveTransfer}>
            Guardar transferencia
          </Button>
        </div>
      </Card>
    </div>
  );
}
