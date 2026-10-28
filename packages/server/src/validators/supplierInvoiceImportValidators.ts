import { z } from "zod";
import { objectIdSchema } from "./commonValidators.js";

export const IMPORT_STATUSES = [
  "uploaded",
  "extracting",
  "review",
  "applying",
  "applied",
  "failed",
  "discarded",
] as const;

export const importQuerySchema = z.object({
  status: z.enum(IMPORT_STATUSES).optional(),
  supplier: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ImportQuery = z.infer<typeof importQuerySchema>;

/** Campo opcional de la carga inicial (multipart): el resto lo completa la lectura de la factura. */
export const uploadInvoiceBodySchema = z.object({
  supplierId: objectIdSchema.optional(),
});
export type UploadInvoiceBody = z.infer<typeof uploadInvoiceBodySchema>;

export const importLineParamsSchema = z.object({
  id: objectIdSchema,
  lineNumber: z.coerce.number().int().min(1),
});
export type ImportLineParams = z.infer<typeof importLineParamsSchema>;

export const updateImportHeaderSchema = z.object({
  supplier: z.string().trim().min(1).optional(),
  /** `null` quita el proveedor registrado (queda solo el nombre). */
  supplierId: objectIdSchema.nullable().optional(),
  documentNumber: z.string().trim().optional(),
  documentDate: z.coerce.date().optional(),
  notes: z.string().trim().optional(),
});
export type UpdateImportHeaderInput = z.infer<typeof updateImportHeaderSchema>;

const linkedLineFields = {
  quantity: z.number().int().min(1),
  unitCost: z.number().int().min(0),
  updateCostPrice: z.boolean().default(true),
  updateSalePrice: z.boolean().default(true),
  marginPercent: z.number().min(0).max(1000).nullable().default(null),
  salePrice: z.number().int().min(0).nullable().default(null),
};

/**
 * Por ahora una línea solo se puede "vincular" a un producto/variante existente o "omitir".
 * Crear un producto nuevo desde una línea sin match queda para más adelante.
 */
export const updateLineSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("skip") }),
  z.object({
    action: z.literal("link"),
    product: objectIdSchema,
    variantSku: z.string().trim().min(1),
    ...linkedLineFields,
  }),
]);
export type UpdateLineInput = z.infer<typeof updateLineSchema>;

export const applyImportSchema = z.object({
  purchaseDate: z.coerce.date().optional(),
  notes: z.string().trim().default(""),
});
export type ApplyImportBody = z.infer<typeof applyImportSchema>;
