import type { PaginatedResult } from "@caracol/shared";
import { sumCents, suggestedPrice } from "@caracol/shared";
import type { FilterQuery, Types } from "mongoose";
import { Product, type IProductVariant } from "../models/Product.js";
import { Supplier } from "../models/Supplier.js";
import {
  SupplierPurchase,
  type ISupplierPurchase,
  type SupplierPurchaseDocument,
} from "../models/SupplierPurchase.js";
import { BadRequestError, NotFoundError } from "../utils/AppError.js";
import { withTransaction } from "../utils/transaction.js";
import type {
  CreateSupplierPurchaseInput,
  ListSupplierPurchasesQuery,
} from "../validators/supplierPurchaseValidators.js";
import { recordMovements, type StockChange } from "./inventoryService.js";
import { getPricingSettings } from "./settingsService.js";

function findVariant(
  product: { variants: IProductVariant[] } | undefined,
  sku: string,
): IProductVariant | undefined {
  return product?.variants.find((v) => v.sku === sku);
}

async function resolveSupplier(
  input: CreateSupplierPurchaseInput,
): Promise<{ supplier?: Types.ObjectId; supplierName: string }> {
  if (input.supplierId) {
    const supplier = await Supplier.findById(input.supplierId);
    if (!supplier) throw new NotFoundError("Proveedor no encontrado");
    if (!supplier.isActive) throw new BadRequestError("El proveedor está inactivo");
    return { supplier: supplier._id, supplierName: supplier.name };
  }
  return { supplierName: input.supplierName! };
}

export interface CreatePurchaseOptions {
  /**
   * `false` fuerza a no recalcular precios de venta aunque esté activado en la configuración:
   * lo usa la importación de facturas, donde el admin decide el precio línea por línea.
   */
  autoPrice?: boolean;
}

/**
 * Registra una compra y la aplica al inventario en una sola transacción: la compra, el ingreso de
 * stock, su movimiento y el nuevo costo de cada variante se guardan juntos o no se guarda nada.
 *
 * - El costo unitario pasa a ser el `costPrice` vigente de la variante (si un SKU se repite en la
 *   compra, gana la última línea).
 * - Si en la configuración de precios está activado "precio automático al comprar", el precio de
 *   venta se recalcula con el margen y el redondeo del negocio.
 * - Es idempotente por `idempotencyKey`: reintentar el mismo envío devuelve la compra ya creada.
 */
export async function createSupplierPurchase(
  input: CreateSupplierPurchaseInput,
  adminId: string,
  options: CreatePurchaseOptions = {},
): Promise<SupplierPurchaseDocument> {
  if (input.idempotencyKey) {
    const existing = await SupplierPurchase.findOne({ idempotencyKey: input.idempotencyKey });
    if (existing) return existing;
  }

  const { supplier, supplierName } = await resolveSupplier(input);

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await Product.find({ _id: { $in: productIds } });
  const productById = new Map(products.map((p) => [p._id.toString(), p]));

  const items = input.items.map((item) => {
    const sku = item.variantSku.toUpperCase();
    const product = productById.get(item.productId);
    const variant = findVariant(product, sku);
    if (!product || !variant) {
      throw new NotFoundError(`Producto o variante no encontrados (${item.variantSku})`);
    }
    if (product.isBundle) {
      throw new BadRequestError(`${product.name} es un kit: la mercadería se compra por componente`);
    }
    return {
      product: product._id,
      variantSku: sku,
      quantity: item.quantity,
      unitCost: item.unitCost,
      totalCost: item.unitCost * item.quantity,
    };
  });
  const totalCost = sumCents(...items.map((i) => i.totalCost));
  // Qué hacer con el costo y el precio de cada variante (si un SKU se repite gana la última línea).
  const extrasBySku = new Map(
    input.items.map((i) => [i.variantSku.toUpperCase(), { updateCostPrice: i.updateCostPrice, salePrice: i.salePrice }]),
  );

  const pricing = await getPricingSettings();
  const autoPrice = options.autoPrice !== false && pricing.autoPriceOnPurchase;

  try {
    return await withTransaction(async (session) => {
      const [purchase] = await SupplierPurchase.create(
        [
          {
            supplier,
            supplierName,
            items,
            totalCost,
            purchaseDate: input.purchaseDate ?? new Date(),
            notes: input.notes,
            idempotencyKey: input.idempotencyKey,
            createdBy: adminId,
          },
        ],
        { session },
      );
      if (!purchase) throw new Error("No se pudo crear la compra");

      const changes: StockChange[] = [];
      for (const item of items) {
        const extra = extrasBySku.get(item.variantSku);
        const set: Record<string, number> = {};
        if (extra?.updateCostPrice !== false) set["variants.$.costPrice"] = item.unitCost;
        if (extra?.salePrice !== undefined) set["variants.$.price"] = extra.salePrice;
        else if (autoPrice) set["variants.$.price"] = suggestedPrice(item.unitCost, pricing);

        const before = await Product.findOneAndUpdate(
          { _id: item.product, "variants.sku": item.variantSku },
          {
            $inc: { "variants.$.stock": item.quantity },
            ...(Object.keys(set).length > 0 && { $set: set }),
          },
          { session },
        );
        const variant = findVariant(before ?? undefined, item.variantSku);
        if (!before || !variant) {
          throw new NotFoundError(`Producto o variante no encontrados (${item.variantSku})`);
        }
        changes.push({
          product: item.product.toString(),
          variantSku: item.variantSku,
          quantity: item.quantity,
          previousStock: variant.stock,
          newStock: variant.stock + item.quantity,
        });
      }

      await recordMovements(
        changes,
        { type: "purchase_in", reference: purchase._id.toString(), createdBy: adminId },
        session,
      );
      return purchase;
    });
  } catch (err) {
    // Otro envío con la misma clave ganó la carrera (doble click, reintento): esa compra ya
    // movió el stock, así que se devuelve esa y no se hace nada más.
    if (input.idempotencyKey && (err as { code?: number }).code === 11000) {
      const winner = await SupplierPurchase.findOne({ idempotencyKey: input.idempotencyKey });
      if (winner) return winner;
    }
    throw err;
  }
}

export async function listSupplierPurchases(
  query: ListSupplierPurchasesQuery,
): Promise<PaginatedResult<SupplierPurchaseDocument>> {
  const filter: FilterQuery<ISupplierPurchase> = {};
  if (query.supplier) filter.supplier = query.supplier;
  if (query.product) filter["items.product"] = query.product;
  if (query.dateFrom || query.dateTo) {
    filter.purchaseDate = {
      ...(query.dateFrom && { $gte: query.dateFrom }),
      ...(query.dateTo && { $lte: query.dateTo }),
    };
  }

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    SupplierPurchase.find(filter).sort({ purchaseDate: -1 }).skip(skip).limit(query.limit),
    SupplierPurchase.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getSupplierPurchaseById(id: string): Promise<SupplierPurchaseDocument> {
  const purchase = await SupplierPurchase.findById(id);
  if (!purchase) throw new NotFoundError("Compra no encontrada");
  return purchase;
}
