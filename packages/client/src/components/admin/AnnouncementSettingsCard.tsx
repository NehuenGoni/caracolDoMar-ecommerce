import type { AnnouncementSettings } from "@caracol/shared";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/apiClient";
import { todayKey } from "@/lib/dateRanges";
import { updateAnnouncementSettings } from "@/lib/settingsApi";

const MAX_LENGTH = 160;

/** La barra de avisos de la tienda: horarios especiales, feriados, una novedad. */
export function AnnouncementSettingsCard({ initial }: { initial: AnnouncementSettings }) {
  const [value, setValue] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const today = todayKey();
  const expired = value.enabled && value.until !== null && value.until < today;

  function patch(next: Partial<AnnouncementSettings>) {
    setValue((prev) => ({ ...prev, ...next }));
    setSaved(false);
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      const { settings } = await updateAnnouncementSettings({ ...value, text: value.text.trim() });
      setValue(settings.announcement);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar el aviso");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-lg text-text">Aviso en la tienda</p>
          <p className="text-sm text-text-muted">
            Una línea arriba de todas las páginas: horarios especiales, feriados, una novedad. Si le ponés fecha, se
            apaga sola al terminar ese día.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
            className="size-4 rounded border-border accent-accent"
          />
          Visible
        </label>
      </div>

      <Input
        label="Texto del aviso"
        placeholder="Jueves 20 feriado: el local abre de 10 a 14 h"
        maxLength={MAX_LENGTH}
        hint={`${value.text.length}/${MAX_LENGTH}`}
        value={value.text}
        onChange={(e) => patch({ text: e.target.value })}
      />
      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="Mostrar hasta (opcional)"
          type="date"
          min={today}
          value={value.until ?? ""}
          onChange={(e) => patch({ until: e.target.value || null })}
        />
        {value.until && (
          <Button variant="ghost" onClick={() => patch({ until: null })}>
            Sin fecha
          </Button>
        )}
      </div>

      {expired && <InlineMessage tone="info">La fecha ya pasó: el aviso no se está mostrando.</InlineMessage>}
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      {saved && <InlineMessage tone="success">Aviso guardado.</InlineMessage>}
      <div>
        <Button isLoading={isSaving} onClick={save}>
          Guardar aviso
        </Button>
      </div>
    </Card>
  );
}
