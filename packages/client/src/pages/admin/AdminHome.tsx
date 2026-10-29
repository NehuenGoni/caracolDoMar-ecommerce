import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AdminDashboard from "./AdminDashboard";

/**
 * Lo primero que ve cada integrante del equipo: el admin, el tablero; el vendedor, el punto de
 * venta (el tablero muestra los totales de venta, que son de reportes).
 */
export default function AdminHome() {
  const { can } = useAuth();
  return can("reports:read") ? <AdminDashboard /> : <Navigate to="/admin/ventas" replace />;
}
