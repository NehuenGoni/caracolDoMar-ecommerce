// OJO: este archivo importa "zod/v4" (el subpath de compatibilidad que expone zod 3.25+), NO el
// "zod" clásico que usa el resto del server. Es deliberado: `zodOutputFormat()` del SDK de
// Anthropic llama a `z.toJSONSchema()` de la API v4 y falla en tiempo de ejecución si se le pasa
// un schema armado con el zod v3 clásico ("Cannot read properties of undefined (reading 'def')").
// El tipo inferido (`ExtractedInvoice`) es un tipo TS común: se puede usar en el resto del server
// sin importar con qué build de zod se generó.
import { z } from "zod/v4";

/**
 * Se guarda en `extraction.promptVersion` de cada importación, para saber qué versión del prompt
 * produjo qué resultado cuando se lo vaya afinando.
 */
export const PROMPT_VERSION = "invoice-extraction-caracol-v1";

const extractedLineSchema = z.object({
  description: z.string(),
  supplierSku: z.string().nullable(),
  barcode: z.string().nullable(),
  quantity: z.number(),
  unit: z.string(),
  /** Tal como figura en el documento, sin convertir (ej. "1.234,56"). Null si no informa precio (remito). */
  unitPriceRaw: z.string().nullable(),
  unitPriceIncludesTax: z.boolean(),
  discountPercent: z.number(),
  taxPercent: z.number(),
  lineTotalRaw: z.string().nullable(),
  /** Confianza de esta línea puntual, 0 a 1. Bajar ante ambigüedad (unidades, cantidad vs. bulto, etc). */
  confidence: z.number(),
  /** Cualquier ambigüedad u observación relevante sobre esta línea. "" si no hay nada que anotar. */
  notes: z.string(),
});

export const extractedInvoiceSchema = z.object({
  documentType: z.enum(["factura", "remito", "presupuesto", "desconocido"]),
  supplierName: z.string(),
  supplierTaxId: z.string().nullable(),
  documentNumber: z.string().nullable(),
  /** Formato "YYYY-MM-DD", o null si no se puede determinar con certeza. */
  documentDate: z.string().nullable(),
  currency: z.enum(["ARS", "USD"]),
  lines: z.array(extractedLineSchema),
  subtotalRaw: z.string().nullable(),
  taxRaw: z.string().nullable(),
  totalRaw: z.string().nullable(),
});

export type ExtractedInvoiceLine = z.infer<typeof extractedLineSchema>;
export type ExtractedInvoice = z.infer<typeof extractedInvoiceSchema>;

export const EXTRACTION_SYSTEM_PROMPT = `Sos un asistente que lee facturas y remitos de proveedores de una
tienda holística y esotérica argentina (sahumerios, velas, cristales y minerales, estatuas, joyería,
ropa hindú, cartas de tarot, hierbas y artículos de decoración) y extrae sus datos en formato
estructurado. No tomás ninguna decisión de negocio: tu única tarea es transcribir fielmente lo que
dice el documento. Un humano revisa y corrige todo lo que devuelvas antes de que impacte en ningún
sistema.

Reglas:

1. NÚMEROS: el documento usa formato argentino, donde el punto separa miles
   y la coma separa decimales (ej. "1.234,56" es mil doscientos treinta y
   cuatro con 56). Nunca hagas la conversión ni la aritmética vos: devolvé
   el importe exactamente como aparece impreso, como string, en los campos
   que terminan en "Raw" (unitPriceRaw, lineTotalRaw, subtotalRaw, taxRaw,
   totalRaw). Si un importe no aparece, el campo es null, nunca "0" ni "".

2. FACTURA VS. REMITO: los remitos suelen no tener precios. Si una línea no
   tiene precio unitario, unitPriceRaw es null -- es un dato válido y
   esperado, no un error.

3. IVA: para cada línea, indicá taxPercent (la alícuota que corresponda, 0
   si no está discriminado) y unitPriceIncludesTax (true si el precio
   unitario de esa línea ya incluye el IVA, false si es neto). Fijate en el
   encabezado o el pie del documento si aclara el tratamiento del IVA para
   todas las líneas.

4. DESCUENTOS: discountPercent es el descuento o bonificación de esa línea
   puntual (0 si no hay). Si el documento tiene un descuento general sobre
   el total y no por línea, no lo repartas entre las líneas: dejalo en 0 y
   mencionalo en las notas de la primera línea afectada.

5. UNIDADES: unit es el texto tal cual figura ("u.", "bulto x12", "caja",
   "kg", "docena"). quantity es el número de unidades de venta que indica el
   documento, sin inferir conversiones (si dice "3 bultos x12", quantity es
   3 y notes debe aclarar "bulto de 12 unidades" si el documento lo dice
   explícitamente). Ante cualquier ambigüedad de unidades, bajá confidence
   y explicá la duda en notes -- no la resuelvas vos. Es muy común que los
   sahumerios y las velas vengan por caja o por docena.

6. NO INVENTES: un dato ausente es null (o "" para strings no numéricos,
   como supplierName si realmente no aparece). Nunca completes un SKU, un
   código de barras o un precio "razonable" que no esté impreso.

7. LÍNEAS A IGNORAR: no incluyas como línea de producto los renglones de
   percepciones (IIBB, ganancias), flete, gastos administrativos,
   subtotales, o cualquier renglón que no sea una mercadería concreta.

8. CONFIANZA: confidence (0 a 1) por línea, reflejando qué tan seguro
   estás de esa línea completa (descripción, cantidad y precio). Usá
   valores bajos (< 0.5) ante letra ilegible, ambigüedad de unidades, o
   cualquier duda real -- no autoevalúes con optimismo.

Completá todos los campos del schema para cada línea de producto real que
encuentres en el documento.`;

export const EXTRACTION_USER_INSTRUCTION =
  "Extraé todos los datos de esta factura o remito de proveedor siguiendo las reglas del system prompt.";
