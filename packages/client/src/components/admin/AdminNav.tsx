import type { Permission } from "@caracol/shared";
import {
  BarChart3,
  Landmark,
  LayoutDashboard,
  Package,
  PackageCheck,
  Receipt,
  ScanBarcode,
  Settings,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  UserCog,
  Warehouse,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

/** Cada integrante del equipo ve solo lo que su rol le permite usar. */
const LINKS: { to: string; label: string; icon: typeof Package; end: boolean; permission: Permission }[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true, permission: "reports:read" },
  { to: "/admin/reportes", label: "Reportes", icon: BarChart3, end: false, permission: "reports:read" },
  { to: "/admin/ventas", label: "Punto de venta", icon: ScanBarcode, end: true, permission: "pos:sell" },
  { to: "/admin/caja", label: "Caja", icon: Landmark, end: false, permission: "cash:operate" },
  { to: "/admin/ventas/historial", label: "Ventas del local", icon: Receipt, end: false, permission: "pos:sell" },
  { to: "/admin/productos", label: "Productos", icon: Package, end: false, permission: "products:read" },
  { to: "/admin/categorias", label: "Categorías", icon: Tags, end: false, permission: "catalog:manage" },
  { to: "/admin/pedidos", label: "Pedidos", icon: ShoppingCart, end: false, permission: "orders:read" },
  { to: "/admin/inventario", label: "Inventario", icon: Warehouse, end: false, permission: "inventory:read" },
  { to: "/admin/envios", label: "Envíos", icon: PackageCheck, end: false, permission: "settings:manage" },
  { to: "/admin/compras", label: "Compras", icon: Truck, end: false, permission: "purchases:manage" },
  { to: "/admin/proveedores", label: "Proveedores", icon: Store, end: false, permission: "purchases:manage" },
  { to: "/admin/ajustes", label: "Ajustes", icon: Settings, end: false, permission: "settings:manage" },
  { to: "/admin/equipo", label: "Equipo", icon: UserCog, end: false, permission: "users:manage" },
];

export function AdminNav() {
  const { can } = useAuth();

  return (
    <nav className="flex gap-1 overflow-x-auto sm:flex-col sm:gap-1 sm:overflow-visible">
      {LINKS.filter((link) => can(link.permission)).map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) =>
            cn(
              "flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
              isActive ? "bg-primary text-on-primary" : "text-text hover:bg-surface-alt",
            )
          }
        >
          <link.icon className="size-4" />
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
