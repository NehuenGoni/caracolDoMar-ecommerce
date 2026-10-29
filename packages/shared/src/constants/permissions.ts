import type { Role } from "../types/common.js";

/**
 * Qué puede hacer cada rol. Es la única fuente de verdad: el server la usa para proteger las
 * rutas (`requirePermission`) y el panel la usa para mostrar solo lo que corresponde.
 *
 * - `admin`: todo.
 * - `seller` (vendedor/a del local): vende en el punto de venta, maneja la caja, consulta stock y
 *   pedidos y los prepara. No ve costos ni proveedores, no toca la configuración ni las compras, y
 *   no anula ventas ni cancela pedidos (todo lo que revierte plata o stock queda para un admin).
 */
export const PERMISSIONS = [
  /** Cobrar en el punto de venta, ver el historial de ventas y hacer devoluciones. */
  "pos:sell",
  /** Anular una venta del local. */
  "pos:void",
  /** Abrir, mover y cerrar la caja. */
  "cash:operate",
  /** Ver el catálogo en el panel (sin costos ni proveedores, salvo `costs:read`). */
  "products:read",
  /** Crear, editar y archivar productos, y subir sus fotos y videos. */
  "products:write",
  /** Ver el costo de compra y el proveedor de los productos, y los márgenes. */
  "costs:read",
  "inventory:read",
  /** Ajustar el stock a mano. */
  "inventory:adjust",
  "orders:read",
  /** Pasar un pedido por preparación, envío y entrega, y cargar el envío en el correo. */
  "orders:prepare",
  /** Cancelar pedidos, confirmar o rechazar transferencias, reactivar y reembolsar. */
  "orders:manage",
  /** Proveedores, compras e importación de facturas. */
  "purchases:manage",
  /** Categorías. */
  "catalog:manage",
  /** Ajustes de precios y transferencia, y la configuración de envíos. */
  "settings:manage",
  "reports:read",
  /** Invitar al equipo, cambiar roles y revocar accesos. */
  "users:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  customer: [],
  seller: ["pos:sell", "cash:operate", "products:read", "inventory:read", "orders:read", "orders:prepare"],
  admin: PERMISSIONS,
};

/** Los roles que se pueden dar a alguien del equipo (el cliente no es del equipo). */
export const STAFF_ROLES = ["admin", "seller"] as const satisfies readonly Role[];
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  customer: "Cliente",
  seller: "Vendedor/a",
  admin: "Administrador/a",
};

export function hasPermission(role: Role | undefined | null, permission: Permission): boolean {
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
}

/** ¿Es del equipo (puede entrar al panel)? */
export function isStaff(role: Role | undefined | null): boolean {
  return role === "admin" || role === "seller";
}
