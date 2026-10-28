import { z } from "zod";
import { objectIdSchema } from "./commonValidators.js";

const imageSchema = z.object({
  url: z.string().url("La imagen debe ser una URL válida"),
  source: z.enum(["cloudinary", "external"]),
  alt: z.string().optional(),
  order: z.number().int().min(0).default(0),
});

const videoSchema = z.object({
  url: z.string().url("El video debe ser una URL válida"),
  source: z.enum(["cloudinary", "external"]),
  order: z.number().int().min(0).default(0),
});

const bundleItemSchema = z.object({
  product: objectIdSchema,
  variantSku: z.string().trim().min(1, "El SKU del componente es requerido"),
  quantity: z.number().int().min(1, "La cantidad mínima es 1").max(99),
});

const attributeSchema = z.object({
  name: z.string().trim().min(1, "El nombre del atributo es requerido"),
  value: z.string().trim().min(1, "El valor del atributo es requerido"),
});

const variantSchema = z
  .object({
  sku: z.string().min(1, "El SKU es requerido"),
  attributes: z
    .array(attributeSchema)
    .max(4, "Una variante admite hasta 4 atributos")
    .default([])
    .refine(
      (attrs) => new Set(attrs.map((a) => a.name.toLowerCase())).size === attrs.length,
      "Los atributos de una variante no pueden repetir el nombre",
    ),
  price: z.number().int("El precio debe estar en centavos").nonnegative(),
  costPrice: z.number().int("El costo debe estar en centavos").nonnegative(),
  stock: z.number().int().nonnegative().default(0),
  lowStockThreshold: z.number().int().nonnegative().default(0),
  weight: z.number().positive().max(25000, "El peso máximo aceptado por el correo es 25kg").optional(),
  height: z.number().positive().max(150, "La medida máxima aceptada por el correo es 150cm").optional(),
  width: z.number().positive().max(150, "La medida máxima aceptada por el correo es 150cm").optional(),
  length: z.number().positive().max(150, "La medida máxima aceptada por el correo es 150cm").optional(),
  barcode: z.string().optional(),
  isUniquePiece: z.boolean().default(false),
  })
  .refine((v) => !v.isUniquePiece || v.stock <= 1, {
    message: "Una pieza única tiene como máximo 1 unidad",
    path: ["stock"],
  });

export const createProductSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  slug: z.string().optional(),
  description: z.string().optional(),
  category: objectIdSchema,
  brand: z.string().optional(),
  tags: z.array(z.string()).default([]),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  images: z.array(imageSchema).default([]),
  videos: z.array(videoSchema).max(3, "Hasta 3 videos por producto").default([]),
  isBundle: z.boolean().default(false),
  bundleItems: z.array(bundleItemSchema).max(20, "Un kit admite hasta 20 componentes").default([]),
  variants: z.array(variantSchema).min(1, "El producto debe tener al menos una variante"),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: objectIdSchema.optional(),
  search: z.string().optional(),
  /** Centavos. */
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  brand: z.string().trim().min(1).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "name"]).optional(),
  isFeatured: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  tags: z
    .string()
    .optional()
    .transform((value) => value?.split(",").map((t) => t.trim()).filter(Boolean)),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const adminListProductsQuerySchema = listProductsQuerySchema.extend({
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});
export type AdminListProductsQuery = z.infer<typeof adminListProductsQuerySchema>;
