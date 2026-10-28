import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { env } from "../config/env.js";
import {
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_USER_INSTRUCTION,
  PROMPT_VERSION,
  extractedInvoiceSchema,
  type ExtractedInvoice,
} from "./prompts/invoiceExtraction.prompt.js";

/**
 * Único archivo del server que importa @anthropic-ai/sdk. Todo lo demás (invoiceExtractionService
 * y sus tests) usa esta función, y se mockea este módulo, nunca el SDK: es más estable y no
 * depende de la forma interna de `messages.parse`.
 */

export type SupportedMimeType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

export interface ExtractInvoiceInput {
  buffer: Buffer;
  mimeType: SupportedMimeType;
}

export interface ExtractInvoiceUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface ExtractInvoiceResult {
  data: ExtractedInvoice;
  usage: ExtractInvoiceUsage;
  model: string;
  promptVersion: string;
}

/** Sin ANTHROPIC_API_KEY la función queda deshabilitada, igual que Resend sin RESEND_API_KEY. */
export class InvoiceExtractionNotConfiguredError extends Error {
  constructor() {
    super("La lectura de facturas por IA no está configurada (falta ANTHROPIC_API_KEY)");
    this.name = "InvoiceExtractionNotConfiguredError";
  }
}

/** El modelo terminó sin devolver contenido interpretable (un rechazo, o una respuesta vacía). */
export class InvoiceExtractionEmptyResultError extends Error {
  constructor(reason: string) {
    super(`La lectura no devolvió resultado: ${reason}`);
    this.name = "InvoiceExtractionEmptyResultError";
  }
}

let client: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
  return client;
}

function toDocumentBlock(input: ExtractInvoiceInput): Anthropic.ContentBlockParam {
  const data = input.buffer.toString("base64");

  if (input.mimeType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  return { type: "image", source: { type: "base64", media_type: input.mimeType, data } };
}

/**
 * Le pasa el documento (PDF o foto) a Claude y devuelve los datos extraídos ya validados contra
 * `extractedInvoiceSchema`. No reintenta ni interpreta errores de red o de rate limit: eso lo
 * decide el orquestador (invoiceExtractionService) según el error que este archivo deja pasar.
 */
export async function extractInvoice(input: ExtractInvoiceInput): Promise<ExtractInvoiceResult> {
  const anthropic = getClient();
  if (!anthropic) throw new InvoiceExtractionNotConfiguredError();

  const response = await anthropic.messages.parse({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: env.ANTHROPIC_EFFORT,
      format: zodOutputFormat(extractedInvoiceSchema),
    },
    system: [{ type: "text", text: EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [toDocumentBlock(input), { type: "text", text: EXTRACTION_USER_INSTRUCTION }],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new InvoiceExtractionEmptyResultError(
      `el modelo rechazó la solicitud (${response.stop_details?.category ?? "sin categoría"})`,
    );
  }

  if (!response.parsed_output) {
    throw new InvoiceExtractionEmptyResultError(`stop_reason "${response.stop_reason}" sin contenido interpretable`);
  }

  return {
    data: response.parsed_output,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    },
    model: response.model,
    promptVersion: PROMPT_VERSION,
  };
}

/**
 * ¿Vale la pena reintentar este error? Vive acá para que el orquestador nunca tenga que importar
 * el SDK. Un error de red o de rate limit es transitorio; un archivo corrupto o con demasiadas
 * páginas no se arregla reintentando lo mismo.
 */
export function isRetryableExtractionError(err: unknown): boolean {
  return err instanceof Anthropic.RateLimitError || err instanceof Anthropic.APIConnectionError;
}
