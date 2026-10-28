import { z } from "zod";

export const updatePricingSettingsSchema = z.object({
  marginPercent: z
    .number()
    .min(0, "El margen no puede ser negativo")
    .max(1000, "El margen máximo es 1000%"),
  roundingStep: z
    .number()
    .int("El redondeo debe ser un número entero de centavos")
    .min(1, "El redondeo debe ser al menos 1 centavo"),
  autoPriceOnPurchase: z.boolean(),
});
export const updateTransferSettingsSchema = z
  .object({
    enabled: z.boolean(),
    accountHolder: z.string().trim().max(120).default(""),
    bankName: z.string().trim().max(80).default(""),
    cbu: z.union([z.string().trim().regex(/^\d{22}$/, "El CBU/CVU tiene 22 dígitos"), z.literal("")]).default(""),
    alias: z.string().trim().max(40).default(""),
    taxId: z.string().trim().max(20).default(""),
    instructions: z.string().trim().max(500).default(""),
  })
  .superRefine((data, ctx) => {
    if (!data.enabled) return;
    if (!data.accountHolder) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accountHolder"], message: "Cargá el titular de la cuenta" });
    }
    if (!data.cbu && !data.alias) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cbu"], message: "Cargá el CBU/CVU o el alias" });
    }
  });
export type UpdateTransferSettingsInput = z.infer<typeof updateTransferSettingsSchema>;

export type UpdatePricingSettingsInput = z.infer<typeof updatePricingSettingsSchema>;
