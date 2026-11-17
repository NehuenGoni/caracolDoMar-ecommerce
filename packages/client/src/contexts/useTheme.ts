import { createContext, useContext } from "react";
import type { ThemePreference } from "@/lib/themeStorage";

// El contexto y el hook viven aparte del provider (ThemeContext.tsx) para que el
// fast refresh funcione: un archivo de componentes solo exporta componentes.

export type ResolvedTheme = "light" | "dark";

export interface ThemeContextValue {
  /** La preferencia elegida por el usuario. */
  theme: ThemePreference;
  /** El tema que efectivamente se está mostrando (resuelve "system"). */
  resolvedTheme: ResolvedTheme;
  setTheme: (preference: ThemePreference) => void;
  /** Recorre claro → oscuro → sistema → claro. */
  cycleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de ThemeProvider");
  return ctx;
}
