import type { Supplier } from "@caracol/shared";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError } from "@/lib/apiClient";
import type { SupplierInput } from "@/lib/suppliersApi";

interface SupplierFormProps {
  initialValue?: Supplier;
  onSubmit: (input: SupplierInput) => Promise<void>;
  onCancel: () => void;
}

export function SupplierForm({ initialValue, onSubmit, onCancel }: SupplierFormProps) {
  const [values, setValues] = useState<SupplierInput>({
    name: initialValue?.name ?? "",
    taxId: initialValue?.taxId ?? "",
    contactName: initialValue?.contactName ?? "",
    phone: initialValue?.phone ?? "",
    email: initialValue?.email ?? "",
    address: initialValue?.address ?? "",
    notes: initialValue?.notes ?? "",
    isActive: initialValue?.isActive ?? true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SupplierInput>(key: K, value: SupplierInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar el proveedor");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nombre" required value={values.name} onChange={(e) => set("name", e.target.value)} />
        <Input label="CUIT (opcional)" value={values.taxId} onChange={(e) => set("taxId", e.target.value)} />
        <Input
          label="Persona de contacto (opcional)"
          value={values.contactName}
          onChange={(e) => set("contactName", e.target.value)}
        />
        <Input label="Teléfono (opcional)" value={values.phone} onChange={(e) => set("phone", e.target.value)} />
        <Input
          label="Email (opcional)"
          type="email"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
        />
        <Input label="Dirección (opcional)" value={values.address} onChange={(e) => set("address", e.target.value)} />
      </div>
      <Textarea label="Notas (opcional)" value={values.notes} onChange={(e) => set("notes", e.target.value)} />
      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={values.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
          className="size-4 rounded border-border accent-accent"
        />
        Activo (se puede elegir en compras y productos)
      </label>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <div className="flex gap-3">
        <Button type="submit" isLoading={isSubmitting}>
          Guardar proveedor
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
