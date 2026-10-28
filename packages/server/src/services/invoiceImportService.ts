import { createHash } from "node:crypto";
import type { PaginatedResult } from "@caracol/shared";
import { Types, type FilterQuery } from "mongoose";
import { Product } from "../models/Product.js";
import {
  SupplierInvoiceImport,
  type ISupplierInvoiceImport,
  type ISupplierInvoiceImportLine,
  type ISupplierInvoiceImportLineDecision,
  type SupplierInvoiceImportDocument,
} from "../models/SupplierInvoiceImport.js";
import { Supplier } from "../models/Supplier.js";
import type { SupplierPurchaseDocument } from "../models/SupplierPurchase.js";
import { isInvoiceExtractionConfigured } from "../config/env.js";
import { BadRequestError, ConflictError, NotFoundError, ServiceUnavailableError } from "../utils/AppError.js";
import { escapeRegex } from "../utils/regex.js";
import type {
  ImportQuery,
  UpdateImportHeaderInput,
  UpdateLineInput,
} from "../validators/supplierInvoiceImportValidators.js";
import type { SupportedMimeType } from "./anthropicService.js";
import { archiveInvoiceFile } from "./invoiceArchiveService.js";
import { recoverStaleExtractionLock, scheduleExtraction } from "./invoiceExtractionService.js";
import { createSupplierPurchase } from "./supplierPurchaseService.js";

export interface CreateImportInput {
  buffer: Buffer;
  mimeType: SupportedMimeType;
  originalName: string;
  sizeBytes: number;
  /** Si el admin ya sabe qué proveedor es al subir el archivo; si no, lo completa la lectura. */
  supplierId?: string;
}

/**
 * Estados que bloquean volver a subir la misma factura (mismo hash de contenido): todos salvo
 * "failed" y "discarded". Así un doble click mientras todavía se lee no crea dos importaciones, y
 * volver a subirla después de una falla (o de descartarla) funciona sin fricción: es la forma de
 * "reintentar", no hay un endpoint aparte.
 */
const DUPLICATE_BLOCKING_STATUSES = ["uploaded", "extracting", "review", "applying", "applied"] as const;

/**
 * Recibe el archivo ya en memoria (subido con multer), lo archiva en Cloudinary como comprobante,
 * crea el documento de staging y dispara la lectura en segundo plano. La IA todavía no tocó nada
 * del catálogo.
 */
export async function createImport(
  input: CreateImportInput,
  createdBy: string,
): Promise<SupplierInvoiceImportDocument> {
  if (!isInvoiceExtractionConfigured) {
    throw new ServiceUnavailableError("La lectura de facturas por IA no está configurada");
  }
  const sha256 = createHash("sha256").update(input.buffer).digest("hex");

  const duplicate = await SupplierInvoiceImport.findOne({
    "file.sha256": sha256,
    status: { $in: DUPLICATE_BLOCKING_STATUSES },
  });
  if (duplicate) {
    throw new ConflictError(`Esta factura ya fue cargada (importación ${duplicate._id.toString()})`);
  }

  let supplier: { id: Types.ObjectId; name: string } | undefined;
  if (input.supplierId) {
    const found = await Supplier.findById(input.supplierId);
    if (!found) throw new NotFoundError("Proveedor no encontrado");
    supplier = { id: found._id, name: found.name };
  }

  const archived = await archiveInvoiceFile(input.buffer, input.originalName);

  const doc = await SupplierInvoiceImport.create({
    file: {
      url: archived.url,
      publicId: archived.publicId,
      resourceType: archived.resourceType,
      mimeType: input.mimeType,
      originalName: input.originalName,
      sizeBytes: input.sizeBytes,
      sha256,
    },
    supplier: supplier?.name ?? "",
    supplierId: supplier?.id ?? null,
    createdBy,
  });

  scheduleExtraction(doc._id.toString(), { buffer: input.buffer, mimeType: input.mimeType });

  return doc;
}

export async function listImports(query: ImportQuery): Promise<PaginatedResult<SupplierInvoiceImportDocument>> {
  const filter: FilterQuery<ISupplierInvoiceImport> = {};
  if (query.status) filter.status = query.status;
  if (query.supplier) filter.supplier = { $regex: escapeRegex(query.supplier), $options: "i" };

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    SupplierInvoiceImport.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit),
    SupplierInvoiceImport.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

/** Antes de devolver el documento intenta recuperar un lock de extracción huérfano. */
export async function getImportById(id: string): Promise<SupplierInvoiceImportDocument> {
  await recoverStaleExtractionLock(id);
  const doc = await SupplierInvoiceImport.findById(id);
  if (!doc) throw new NotFoundError("Importación no encontrada");
  return doc;
}

export async function updateImportHeader(
  id: string,
  input: UpdateImportHeaderInput,
): Promise<SupplierInvoiceImportDocument> {
  const set: Record<string, unknown> = { ...input };
  delete set.supplierId;

  if (input.supplierId !== undefined) {
    if (input.supplierId === null) {
      set.supplierId = null;
    } else {
      const supplier = await Supplier.findById(input.supplierId);
      if (!supplier) throw new NotFoundError("Proveedor no encontrado");
      set.supplierId = supplier._id;
      // Elegir un proveedor registrado fija también el nombre, salvo que se esté cambiando a mano.
      if (input.supplier === undefined) set.supplier = supplier.name;
    }
  }

  const doc = await SupplierInvoiceImport.findOneAndUpdate(
    { _id: id, status: { $in: ["uploaded", "extracting", "review", "failed"] } },
    { $set: set },
    { new: true },
  );
  if (!doc) {
    const exists = await SupplierInvoiceImport.exists({ _id: id });
    if (!exists) throw new NotFoundError("Importación no encontrada");
    throw new ConflictError("La importación ya no se puede editar");
  }
  return doc;
}

/**
 * Solo se puede editar una línea mientras la importación está en "review": antes todavía no hay
 * líneas (o se están por reescribir) y después ya se aplicó, así que editarla no tendría efecto.
 * No se revalida contra el catálogo acá (eso lo hace `applyImport` al confirmar): hacerlo también
 * acá sería una consulta extra por cada cambio que guarde el admin.
 */
export async function updateLine(
  importId: string,
  lineNumber: number,
  input: UpdateLineInput,
): Promise<SupplierInvoiceImportDocument> {
  const doc = await SupplierInvoiceImport.findById(importId);
  if (!doc) throw new NotFoundError("Importación no encontrada");
  if (doc.status !== "review") {
    throw new ConflictError("Solo se pueden editar líneas mientras la importación está en revisión");
  }
  if (!doc.lines.some((line) => line.lineNumber === lineNumber)) {
    throw new NotFoundError(`Línea ${lineNumber} no encontrada`);
  }

  const updated = await SupplierInvoiceImport.findOneAndUpdate(
    { _id: importId, status: "review", "lines.lineNumber": lineNumber },
    { $set: { "lines.$.decision": toLineDecision(input) } },
    { new: true },
  );
  if (!updated) throw new ConflictError("La importación cambió mientras se editaba, volvé a cargarla");
  return updated;
}

function toLineDecision(input: UpdateLineInput): ISupplierInvoiceImportLineDecision {
  if (input.action === "skip") {
    return {
      action: "skip",
      product: null,
      variantSku: "",
      quantity: 0,
      unitCost: 0,
      updateCostPrice: false,
      updateSalePrice: false,
      marginPercent: null,
      salePrice: null,
    };
  }
  return {
    action: "link",
    product: new Types.ObjectId(input.product),
    variantSku: input.variantSku.toUpperCase(),
    quantity: input.quantity,
    unitCost: input.unitCost,
    updateCostPrice: input.updateCostPrice,
    updateSalePrice: input.updateSalePrice,
    marginPercent: input.marginPercent,
    salePrice: input.salePrice,
  };
}

/** Descarta una importación (no la borra). Una vez aplicada, o mientras se aplica, ya no se puede. */
export async function discardImport(id: string): Promise<void> {
  const updated = await SupplierInvoiceImport.findOneAndUpdate(
    { _id: id, status: { $nin: ["applying", "applied", "discarded"] } },
    { $set: { status: "discarded" } },
  );
  if (!updated) {
    throw new ConflictError("La importación no se puede descartar en su estado actual");
  }
}

export interface ApplyImportInput {
  purchaseDate?: Date;
  notes?: string;
}

export interface ApplyImportResult {
  import: SupplierInvoiceImportDocument;
  purchase: SupplierPurchaseDocument;
}

/**
 * Confirma una importación: crea la compra real (stock, costo y precio de cada línea vinculada, en
 * una sola transacción). La IA nunca tocó el catálogo: recién acá, con la revisión humana hecha,
 * se aplica algo.
 *
 * Lock optimista igual que la extracción: solo se aplica una importación en "review" y queda en
 * "applying" mientras dura, así un doble click no crea dos compras. Si algo falla vuelve a
 * "review" para que el admin corrija y reintente. Y como la compra usa una clave de idempotencia
 * propia de la importación, si se cayó DESPUÉS de crear la compra (pero antes de marcarla
 * aplicada), el reintento reutiliza esa compra en vez de duplicar stock.
 */
export async function applyImport(
  importId: string,
  input: ApplyImportInput,
  adminId: string,
): Promise<ApplyImportResult> {
  const locked = await SupplierInvoiceImport.findOneAndUpdate(
    { _id: importId, status: "review" },
    { $set: { status: "applying" } },
    { new: true },
  );
  if (!locked) {
    throw new ConflictError(
      "La importación no está lista para aplicarse (¿ya se aplicó, se está leyendo o fue descartada?)",
    );
  }

  try {
    return await doApply(locked, input, adminId);
  } catch (err) {
    await SupplierInvoiceImport.updateOne({ _id: importId, status: "applying" }, { $set: { status: "review" } });
    throw err;
  }
}

async function doApply(
  locked: SupplierInvoiceImportDocument,
  input: ApplyImportInput,
  adminId: string,
): Promise<ApplyImportResult> {
  const linesToApply = locked.lines.filter((line) => line.decision.action === "link");
  if (linesToApply.length === 0) {
    throw new BadRequestError("La importación necesita al menos una línea vinculada a un producto para aplicarse");
  }
  if (!locked.supplierId && !locked.supplier) {
    throw new BadRequestError("La importación necesita un proveedor antes de aplicarse");
  }

  // Validación propia (la compra también valida): permite atribuir el error a la línea puntual
  // de la factura en vez de mostrar un mensaje genérico de todo el lote.
  await assertLinesStillValid(linesToApply);

  const purchase = await createSupplierPurchase(
    {
      ...(locked.supplierId ? { supplierId: locked.supplierId.toString() } : { supplierName: locked.supplier }),
      items: linesToApply.map((line) => ({
        productId: line.decision.product!.toString(),
        variantSku: line.decision.variantSku,
        quantity: line.decision.quantity,
        unitCost: line.decision.unitCost,
        updateCostPrice: line.decision.updateCostPrice,
        salePrice:
          line.decision.updateSalePrice && line.decision.salePrice !== null ? line.decision.salePrice : undefined,
      })),
      purchaseDate: input.purchaseDate,
      notes: input.notes ?? "",
      idempotencyKey: `invoice-import:${locked._id.toString()}`,
    },
    adminId,
    // El precio de venta lo decide el admin línea por línea: nunca el automático de la configuración.
    { autoPrice: false },
  );

  // Todo lo anterior fue una sola transacción: o se aplicaron todas las líneas o ninguna.
  const updatedLines: ISupplierInvoiceImportLine[] = locked.toObject().lines.map((line) =>
    line.decision.action === "link" ? { ...line, result: { ok: true, error: "" } } : line,
  );

  const updated = await SupplierInvoiceImport.findOneAndUpdate(
    { _id: locked._id },
    { $set: { status: "applied", purchase: purchase._id, appliedAt: new Date(), lines: updatedLines } },
    { new: true },
  );

  return { import: updated!, purchase };
}

async function assertLinesStillValid(lines: ISupplierInvoiceImportLine[]): Promise<void> {
  const productIds = [...new Set(lines.map((line) => line.decision.product!.toString()))];
  const products = await Product.find({ _id: { $in: productIds } });
  const productById = new Map(products.map((p) => [p._id.toString(), p]));

  for (const line of lines) {
    const label = `Línea ${line.lineNumber} ("${line.raw.description}")`;
    if (!Number.isInteger(line.decision.quantity) || line.decision.quantity < 1) {
      throw new BadRequestError(`${label}: la cantidad tiene que ser 1 o más`);
    }
    const product = productById.get(line.decision.product!.toString());
    const variantExists = product?.variants.some((v) => v.sku === line.decision.variantSku);
    if (!product || !variantExists) {
      throw new BadRequestError(`${label}: el producto o la variante ya no existen en el catálogo`);
    }
    if (product.isBundle) {
      throw new BadRequestError(`${label}: ${product.name} es un kit, la mercadería se compra por componente`);
    }
  }
}
