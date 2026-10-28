import type { WithTimestamps } from "./common.js";

export type SupplierInvoiceImportStatus =
  | "uploaded"
  | "extracting"
  | "review"
  | "applying"
  | "applied"
  | "failed"
  | "discarded";

export type SupplierInvoiceDocumentType = "factura" | "remito" | "presupuesto" | "desconocido";
export type SupplierInvoiceCurrency = "ARS" | "USD";
export type LineMatchStatus = "matched" | "unmatched";
export type LineMatchMethod = "sku" | "barcode" | "manual" | "none";
export type LineAction = "link" | "skip";

export interface SupplierInvoiceImportFile {
  url: string;
  publicId: string;
  resourceType: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  sha256: string;
}

export interface SupplierInvoiceImportTotals {
  /** Centavos, o null si el documento no los informa. */
  subtotal: number | null;
  tax: number | null;
  total: number | null;
}

export interface SupplierInvoiceImportLineRaw {
  description: string;
  supplierSku: string;
  barcode: string;
  quantity: number;
  /** Unidad tal como figura en el documento ("u.", "bulto x12", "caja"). */
  unit: string;
  /** Costo unitario NETO (sin IVA) en centavos. Null en remitos sin precios. */
  unitCost: number | null;
  taxPercent: number;
  unitCostIncludesTax: boolean;
  discountPercent: number;
  /** Confianza 0..1 que reportó el propio modelo para esta línea. */
  modelConfidence: number;
  modelNotes: string;
}

export interface SupplierInvoiceImportLineMatch {
  status: LineMatchStatus;
  method: LineMatchMethod;
  product: string | null;
  variantSku: string;
  currentCostPrice: number | null;
  currentPrice: number | null;
}

export interface SupplierInvoiceImportLineDecision {
  action: LineAction;
  product: string | null;
  variantSku: string;
  quantity: number;
  /** Centavos, neto. Editable por el admin (prellenado desde `raw.unitCost`). */
  unitCost: number;
  updateCostPrice: boolean;
  updateSalePrice: boolean;
  /** Margen propio de esta línea; null = el de la configuración de precios. */
  marginPercent: number | null;
  /** Precio de venta calculado o editado, en centavos. */
  salePrice: number | null;
}

export interface SupplierInvoiceImportLineResult {
  ok: boolean;
  error: string;
}

export interface SupplierInvoiceImportLine {
  /** 1..n: clave estable para editar una línea (no usar el índice del array). */
  lineNumber: number;
  raw: SupplierInvoiceImportLineRaw;
  match: SupplierInvoiceImportLineMatch;
  decision: SupplierInvoiceImportLineDecision;
  result: SupplierInvoiceImportLineResult;
}

export interface SupplierInvoiceImportExtraction {
  model: string;
  promptVersion: string;
  attempts: number;
  startedAt: string | null;
  completedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  lastError: string;
}

export interface SupplierInvoiceImport extends WithTimestamps {
  _id: string;
  status: SupplierInvoiceImportStatus;
  file: SupplierInvoiceImportFile;
  /** Nombre del proveedor como lo leyó la IA (o como lo cargó el admin). */
  supplier: string;
  /** Proveedor registrado al que corresponde (la extracción lo sugiere por CUIT). */
  supplierId: string | null;
  supplierTaxId: string;
  documentType: SupplierInvoiceDocumentType;
  documentNumber: string;
  documentDate: string | null;
  currency: SupplierInvoiceCurrency;
  totals: SupplierInvoiceImportTotals;
  lines: SupplierInvoiceImportLine[];
  extraction: SupplierInvoiceImportExtraction;
  notes: string;
  /** Se llena recién al aplicar la importación. */
  purchase: string | null;
  appliedAt: string | null;
  createdBy: string;
}
