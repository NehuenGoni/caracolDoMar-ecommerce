import type { PaginatedResult, SupplierInvoiceImport, SupplierInvoiceImportStatus, SupplierPurchase } from "@caracol/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "./apiClient.js";

export interface ImportDetail {
  import: SupplierInvoiceImport;
  /** URL firmada para ver el archivo original; vacía si no se pudo archivar. */
  fileUrl: string;
  pricingDefaults: { marginPercent: number; roundingStep: number };
}

/** Lo mismo que acepta `PATCH /admin/invoice-imports/:id/lines/:lineNumber`. */
export type LineDecisionInput =
  | { action: "skip" }
  | {
      action: "link";
      product: string;
      variantSku: string;
      quantity: number;
      unitCost: number;
      updateCostPrice: boolean;
      updateSalePrice: boolean;
      marginPercent: number | null;
      salePrice: number | null;
    };

export interface UpdateImportHeaderInput {
  supplier?: string;
  /** `null` quita el proveedor registrado y deja solo el nombre. */
  supplierId?: string | null;
  documentNumber?: string;
  notes?: string;
}

export interface ApplyImportInput {
  purchaseDate?: string;
  notes?: string;
}

const BASE = "/admin/invoice-imports";

export const getInvoiceImportStatus = () => apiGet<{ extractionConfigured: boolean }>(`${BASE}/status`);

export function listInvoiceImports(page: number, status?: SupplierInvoiceImportStatus) {
  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (status) params.set("status", status);
  return apiGet<PaginatedResult<SupplierInvoiceImport>>(`${BASE}?${params.toString()}`);
}

/** Sube el PDF o la foto de la factura. El resto de los datos los completa la lectura por IA. */
export async function uploadInvoice(file: File, supplierId?: string): Promise<SupplierInvoiceImport> {
  const formData = new FormData();
  formData.append("file", file);
  if (supplierId) formData.append("supplierId", supplierId);
  const { import: created } = await apiPost<{ import: SupplierInvoiceImport }>(BASE, formData);
  return created;
}

export const getInvoiceImport = (id: string) => apiGet<ImportDetail>(`${BASE}/${id}`);

export async function updateImportHeader(id: string, input: UpdateImportHeaderInput): Promise<SupplierInvoiceImport> {
  const { import: updated } = await apiPatch<{ import: SupplierInvoiceImport }>(`${BASE}/${id}`, input);
  return updated;
}

export async function patchImportLine(
  id: string,
  lineNumber: number,
  input: LineDecisionInput,
): Promise<SupplierInvoiceImport> {
  const { import: updated } = await apiPatch<{ import: SupplierInvoiceImport }>(
    `${BASE}/${id}/lines/${lineNumber}`,
    input,
  );
  return updated;
}

export const applyInvoiceImport = (id: string, input: ApplyImportInput) =>
  apiPost<{ import: SupplierInvoiceImport; purchase: SupplierPurchase }>(`${BASE}/${id}/apply`, input);

export const discardInvoiceImport = (id: string) => apiDelete<void>(`${BASE}/${id}`);
