import type { Permission } from "@caracol/shared";
import type { ReactNode } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import { AccountLayout } from "@/components/layout/AccountLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { PublicLayout } from "@/components/layout/PublicLayout";
import AcceptInvite from "@/pages/AcceptInvite";
import AccountAddresses from "@/pages/account/AccountAddresses";
import AccountOrderDetail from "@/pages/account/AccountOrderDetail";
import AccountOrders from "@/pages/account/AccountOrders";
import AccountProfile from "@/pages/account/AccountProfile";
import AdminHome from "@/pages/admin/AdminHome";
import AdminTeam from "@/pages/admin/AdminTeam";
import AdminCashRegister from "@/pages/admin/AdminCashRegister";
import AdminCategories from "@/pages/admin/AdminCategories";
import AdminInventory from "@/pages/admin/AdminInventory";
import AdminInvoiceImportReview from "@/pages/admin/AdminInvoiceImportReview";
import AdminInvoiceImports from "@/pages/admin/AdminInvoiceImports";
import AdminOrderDetail from "@/pages/admin/AdminOrderDetail";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminPos from "@/pages/admin/AdminPos";
import AdminProductForm from "@/pages/admin/AdminProductForm";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminShipping from "@/pages/admin/AdminShipping";
import AdminStoreSaleDetail from "@/pages/admin/AdminStoreSaleDetail";
import AdminStoreSales from "@/pages/admin/AdminStoreSales";
import AdminSupplierPurchases from "@/pages/admin/AdminSupplierPurchases";
import AdminSuppliers from "@/pages/admin/AdminSuppliers";
import StoreSaleTicket from "@/pages/admin/StoreSaleTicket";
import Cart from "@/pages/Cart";
import Catalog from "@/pages/Catalog";
import Checkout from "@/pages/Checkout";
import Arrepentimiento from "@/pages/Arrepentimiento";
import CambiosYDevoluciones from "@/pages/CambiosYDevoluciones";
import Contacto from "@/pages/Contacto";
import ForgotPassword from "@/pages/ForgotPassword";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import OrderConfirmation from "@/pages/OrderConfirmation";
import Privacidad from "@/pages/Privacidad";
import ProductDetail from "@/pages/ProductDetail";
import Register from "@/pages/Register";
import ResetPassword from "@/pages/ResetPassword";
import Terminos from "@/pages/Terminos";

/** Dentro del panel: quien no tiene el permiso vuelve al inicio del panel (que lo lleva a lo suyo). */
function guard(permission: Permission, element: ReactNode) {
  return (
    <ProtectedRoute permission={permission} redirectTo="/admin">
      {element}
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<AdminHome />} />
        <Route path="productos" element={guard("products:read", <AdminProducts />)} />
        <Route path="productos/nuevo" element={guard("products:write", <AdminProductForm />)} />
        <Route path="productos/:id" element={guard("products:write", <AdminProductForm />)} />
        <Route path="categorias" element={guard("catalog:manage", <AdminCategories />)} />
        <Route path="pedidos" element={guard("orders:read", <AdminOrders />)} />
        <Route path="pedidos/:id" element={guard("orders:read", <AdminOrderDetail />)} />
        <Route path="inventario" element={guard("inventory:read", <AdminInventory />)} />
        <Route path="envios" element={guard("settings:manage", <AdminShipping />)} />
        <Route path="compras" element={guard("purchases:manage", <AdminSupplierPurchases />)} />
        <Route path="compras/importaciones" element={guard("purchases:manage", <AdminInvoiceImports />)} />
        <Route path="compras/importaciones/:id" element={guard("purchases:manage", <AdminInvoiceImportReview />)} />
        <Route path="proveedores" element={guard("purchases:manage", <AdminSuppliers />)} />
        <Route path="ajustes" element={guard("settings:manage", <AdminSettings />)} />
        <Route path="caja" element={guard("cash:operate", <AdminCashRegister />)} />
        <Route path="ventas" element={guard("pos:sell", <AdminPos />)} />
        <Route path="ventas/historial" element={guard("pos:sell", <AdminStoreSales />)} />
        <Route path="ventas/:id" element={guard("pos:sell", <AdminStoreSaleDetail />)} />
        <Route path="equipo" element={guard("users:manage", <AdminTeam />)} />
        <Route path="administradores" element={<Navigate to="/admin/equipo" replace />} />
      </Route>

      {/* Fuera del AdminLayout a propósito: al imprimir debe salir solo el ticket. */}
      <Route
        path="admin/ventas/:id/ticket"
        element={
          <ProtectedRoute permission="pos:sell">
            <StoreSaleTicket />
          </ProtectedRoute>
        }
      />

      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="catalogo" element={<Catalog />} />
        <Route path="productos/:slug" element={<ProductDetail />} />
        <Route path="carrito" element={<Cart />} />
        <Route
          path="checkout"
          element={
            <ProtectedRoute>
              <Checkout />
            </ProtectedRoute>
          }
        />
        <Route
          path="order-confirmation/:id"
          element={
            <ProtectedRoute>
              <OrderConfirmation />
            </ProtectedRoute>
          }
        />

        <Route path="login" element={<Login />} />
        <Route path="registro" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="accept-invite" element={<AcceptInvite />} />

        <Route path="cuenta" element={<AccountLayout />}>
          <Route index element={<AccountProfile />} />
          <Route path="pedidos" element={<AccountOrders />} />
          <Route path="pedidos/:id" element={<AccountOrderDetail />} />
          <Route path="direcciones" element={<AccountAddresses />} />
        </Route>

        <Route path="terminos-y-condiciones" element={<Terminos />} />

        <Route path="cambios-y-devoluciones" element={<CambiosYDevoluciones />} />

        <Route path="politica-de-privacidad" element={<Privacidad />} />

        <Route path="contacto" element={<Contacto />} />

        <Route path="arrepentimiento" element={<Arrepentimiento />} />


        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
