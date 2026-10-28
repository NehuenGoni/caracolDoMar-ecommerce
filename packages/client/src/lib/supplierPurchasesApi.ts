import type { PaginatedResult, SupplierPurchase } from "@caracol/shared";
import { apiGet, apiPost } from "./apiClient.js";

export interface SupplierPurchaseItemInput {
  productId: string;
  variantSku: string;
  quantity: number;
  unitCost: number;
}

export interface CreateSupplierPurchaseInput {
  /** Proveedor registrado. Si no hay, va `supplierName`. */
  supplierId?: string;
  supplierName?: string;
  /** Una clave por envío del formulario: reintentar (o el doble click) no duplica la compra. */
  idempotencyKey?: string;
  items: SupplierPurchaseItemInput[];
  purchaseDate?: string;
  notes?: string;
}

export const listSupplierPurchases = (page = 1, limit = 20) =>
  apiGet<PaginatedResult<SupplierPurchase>>(`/supplier-purchases?page=${page}&limit=${limit}`);

export const getSupplierPurchase = (id: string) =>
  apiGet<{ purchase: SupplierPurchase }>(`/supplier-purchases/${id}`);

export const createSupplierPurchase = (input: CreateSupplierPurchaseInput) =>
  apiPost<{ purchase: SupplierPurchase }>("/supplier-purchases", input);
