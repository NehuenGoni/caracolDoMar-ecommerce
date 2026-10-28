import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

/**
 * Importación de una factura/remito de proveedor leída por IA.
 *
 * Es un documento de staging: la IA nunca escribe en el catálogo, solo llena `lines` con un
 * borrador que un admin revisa y corrige en `decision` antes de confirmar. Al aplicar se crea una
 * `SupplierPurchase` real (que ya sabe mover stock y costos).
 *
 * Máquina de estados:
 *   uploaded → extracting → review → applying → applied
 *                  ↓            ↓         ↓
 *                failed      discarded  failed (vuelve a "review")
 *
 * v1 solo hace matching exacto (SKU/código de barras) y vinculación manual a un producto
 * existente; crear productos nuevos desde una línea sin match queda para más adelante.
 */
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

export interface ISupplierInvoiceImportFile {
  url: string;
  publicId: string;
  resourceType: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  /** Hash del contenido: sirve para detectar que la misma factura ya fue cargada. */
  sha256: string;
}

export interface ISupplierInvoiceImportTotals {
  /** Centavos, o null si el documento no los informa. */
  subtotal: number | null;
  tax: number | null;
  total: number | null;
}

export interface ISupplierInvoiceImportLineRaw {
  description: string;
  supplierSku: string;
  barcode: string;
  quantity: number;
  unit: string;
  /** Costo unitario NETO (sin IVA) en centavos, ya convertido por el server. Null en remitos sin precios. */
  unitCost: number | null;
  taxPercent: number;
  /** Si el precio del documento incluía IVA (antes de la conversión a neto). */
  unitCostIncludesTax: boolean;
  discountPercent: number;
  /** Confianza 0..1 que reportó el propio modelo para esta línea. */
  modelConfidence: number;
  modelNotes: string;
}

export interface ISupplierInvoiceImportLineMatch {
  status: LineMatchStatus;
  method: LineMatchMethod;
  product: Types.ObjectId | null;
  variantSku: string;
  /** Precios actuales de la variante, para mostrar la diferencia sin consultas extra. */
  currentCostPrice: number | null;
  currentPrice: number | null;
}

export interface ISupplierInvoiceImportLineDecision {
  action: LineAction;
  product: Types.ObjectId | null;
  variantSku: string;
  quantity: number;
  /** Centavos, neto. Editable por el admin (prellenado desde `raw.unitCost`). */
  unitCost: number;
  updateCostPrice: boolean;
  updateSalePrice: boolean;
  /** Margen propio de la línea; null = el de la configuración de precios. */
  marginPercent: number | null;
  salePrice: number | null;
}

export interface ISupplierInvoiceImportLineResult {
  ok: boolean;
  error: string;
}

export interface ISupplierInvoiceImportLine {
  /** 1..n: clave estable para editar una línea desde el cliente (no usar el índice del array). */
  lineNumber: number;
  raw: ISupplierInvoiceImportLineRaw;
  match: ISupplierInvoiceImportLineMatch;
  decision: ISupplierInvoiceImportLineDecision;
  result: ISupplierInvoiceImportLineResult;
}

export interface ISupplierInvoiceImportExtraction {
  model: string;
  promptVersion: string;
  attempts: number;
  startedAt: Date | null;
  completedAt: Date | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  lastError: string;
}

export interface ISupplierInvoiceImport {
  status: SupplierInvoiceImportStatus;
  file: ISupplierInvoiceImportFile;
  supplier: string;
  /** Proveedor registrado: la extracción lo sugiere por CUIT y el admin lo puede cambiar. */
  supplierId: Types.ObjectId | null;
  supplierTaxId: string;
  documentType: SupplierInvoiceDocumentType;
  documentNumber: string;
  documentDate: Date | null;
  currency: SupplierInvoiceCurrency;
  totals: ISupplierInvoiceImportTotals;
  lines: ISupplierInvoiceImportLine[];
  extraction: ISupplierInvoiceImportExtraction;
  notes: string;
  purchase: Types.ObjectId | null;
  appliedAt: Date | null;
  createdBy: Types.ObjectId;
}

export type SupplierInvoiceImportDocument = HydratedDocument<ISupplierInvoiceImport>;

const fileSchema = new Schema<ISupplierInvoiceImportFile>(
  {
    url: { type: String, default: "" },
    publicId: { type: String, default: "" },
    resourceType: { type: String, default: "" },
    mimeType: { type: String, required: true },
    originalName: { type: String, default: "" },
    sizeBytes: { type: Number, required: true, min: 0 },
    sha256: { type: String, required: true },
  },
  { _id: false },
);

const totalsSchema = new Schema<ISupplierInvoiceImportTotals>(
  {
    subtotal: { type: Number, default: null },
    tax: { type: Number, default: null },
    total: { type: Number, default: null },
  },
  { _id: false },
);

const lineRawSchema = new Schema<ISupplierInvoiceImportLineRaw>(
  {
    description: { type: String, required: true, trim: true },
    supplierSku: { type: String, default: "" },
    barcode: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, default: "" },
    unitCost: { type: Number, default: null },
    taxPercent: { type: Number, default: 0 },
    unitCostIncludesTax: { type: Boolean, default: false },
    discountPercent: { type: Number, default: 0 },
    modelConfidence: { type: Number, default: 0, min: 0, max: 1 },
    modelNotes: { type: String, default: "" },
  },
  { _id: false },
);

const lineMatchSchema = new Schema<ISupplierInvoiceImportLineMatch>(
  {
    status: { type: String, enum: ["matched", "unmatched"], required: true },
    method: { type: String, enum: ["sku", "barcode", "manual", "none"], required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    variantSku: { type: String, default: "" },
    currentCostPrice: { type: Number, default: null },
    currentPrice: { type: Number, default: null },
  },
  { _id: false },
);

const lineDecisionSchema = new Schema<ISupplierInvoiceImportLineDecision>(
  {
    action: { type: String, enum: ["link", "skip"], required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    variantSku: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0, default: 0 },
    updateCostPrice: { type: Boolean, default: true },
    updateSalePrice: { type: Boolean, default: true },
    marginPercent: { type: Number, default: null },
    salePrice: { type: Number, default: null },
  },
  { _id: false },
);

const lineResultSchema = new Schema<ISupplierInvoiceImportLineResult>(
  {
    ok: { type: Boolean, default: false },
    error: { type: String, default: "" },
  },
  { _id: false },
);

const lineSchema = new Schema<ISupplierInvoiceImportLine>(
  {
    lineNumber: { type: Number, required: true, min: 1 },
    raw: { type: lineRawSchema, required: true },
    match: { type: lineMatchSchema, required: true },
    decision: { type: lineDecisionSchema, required: true },
    result: { type: lineResultSchema, default: () => ({}) },
  },
  { _id: false },
);

const extractionSchema = new Schema<ISupplierInvoiceImportExtraction>(
  {
    model: { type: String, default: "" },
    promptVersion: { type: String, default: "" },
    attempts: { type: Number, default: 0, min: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    inputTokens: { type: Number, default: 0, min: 0 },
    outputTokens: { type: Number, default: 0, min: 0 },
    cacheReadTokens: { type: Number, default: 0, min: 0 },
    lastError: { type: String, default: "" },
  },
  { _id: false },
);

const supplierInvoiceImportSchema = new Schema<ISupplierInvoiceImport>(
  {
    status: {
      type: String,
      enum: ["uploaded", "extracting", "review", "applying", "applied", "failed", "discarded"],
      default: "uploaded",
    },
    file: { type: fileSchema, required: true },
    supplier: { type: String, default: "", trim: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", default: null },
    supplierTaxId: { type: String, default: "" },
    documentType: {
      type: String,
      enum: ["factura", "remito", "presupuesto", "desconocido"],
      default: "desconocido",
    },
    documentNumber: { type: String, default: "" },
    documentDate: { type: Date, default: null },
    currency: { type: String, enum: ["ARS", "USD"], default: "ARS" },
    totals: { type: totalsSchema, default: () => ({}) },
    lines: { type: [lineSchema], default: [] },
    extraction: { type: extractionSchema, default: () => ({}) },
    notes: { type: String, default: "" },
    purchase: { type: Schema.Types.ObjectId, ref: "SupplierPurchase", default: null },
    appliedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

supplierInvoiceImportSchema.index({ status: 1, createdAt: -1 });
// No es unique: una importación descartada tiene que poder volver a subirse con el mismo archivo.
supplierInvoiceImportSchema.index({ "file.sha256": 1 });
supplierInvoiceImportSchema.index({ purchase: 1 }, { sparse: true });

export const SupplierInvoiceImport =
  (mongoose.models.SupplierInvoiceImport as Model<ISupplierInvoiceImport>) ??
  model<ISupplierInvoiceImport>("SupplierInvoiceImport", supplierInvoiceImportSchema);
