import type { Role } from "@caracol/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth }));

import { ProtectedRoute } from "./ProtectedRoute";

function renderRoute(
  auth: { role?: Role; isLoading?: boolean },
  props: Partial<React.ComponentProps<typeof ProtectedRoute>>,
) {
  useAuth.mockReturnValue({
    isLoading: auth.isLoading ?? false,
    isAuthenticated: auth.role !== undefined,
    user: auth.role ? { role: auth.role } : null,
  });
  return render(
    <MemoryRouter initialEntries={["/secreto"]}>
      <Routes>
        <Route path="/" element={<p>inicio</p>} />
        <Route path="/panel" element={<p>panel</p>} />
        <Route path="/login" element={<p>login</p>} />
        <Route
          path="/secreto"
          element={
            <ProtectedRoute {...props}>
              <p>contenido secreto</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("sin sesión manda a iniciar sesión", () => {
    renderRoute({}, { staff: true });
    expect(screen.getByText("login")).toBeInTheDocument();
  });

  it("mientras verifica la sesión no decide nada", () => {
    renderRoute({ isLoading: true }, { staff: true });
    expect(screen.queryByText("login")).not.toBeInTheDocument();
    expect(screen.queryByText("contenido secreto")).not.toBeInTheDocument();
  });

  it("sin requisitos deja pasar a cualquiera con sesión", () => {
    renderRoute({ role: "customer" }, {});
    expect(screen.getByText("contenido secreto")).toBeInTheDocument();
  });

  it("'staff' deja pasar a admin y vendedor, no al cliente", () => {
    renderRoute({ role: "seller" }, { staff: true });
    expect(screen.getByText("contenido secreto")).toBeInTheDocument();
  });

  it("un cliente no entra al panel y vuelve al inicio", () => {
    renderRoute({ role: "customer" }, { staff: true });
    expect(screen.getByText("inicio")).toBeInTheDocument();
  });

  it("por permiso: el vendedor entra a lo suyo y no a lo del admin", () => {
    const { unmount } = renderRoute({ role: "seller" }, { permission: "pos:sell" });
    expect(screen.getByText("contenido secreto")).toBeInTheDocument();
    unmount();

    renderRoute({ role: "seller" }, { permission: "purchases:manage", redirectTo: "/panel" });
    expect(screen.getByText("panel")).toBeInTheDocument();
    expect(screen.queryByText("contenido secreto")).not.toBeInTheDocument();
  });

  it("el admin pasa cualquier permiso", () => {
    renderRoute({ role: "admin" }, { permission: "users:manage" });
    expect(screen.getByText("contenido secreto")).toBeInTheDocument();
  });

  it("por rol exacto sigue funcionando", () => {
    renderRoute({ role: "seller" }, { role: "admin" });
    expect(screen.getByText("inicio")).toBeInTheDocument();
  });
});
