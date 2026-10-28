import { netFromGross, parseArsAmount, suggestedPrice, type PricingSettings } from "@caracol/shared";
import {
  SupplierInvoiceImport,
  type ISupplierInvoiceImportLine,
  type SupplierInvoiceImportDocument,
} from "../models/SupplierInvoiceImport.js";
import {
  extractInvoice,
  isRetryableExtractionError,
  type ExtractInvoiceInput,
  type ExtractInvoiceResult,
} from "./anthropicService.js";
import { matchLines, matchSupplier, type LineMatchResult } from "./invoiceMatchingService.js";
import type { ExtractedInvoice, ExtractedInvoiceLine } from "./prompts/invoiceExtraction.prompt.js";
import { getPricingSettings } from "./settingsService.js";

/** Cuántas veces se puede intentar extraer una misma importación. Agotado esto, solo queda descartarla. */
export const MAX_EXTRACTION_ATTEMPTS = 3;
/** Espera antes del único reintento automático ante un error transitorio (rate limit, red). */
export const EXTRACTION_RETRY_BACKOFF_MS = 5000;
/** Desde cuándo "extracting" se considera un lock huérfano (el server se reinició a mitad de camino). */
export const STALE_EXTRACTION_LOCK_MS = 5 * 60 * 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Dispara la extracción sin bloquear a quien llama. El estado queda en el propio documento: un
 * fallo controlado ya lo deja en "failed", así que este catch es solo para lo inesperado.
 */
export function scheduleExtraction(importId: string, file: ExtractInvoiceInput): void {
  void runExtraction(importId, file).catch((err) => {
    console.error(`[invoiceExtraction] fallo no controlado para ${importId}:`, err);
  });
}

export interface RunExtractionOptions {
  /** Solo para tests, para que el reintento no espere 5 segundos de verdad. */
  retryBackoffMs?: number;
}

/**
 * Corre la extracción de punta a punta para una importación ya creada. Idempotente: si el
 * documento no está en un estado bloqueable (ya está corriendo, ya se aplicó, o agotó los
 * intentos) no hace nada. Se exporta (además de `scheduleExtraction`) para que los tests la
 * esperen directamente en vez de correr una carrera contra el "dispará y olvidá".
 */
export async function runExtraction(
  importId: string,
  file: ExtractInvoiceInput,
  options: RunExtractionOptions = {},
): Promise<void> {
  const locked = await lockForExtraction(importId);
  if (!locked) return;

  try {
    const result = await extractWithRetry(file, options.retryBackoffMs ?? EXTRACTION_RETRY_BACKOFF_MS);
    const lines = await buildLines(result.data);
    await applyExtractionSuccess(locked, result, lines);
  } catch (err) {
    await applyExtractionFailure(importId, err);
  }
}

/**
 * Recupera un lock huérfano: si el server se reinició a mitad de una extracción, el documento
 * queda en "extracting" para siempre. Se llama al pedir una importación, así el próximo
 * refresco del cliente lo descubre solo, sin necesitar un cron.
 */
export async function recoverStaleExtractionLock(importId: string): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_EXTRACTION_LOCK_MS);
  await SupplierInvoiceImport.updateOne(
    { _id: importId, status: "extracting", "extraction.startedAt": { $lt: staleBefore } },
    { $set: { status: "failed", "extraction.lastError": "La lectura se interrumpió" } },
  );
}

/**
 * Lock optimista: solo pasa a "extracting" un documento en "uploaded" o "failed" que no haya
 * agotado los intentos. Si no matchea (ya está corriendo, ya se aplicó o descartó, o llegó al
 * máximo) devuelve null y nadie hace nada: eso lo hace idempotente ante llamadas duplicadas.
 */
async function lockForExtraction(importId: string): Promise<SupplierInvoiceImportDocument | null> {
  return SupplierInvoiceImport.findOneAndUpdate(
    {
      _id: importId,
      status: { $in: ["uploaded", "failed"] },
      "extraction.attempts": { $lt: MAX_EXTRACTION_ATTEMPTS },
    },
    {
      $set: { status: "extracting", "extraction.startedAt": new Date(), "extraction.lastError": "" },
      $inc: { "extraction.attempts": 1 },
    },
    { new: true },
  );
}

/**
 * Un solo reintento automático, y solo ante un error transitorio (red o rate limit). Cualquier
 * otro error (archivo corrupto, sin configurar) sube tal cual: reintentar no lo arregla.
 */
async function extractWithRetry(file: ExtractInvoiceInput, retryBackoffMs: number): Promise<ExtractInvoiceResult> {
  try {
    return await extractInvoice(file);
  } catch (err) {
    if (!isRetryableExtractionError(err)) throw err;
    await delay(retryBackoffMs);
    return await extractInvoice(file);
  }
}

async function buildLines(data: ExtractedInvoice): Promise<ISupplierInvoiceImportLine[]> {
  const matches = await matchLines(
    data.lines.map((line) => ({ supplierSku: line.supplierSku ?? "", barcode: line.barcode ?? "" })),
  );
  const pricing = await getPricingSettings();
  return data.lines.map((line, index) => buildLine(line, index + 1, matches[index]!, pricing));
}

function buildLine(
  line: ExtractedInvoiceLine,
  lineNumber: number,
  match: LineMatchResult,
  pricing: PricingSettings,
): ISupplierInvoiceImportLine {
  const unitCost = resolveNetUnitCost(line);
  const hasCost = unitCost !== null;
  // Remito sin precio: se prellena con el costo actual de la variante (si matcheó) para que la
  // revisión no arranque en $0, pero NO se marca para actualizar el costo.
  const decisionUnitCost = hasCost ? unitCost : (match.currentCostPrice ?? 0);
  const salePrice = hasCost ? suggestedPrice(unitCost, pricing) : null;

  return {
    lineNumber,
    raw: {
      description: line.description,
      supplierSku: line.supplierSku ?? "",
      barcode: line.barcode ?? "",
      quantity: line.quantity,
      unit: line.unit,
      unitCost,
      taxPercent: line.taxPercent,
      unitCostIncludesTax: line.unitPriceIncludesTax,
      discountPercent: line.discountPercent,
      modelConfidence: line.confidence,
      modelNotes: line.notes,
    },
    match,
    decision: {
      action: match.status === "matched" ? "link" : "skip",
      product: match.product,
      variantSku: match.variantSku,
      quantity: line.quantity,
      unitCost: decisionUnitCost,
      updateCostPrice: hasCost,
      updateSalePrice: hasCost,
      marginPercent: null,
      salePrice,
    },
    result: { ok: false, error: "" },
  };
}

/** Costo unitario NETO (sin IVA) en centavos a partir del texto del documento. Null si no informa precio (remito). */
function resolveNetUnitCost(line: ExtractedInvoiceLine): number | null {
  const parsed = parseArsAmount(line.unitPriceRaw ?? "");
  if (parsed === null) return null;
  return line.unitPriceIncludesTax ? netFromGross(parsed, line.taxPercent) : parsed;
}

async function applyExtractionSuccess(
  doc: SupplierInvoiceImportDocument,
  result: ExtractInvoiceResult,
  lines: ISupplierInvoiceImportLine[],
): Promise<void> {
  // Si el admin ya eligió proveedor al subir el archivo, no se lo pisa; si no, se sugiere el
  // registrado que coincida por CUIT o nombre.
  const suggested = doc.supplierId ? null : await matchSupplier(result.data.supplierName, result.data.supplierTaxId ?? "");

  // Guardia de estado: si mientras Claude respondía el admin descartó la importación (se puede
  // descartar desde "extracting"), este resultado tardío no debe resucitarla.
  await SupplierInvoiceImport.updateOne(
    { _id: doc._id, status: "extracting" },
    {
      $set: {
        status: "review",
        supplier: doc.supplier || suggested?.name || result.data.supplierName,
        supplierId: doc.supplierId ?? suggested?.id ?? null,
        supplierTaxId: result.data.supplierTaxId ?? "",
        documentType: result.data.documentType,
        documentNumber: result.data.documentNumber ?? "",
        documentDate: result.data.documentDate ? new Date(result.data.documentDate) : null,
        currency: result.data.currency,
        totals: {
          subtotal: parseArsAmount(result.data.subtotalRaw ?? ""),
          tax: parseArsAmount(result.data.taxRaw ?? ""),
          total: parseArsAmount(result.data.totalRaw ?? ""),
        },
        lines,
        "extraction.model": result.model,
        "extraction.promptVersion": result.promptVersion,
        "extraction.completedAt": new Date(),
        "extraction.inputTokens": result.usage.inputTokens,
        "extraction.outputTokens": result.usage.outputTokens,
        "extraction.cacheReadTokens": result.usage.cacheReadTokens,
        "extraction.lastError": "",
      },
    },
  );
}

async function applyExtractionFailure(importId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  // Misma guardia: no pisar un estado al que se pasó por otro lado (por ejemplo "discarded").
  await SupplierInvoiceImport.updateOne(
    { _id: importId, status: "extracting" },
    { $set: { status: "failed", "extraction.completedAt": new Date(), "extraction.lastError": message } },
  );
}
