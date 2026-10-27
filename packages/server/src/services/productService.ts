import type { PaginatedResult } from "@caracol/shared";
import type { FilterQuery, Types } from "mongoose";
import { Category } from "../models/Category.js";
import {
  Product,
  type IProduct,
  type IProductVariant,
  type ProductDocument,
} from "../models/Product.js";
import { BadRequestError, NotFoundError } from "../utils/AppError.js";
import type {
  AdminListProductsQuery,
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from "../validators/productValidators.js";
import { recordMovements, type StockChange } from "./inventoryService.js";

type VariantInput = CreateProductInput["variants"][number];

export type PublicVariant = Omit<IProductVariant, "costPrice">;
export type PublicProduct = Omit<ReturnType<ProductDocument["toJSON"]>, "variants"> & {
  variants: PublicVariant[];
};

/**
 * Lo que ve un cliente (o un visitante): sin el costo de compra, que es dato
 * interno del negocio. Cualquier endpoint que devuelva productos a no-admins
 * tiene que pasar por acá.
 */
export function toPublicProduct(product: ProductDocument): PublicProduct {
  const { variants, ...rest } = product.toJSON();
  return {
    ...rest,
    variants: variants.map(({ costPrice: _costPrice, ...variant }) => variant),
  };
}

function buildFilter(
  query: ListProductsQuery,
  { includeInactive }: { includeInactive: boolean },
): FilterQuery<IProduct> {
  const filter: FilterQuery<IProduct> = {};
  if (!includeInactive) filter.isActive = true;
  if (query.category) filter.category = query.category;
  if (query.isFeatured !== undefined) filter.isFeatured = query.isFeatured;
  if (query.tags?.length) filter.tags = { $in: query.tags };
  if (query.search) filter.$text = { $search: query.search };
  return filter;
}

async function paginate(
  filter: FilterQuery<IProduct>,
  query: ListProductsQuery,
): Promise<PaginatedResult<ProductDocument>> {
  const skip = (query.page - 1) * query.limit;
  const sort: Record<string, 1 | -1 | { $meta: string }> = query.search
    ? { score: { $meta: "textScore" } }
    : { createdAt: -1 };
  const projection = query.search ? { score: { $meta: "textScore" } } : undefined;

  const [items, total] = await Promise.all([
    Product.find(filter, projection).sort(sort).skip(skip).limit(query.limit),
    Product.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function listPublicProducts(
  query: ListProductsQuery,
  viewerIsAdmin: boolean,
): Promise<PaginatedResult<ProductDocument | PublicProduct>> {
  const filter = buildFilter(query, { includeInactive: viewerIsAdmin });
  const result = await paginate(filter, query);
  return viewerIsAdmin ? result : { ...result, items: result.items.map(toPublicProduct) };
}

export async function getPublicProductBySlug(
  slug: string,
  viewerIsAdmin: boolean,
): Promise<ProductDocument | PublicProduct> {
  const filter: FilterQuery<IProduct> = viewerIsAdmin ? { slug } : { slug, isActive: true };
  const product = await Product.findOne(filter);
  if (!product) throw new NotFoundError("Producto no encontrado");
  return viewerIsAdmin ? product : toPublicProduct(product);
}

export async function listAdminProducts(
  query: AdminListProductsQuery,
): Promise<PaginatedResult<ProductDocument>> {
  const filter = buildFilter(query, { includeInactive: query.includeInactive });
  return paginate(filter, query);
}

export async function getAdminProductById(id: string): Promise<ProductDocument> {
  const product = await Product.findById(id);
  if (!product) throw new NotFoundError("Producto no encontrado");
  return product;
}

async function assertCategoryExists(categoryId: string): Promise<void> {
  const exists = await Category.exists({ _id: categoryId });
  if (!exists) throw new NotFoundError("Categoría no encontrada");
}

function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

function assertUniqueSkus(variants: VariantInput[]): void {
  const skus = variants.map((v) => normalizeSku(v.sku));
  if (new Set(skus).size !== skus.length) {
    throw new BadRequestError("Hay SKUs repetidos entre las variantes");
  }
}

/** El stock inicial de una variante nueva también es un movimiento: si no, el log no cierra. */
async function recordInitialStock(
  product: ProductDocument,
  skus: Set<string>,
  adminId: string,
): Promise<void> {
  const changes: StockChange[] = product.variants
    .filter((v) => skus.has(v.sku) && v.stock > 0)
    .map((v) => ({
      product: product._id.toString(),
      variantSku: v.sku,
      quantity: v.stock,
      previousStock: 0,
      newStock: v.stock,
    }));
  await recordMovements(changes, { type: "adjustment", note: "Stock inicial", createdBy: adminId });
}

export async function createProduct(
  input: CreateProductInput,
  adminId: string,
): Promise<ProductDocument> {
  assertUniqueSkus(input.variants);
  await assertCategoryExists(input.category);
  const product = await Product.create(input);
  await recordInitialStock(product, new Set(product.variants.map((v) => v.sku)), adminId);
  return product;
}

/**
 * Edita las variantes sin tocar el stock de las que ya existen: el stock real
 * cambia por ventas, compras y devoluciones mientras el admin tiene el
 * formulario abierto, y pisarlo con lo que cargó la pantalla rompería el
 * inventario (y el log). Se modifican campo por campo —no se reemplaza el
 * array— para que Mongoose emita `$set` sobre esos paths y no pise los
 * `$inc` concurrentes. Las variantes nuevas nacen con su stock inicial.
 */
function applyVariantEdits(product: ProductDocument, incoming: VariantInput[]): Set<string> {
  assertUniqueSkus(incoming);
  const incomingSkus = new Set(incoming.map((v) => normalizeSku(v.sku)));

  for (const existing of [...product.variants]) {
    if (incomingSkus.has(existing.sku)) continue;
    if (existing.stock > 0) {
      throw new BadRequestError(
        `No se puede quitar la variante ${existing.sku} porque todavía tiene stock; ajustalo a 0 primero`,
      );
    }
    // $pull atómico: no reemplaza el array, así no pisa decrementos de stock concurrentes.
    (product.variants as unknown as Types.DocumentArray<IProductVariant>).pull({ _id: existing._id });
  }

  const created = new Set<string>();
  for (const data of incoming) {
    const sku = normalizeSku(data.sku);
    const existing = product.variants.find((v) => v.sku === sku);
    if (!existing) {
      product.variants.push({ ...data, sku });
      created.add(sku);
      continue;
    }
    Object.assign(existing, {
      attributeName: data.attributeName,
      attributeValue: data.attributeValue,
      price: data.price,
      costPrice: data.costPrice,
      lowStockThreshold: data.lowStockThreshold,
      weight: data.weight,
      height: data.height,
      width: data.width,
      length: data.length,
      barcode: data.barcode,
    });
  }
  return created;
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
  adminId: string,
): Promise<ProductDocument> {
  const product = await getAdminProductById(id);

  if (input.category) {
    await assertCategoryExists(input.category);
  }

  const { variants, ...fields } = input;
  Object.assign(product, fields);
  const createdSkus = variants ? applyVariantEdits(product, variants) : new Set<string>();
  await product.save();
  await recordInitialStock(product, createdSkus, adminId);
  return product;
}

/**
 * Baja lógica: los pedidos, ventas, carritos y movimientos de stock siguen
 * apuntando a este producto, así que no se borra. Deja de verse en la tienda
 * y en el POS, y su SKU queda reservado.
 */
export async function deleteProduct(id: string): Promise<void> {
  const product = await getAdminProductById(id);
  product.isActive = false;
  await product.save();
}
