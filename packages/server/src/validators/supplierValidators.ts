import { z } from "zod";

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido"),
  taxId: z.string().trim().default(""),
  contactName: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  email: z.union([z.string().trim().email("El email no es válido"), z.literal("")]).default(""),
  address: z.string().trim().default(""),
  notes: z.string().trim().default(""),
  isActive: z.boolean().default(true),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const listSuppliersQuerySchema = z.object({
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
