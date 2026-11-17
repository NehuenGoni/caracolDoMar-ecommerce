import type { Permission, User } from "@caracol/shared";
import { createContext, useContext } from "react";
import type * as authApi from "@/lib/authApi";

// El contexto y el hook viven aparte del provider (AuthContext.tsx) para que el
// fast refresh funcione: un archivo de componentes solo exporta componentes.

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: authApi.RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  acceptInvite: (input: authApi.AcceptInviteInput) => Promise<void>;
  /** ¿Tiene el usuario actual este permiso? (comodidad de la UI: el server lo vuelve a chequear). */
  can: (permission: Permission) => boolean;
  /** Actualiza el usuario en memoria tras una respuesta del backend (editar perfil, direcciones). */
  setUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
