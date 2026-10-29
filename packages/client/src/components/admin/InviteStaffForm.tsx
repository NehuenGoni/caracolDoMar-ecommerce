import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@caracol/shared";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { Select } from "@/components/ui/Select";
import { ApiError } from "@/lib/apiClient";
import { inviteStaff } from "@/lib/adminUsersApi";

const ROLE_HINTS: Record<StaffRole, string> = {
  seller: "Cobra en el punto de venta, maneja la caja, consulta stock y pedidos, y los prepara. No ve costos ni toca la configuración.",
  admin: "Puede todo: productos, compras, precios, reportes, configuración y el equipo.",
};

export function InviteStaffForm({ onInvited }: { onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("seller");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await inviteStaff(email, role);
      setEmail("");
      setSuccess(true);
      onInvited();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos enviar la invitación");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Email"
          type="email"
          required
          placeholder="nueva.persona@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Select label="Rol" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          {STAFF_ROLES.map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-xs text-text-muted">{ROLE_HINTS[role]}</p>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      {success && <InlineMessage tone="success">Invitación enviada.</InlineMessage>}
      <div>
        <Button type="submit" isLoading={isSubmitting}>
          Enviar invitación
        </Button>
      </div>
    </form>
  );
}
