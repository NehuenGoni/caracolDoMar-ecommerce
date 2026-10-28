import { z } from "zod";
import { objectIdSchema } from "./commonValidators.js";

const purchaseItemSchema = z.object({
  productId: objectIdSchema,
  variantSku: z.string().min(1, "El SKU es requerido"),
  quantity: z.number().int().positive("La cantidad debe ser mayor a 0"),
  unitCost: z.number().int("El costo debe estar en centavos").nonnegative(),
  /** `false` registra el ingreso sin cambiar el costo vigente de la variante. */
  updateCostPrice: z.boolean().optional(),
  /** Precio de venta nuevo para esta variante, en centavos. Sin esto, el precio no se toca. */
  salePrice: z.number().int("El precio debe estar en centavos").nonnegative().optional(),
});

export const createSupplierPurchaseSchema = z
  .object({
    /** Proveedor registrado. Si no se manda, `supplierName` es obligatorio. */
    supplierId: objectIdSchema.optional(),
    supplierName: z.string().trim().min(1, "El proveedor es requerido").optional(),
    items: z.array(purchaseItemSchema).min(1, "La compra debe tener al menos un ítem"),
    purchaseDate: z.coerce.date().optional(),
    notes: z.string().optional(),
    /** Clave única por envío del formulario: un reintento no duplica la compra. */
    idempotencyKey: z.string().trim().min(8).max(100).optional(),
  })
  .refine((data) => data.supplierId || data.supplierName, {
    message: "El proveedor es requerido",
    path: ["supplierId"],
  });
export type CreateSupplierPurchaseInput = z.infer<typeof createSupplierPurchaseSchema>;

export const listSupplierPurchasesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  supplier: objectIdSchema.optional(),
  product: objectIdSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
export type ListSupplierPurchasesQuery = z.infer<typeof listSupplierPurchasesQuerySchema>;
