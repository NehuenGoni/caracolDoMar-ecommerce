import { hasPermission, isStaff, type Permission, type Role } from "@caracol/shared";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui/Spinner";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Un rol exacto. */
  role?: Role;
  /** Cualquiera del equipo (admin o vendedor): lo que necesita para entrar al panel. */
  staff?: boolean;
  /** Un permiso puntual (ver `ROLE_PERMISSIONS` en shared). */
  permission?: Permission;
  /** A dónde mandar a quien no tiene acceso. */
  redirectTo?: string;
}

/**
 * Esto es comodidad, no seguridad: el server vuelve a chequear cada request. Sirve para no mostrar
 * pantallas a las que la persona no puede entrar.
 */
export function ProtectedRoute({ children, role, staff, permission, redirectTo = "/" }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return <Spinner label="Verificando tu sesión…" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const allowed =
    (!role || user?.role === role) &&
    (!staff || isStaff(user?.role)) &&
    (!permission || hasPermission(user?.role, permission));

  if (!allowed) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
