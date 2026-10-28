import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import {
  EXTRACTION_SYSTEM_PROMPT,
  PROMPT_VERSION,
  extractedInvoiceSchema,
  type ExtractedInvoice,
} from "./invoiceExtraction.prompt.js";

/**
 * El resto de los tests mockean `anthropicService`, así que nada ejecuta la parte del SDK que
 * convierte el schema a JSON Schema. Esta es justamente la que falla en tiempo de ejecución si el
 * schema se arma con el zod v3 clásico en vez de `zod/v4` (ver la nota al principio del prompt).
 */
describe("schema de extracción de facturas", () => {
  it("se convierte al formato de salida estructurada del SDK sin errores", () => {
    const format = zodOutputFormat(extractedInvoiceSchema);

    expect(format.type).toBe("json_schema");
    const schema = format.schema as { type: string; properties: Record<string, unknown>; required?: string[] };
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(["documentType", "supplierName", "supplierTaxId", "lines", "totalRaw"]),
    );
  });

  it("valida una factura bien formada y un remito sin precios", () => {
    const invoice: ExtractedInvoice = {
      documentType: "remito",
      supplierName: "Distribuidora Om",
      supplierTaxId: null,
      documentNumber: null,
      documentDate: null,
      currency: "ARS",
      subtotalRaw: null,
      taxRaw: null,
      totalRaw: null,
      lines: [
        {
          description: "Sahumerio de sándalo",
          supplierSku: null,
          barcode: null,
          quantity: 3,
          unit: "caja",
          unitPriceRaw: null,
          unitPriceIncludesTax: false,
          discountPercent: 0,
          taxPercent: 0,
          lineTotalRaw: null,
          confidence: 0.8,
          notes: "",
        },
      ],
    };

    expect(extractedInvoiceSchema.safeParse(invoice).success).toBe(true);
  });

  it("rechaza un tipo de documento o una moneda desconocidos", () => {
    const base = { supplierName: "X", supplierTaxId: null, documentNumber: null, documentDate: null, lines: [], subtotalRaw: null, taxRaw: null, totalRaw: null };
    expect(extractedInvoiceSchema.safeParse({ ...base, documentType: "ticket", currency: "ARS" }).success).toBe(false);
    expect(extractedInvoiceSchema.safeParse({ ...base, documentType: "factura", currency: "EUR" }).success).toBe(false);
  });

  it("el prompt le pide devolver los importes como texto, sin convertirlos", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("unitPriceRaw");
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("Nunca hagas la conversión");
    expect(PROMPT_VERSION).toMatch(/^invoice-extraction-/);
  });
});
