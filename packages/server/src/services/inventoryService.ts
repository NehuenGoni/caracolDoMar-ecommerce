import { formatVariantLabel, type PaginatedResult, type StockMovementType } from "@caracol/shared";
import type { FilterQuery } from "mongoose";
import { expandBundleItems } from "./bundleService.js";
import { Product, type IProduct, type IProductVariant } from "../models/Product.js";
import {
  StockMovement,
  type IStockMovement,
  type StockMovementDocument,
} from "../models/StockMovement.js";
import { BadRequestError, NotFoundError } from "../utils/AppError.js";
import type { AdjustStockInput, ListMovementsQuery } from "../validators/inventoryValidators.js";

export interface StockChange {
  product: string;
  variantSku: string;
  quantity: number;
  previousStock: number;
  newStock: number;
}

interface MovementMeta {
  type: StockMovementType;
  reference?: string;
  note?: string;
  createdBy?: string;
}

/** Inserción en lote: el log es append-only, no hace falta ni tiene sentido hacerlo secuencial. */
export async function recordMovements(changes: StockChange[], meta: MovementMeta): Promise<void> {
  if (changes.length === 0) return;
  await StockMovement.insertMany(
    changes.map((change) => ({
      product: change.product,
      variantSku: change.variantSku,
      quantity: change.quantity,
      previousStock: change.previousStock,
      newStock: change.newStock,
      type: meta.type,
      reference: meta.reference,
      note: meta.note,
      createdBy: meta.createdBy,
    })),
  );
}

interface StockRestoreItem {
  product: string;
  variantSku: string;
  quantity: number;
}

/**
 * Repone stock de una orden cancelada/rechazada y dejar constancia en el
 * log de auditoría (a diferencia de un rollback técnico interno, esto sí
 * es un evento de negocio real).
 */
export async function returnStock(
  items: StockRestoreItem[],
  meta: { reference?: string; note?: string; createdBy?: string },
): Promise<void> {
  const changes: StockChange[] = [];
  // Un kit repone el stock de sus componentes, no el suyo.
  for (const item of await expandBundleItems(items)) {
    const before = await Product.findOneAndUpdate(
      { _id: item.product, "variants.sku": item.variantSku },
      { $inc: { "variants.$.stock": item.quantity } },
    );
    const variant = before?.variants.find((v) => v.sku === item.variantSku);
    if (!before || !variant) continue;

    changes.push({
      product: item.product,
      variantSku: item.variantSku,
      quantity: item.quantity,
      previousStock: variant.stock,
      newStock: variant.stock + item.quantity,
    });
  }
  await recordMovements(changes, { type: "return", ...meta });
}

function findVariant(
  product: { variants: IProductVariant[] } | null,
  sku: string,
): IProductVariant | undefined {
  return product?.variants.find((v) => v.sku === sku);
}

/** Ajuste manual de stock (admin): siempre queda registrado con su responsable. */
export async function adjustStock(input: AdjustStockInput, adminId: string): Promise<StockMovementDocument> {
  const sku = input.variantSku.toUpperCase();
  const product = await Product.findOne({ _id: input.productId });
  const variant = findVariant(product, sku);
  if (!product || !variant) throw new NotFoundError("Producto o variante no encontrados");
  if (product.isBundle) {
    throw new BadRequestError("Un kit no tiene stock propio: ajustá el stock de sus componentes");
  }

  const previousStock = variant.stock;
  const newStock = previousStock + input.quantityChange;
  if (newStock < 0) {
    throw new BadRequestError("El ajuste dejaría el stock en un valor negativo");
  }

  const filter: FilterQuery<IProduct> = {
    _id: input.productId,
    variants: {
      $elemMatch:
        input.quantityChange < 0 ? { sku, stock: { $gte: -input.quantityChange } } : { sku },
    },
  };

  const updated = await Product.findOneAndUpdate(filter, {
    $inc: { "variants.$.stock": input.quantityChange },
  });
  if (!updated) {
    throw new BadRequestError("El ajuste dejaría el stock en un valor negativo");
  }

  return StockMovement.create({
    product: input.productId,
    variantSku: sku,
    type: "adjustment",
    quantity: input.quantityChange,
    previousStock,
    newStock,
    note: input.note,
    createdBy: adminId,
  });
}

export async function listMovements(
  query: ListMovementsQuery,
): Promise<PaginatedResult<StockMovementDocument>> {
  const filter: FilterQuery<IStockMovement> = {};
  if (query.product) filter.product = query.product;
  if (query.variantSku) filter.variantSku = query.variantSku.toUpperCase();
  if (query.type) filter.type = query.type;

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    StockMovement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit),
    StockMovement.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export interface LowStockVariant {
  productId: string;
  productName: string;
  variantSku: string;
  variantLabel: string;
  stock: number;
  lowStockThreshold: number;
}

export async function listLowStock(): Promise<LowStockVariant[]> {
  // Se filtra en la base: cargar todo el catálogo en memoria no escala.
  const rows = await Product.aggregate<Omit<LowStockVariant, "variantLabel"> & { attributes: IProductVariant["attributes"] }>([
    // Los kits no tienen stock propio y las piezas únicas no se reponen: no son "stock bajo".
    { $match: { isActive: true, isBundle: { $ne: true } } },
    { $unwind: "$variants" },
    { $match: { "variants.isUniquePiece": { $ne: true } } },
    { $match: { $expr: { $lte: ["$variants.stock", "$variants.lowStockThreshold"] } } },
    {
      $project: {
        _id: 0,
        productId: { $toString: "$_id" },
        productName: "$name",
        variantSku: "$variants.sku",
        attributes: "$variants.attributes",
        stock: "$variants.stock",
        lowStockThreshold: "$variants.lowStockThreshold",
      },
    },
  ]);
  return rows.map(({ attributes, ...row }) => ({ ...row, variantLabel: formatVariantLabel(attributes) }));
}
