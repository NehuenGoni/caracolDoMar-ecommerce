import type { Supplier } from "@caracol/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "./apiClient.js";

export interface SupplierInput {
  name: string;
  taxId: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  isActive: boolean;
}

export const listSuppliers = (includeInactive = false) =>
  apiGet<{ suppliers: Supplier[] }>(`/admin/suppliers?includeInactive=${includeInactive}`);

export const createSupplier = (input: SupplierInput) =>
  apiPost<{ supplier: Supplier }>("/admin/suppliers", input);

export const updateSupplier = (id: string, input: Partial<SupplierInput>) =>
  apiPatch<{ supplier: Supplier }>(`/admin/suppliers/${id}`, input);

export const deleteSupplier = (id: string) => apiDelete<void>(`/admin/suppliers/${id}`);
