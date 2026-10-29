import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@caracol/shared";
import { Mail, ShieldCheck, Store, UserX } from "lucide-react";
import { useState } from "react";
import { InviteStaffForm } from "@/components/admin/InviteStaffForm";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminUsers } from "@/hooks/admin/useAdminUsers";
import { ApiError } from "@/lib/apiClient";
import { changeStaffRole, revokeInvite, revokeStaff } from "@/lib/adminUsersApi";

export default function AdminTeam() {
  const { user: currentUser } = useAuth();
  const { staff, invites, isLoading, error, reload } = useAdminUsers();
  const [pendingRevoke, setPendingRevoke] = useState<{ type: "staff" | "invite"; id: string; label: string } | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleRevoke() {
    if (!pendingRevoke) return;
    setIsRevoking(true);
    setActionError(null);
    try {
      if (pendingRevoke.type === "staff") await revokeStaff(pendingRevoke.id);
      else await revokeInvite(pendingRevoke.id);
      setPendingRevoke(null);
      reload();
    } catch (err) {
      setPendingRevoke(null);
      setActionError(err instanceof ApiError ? err.message : "No pudimos completar la acción");
    } finally {
      setIsRevoking(false);
    }
  }

  async function handleChangeRole(id: string, role: StaffRole) {
    setActionError(null);
    try {
      await changeStaffRole(id, role);
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "No pudimos cambiar el rol");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-text">Equipo</h1>

      <Card>
        <p className="mb-4 font-display text-lg text-text">Invitar a alguien al equipo</p>
        <InviteStaffForm onInvited={reload} />
      </Card>

      {(error || actionError) && <InlineMessage tone="error">{error ?? actionError}</InlineMessage>}

      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-lg text-text">Integrantes</h2>
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {staff.map((member) => {
                const isMe = member._id === currentUser?._id;
                const Icon = member.role === "admin" ? ShieldCheck : Store;
                return (
                  <div key={member._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Icon className="size-4 text-accent-deep" />
                      <div>
                        <p className="text-sm font-medium text-text">
                          {member.firstName} {member.lastName}
                          {isMe && <span className="ml-1.5 text-xs text-text-muted">(vos)</span>}
                        </p>
                        <p className="text-xs text-text-muted">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isMe ? (
                        <Badge tone="accent">{ROLE_LABELS[member.role]}</Badge>
                      ) : (
                        <>
                          <select
                            aria-label={`Rol de ${member.firstName}`}
                            value={member.role}
                            onChange={(e) => handleChangeRole(member._id, e.target.value as StaffRole)}
                            className="h-9 rounded-xl border border-border bg-surface px-3 text-sm text-text"
                          >
                            {STAFF_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingRevoke({ type: "staff", id: member._id, label: `${member.firstName} ${member.lastName}` })
                            }
                            aria-label={`Sacar del equipo a ${member.firstName}`}
                            className="flex size-8 items-center justify-center rounded-full text-accent2-deep hover:bg-surface-alt"
                          >
                            <UserX className="size-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {invites.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-lg text-text">Invitaciones pendientes</h2>
              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {invites.map((invite) => (
                  <div key={invite._id} className="flex items-center justify-between gap-3 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Mail className="size-4 text-text-muted" />
                      <div>
                        <p className="text-sm font-medium text-text">{invite.email}</p>
                        <p className="text-xs text-text-muted">
                          {ROLE_LABELS[invite.role]} · vence el {new Date(invite.expiresAt).toLocaleDateString("es-AR")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone="warning">Pendiente</Badge>
                      <button
                        type="button"
                        onClick={() => setPendingRevoke({ type: "invite", id: invite._id, label: invite.email })}
                        aria-label={`Revocar invitación a ${invite.email}`}
                        className="flex size-8 items-center justify-center rounded-full text-accent2-deep hover:bg-surface-alt"
                      >
                        <UserX className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingRevoke !== null}
        title={pendingRevoke?.type === "staff" ? `¿Sacar a ${pendingRevoke.label} del equipo?` : `¿Revocar la invitación a ${pendingRevoke?.label}?`}
        description={
          pendingRevoke?.type === "staff"
            ? "Deja de poder entrar al panel y se le cierran todas las sesiones. Su cuenta sigue como cliente."
            : "La invitación dejará de ser válida."
        }
        confirmLabel={pendingRevoke?.type === "staff" ? "Sacar del equipo" : "Revocar"}
        tone="danger"
        isLoading={isRevoking}
        onConfirm={handleRevoke}
        onCancel={() => setPendingRevoke(null)}
      />
    </div>
  );
}
