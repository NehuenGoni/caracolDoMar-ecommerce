import type { User } from "@caracol/shared";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/apiClient";
import { listPendingInvites, listStaff, type StaffInvite } from "@/lib/adminUsersApi";

/** El equipo (admins y vendedores) y las invitaciones que todavía nadie aceptó. */
export function useAdminUsers() {
  const [staff, setStaff] = useState<User[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    Promise.all([listStaff(), listPendingInvites()])
      .then(([staffResult, invitesResult]) => {
        if (!cancelled) {
          setStaff(staffResult.staff);
          setInvites(invitesResult.invites);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "No pudimos cargar el equipo");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { staff, invites, isLoading, error, reload };
}
