import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, STAFF_ROLES, hasPermission, isStaff } from "./permissions.js";

describe("permisos por rol", () => {
  it("el admin puede todo", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission("admin", permission)).toBe(true);
    }
  });

  it("el cliente no puede nada del panel", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission("customer", permission)).toBe(false);
    }
  });

  it("el vendedor vende, maneja la caja, consulta y prepara pedidos", () => {
    for (const permission of [
      "pos:sell",
      "cash:operate",
      "products:read",
      "inventory:read",
      "orders:read",
      "orders:prepare",
    ] as const) {
      expect(hasPermission("seller", permission)).toBe(true);
    }
  });

  it("el vendedor no ve costos, no anula, no cancela, no compra ni configura", () => {
    for (const permission of [
      "costs:read",
      "pos:void",
      "products:write",
      "inventory:adjust",
      "orders:manage",
      "purchases:manage",
      "catalog:manage",
      "settings:manage",
      "reports:read",
      "users:manage",
    ] as const) {
      expect(hasPermission("seller", permission)).toBe(false);
    }
  });

  it("sin rol no hay permisos", () => {
    expect(hasPermission(undefined, "pos:sell")).toBe(false);
    expect(hasPermission(null, "pos:sell")).toBe(false);
  });

  it("todo permiso del vendedor es un permiso que existe", () => {
    for (const permission of ROLE_PERMISSIONS.seller) {
      expect(PERMISSIONS).toContain(permission);
    }
  });

  it("solo admin y vendedor son del equipo", () => {
    expect(isStaff("admin")).toBe(true);
    expect(isStaff("seller")).toBe(true);
    expect(isStaff("customer")).toBe(false);
    expect(isStaff(undefined)).toBe(false);
    expect([...STAFF_ROLES]).toEqual(["admin", "seller"]);
  });
});
