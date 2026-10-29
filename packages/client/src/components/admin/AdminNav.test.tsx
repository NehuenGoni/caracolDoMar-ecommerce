import { hasPermission, type Role } from "@caracol/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth }));

import { AdminNav } from "./AdminNav";

function labelsFor(role: Role) {
  useAuth.mockReturnValue({ can: (permission: Parameters<typeof hasPermission>[1]) => hasPermission(role, permission) });
  const { unmount } = render(
    <MemoryRouter>
      <AdminNav />
    </MemoryRouter>,
  );
  const labels = screen.getAllByRole("link").map((link) => link.textContent);
  unmount();
  return labels;
}

describe("AdminNav", () => {
  it("el admin ve todo el panel", () => {
    expect(labelsFor("admin")).toEqual([
      "Dashboard",
      "Punto de venta",
      "Caja",
      "Ventas del local",
      "Productos",
      "Categorías",
      "Pedidos",
      "Inventario",
      "Envíos",
      "Compras",
      "Proveedores",
      "Ajustes",
      "Equipo",
    ]);
  });

  it("el vendedor ve lo del mostrador y nada de compras, ajustes ni equipo", () => {
    expect(labelsFor("seller")).toEqual([
      "Punto de venta",
      "Caja",
      "Ventas del local",
      "Productos",
      "Pedidos",
      "Inventario",
    ]);
  });

  it("un cliente no ve ningún link del panel", () => {
    useAuth.mockReturnValue({ can: () => false });
    render(
      <MemoryRouter>
        <AdminNav />
      </MemoryRouter>,
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
