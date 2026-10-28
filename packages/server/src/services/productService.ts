import type { BundleComponent, PaginatedResult } from "@caracol/shared";
import type { FilterQuery, Types } from "mongoose";
import { Category } from "../models/Category.js";
import { Supplier } from "../models/Supplier.js";
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
import {
  assertBundleNeverSold,
  bundleAvailability,
  describeComponents,
  loadComponents,
  validateBundle,
} from "./bundleService.js";
import { getCategoryWithDescendantIds } from "./categoryService.js";
import { recordMovements, type StockChange } from "./inventoryService.js";

type VariantInput = CreateProductInput["variants"][number];

/** Un producto como sale en el JSON de la API. */
export type ProductView = IProduct & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  bundleComponents?: BundleComponent[];
};
export type PublicVariant = Omit<IProductVariant, "costPrice">;
export type PublicProductView = Omit<ProductView, "variants" | "supplier"> & {
  variants: PublicVariant[];
};

/**
 * Cómo sale un producto de la API. Dos reglas que no se pueden olvidar:
 * - El costo de compra es dato interno: a los no-admins se les quita. Cualquier endpoint que
 *   devuelva productos a un visitante o cliente tiene que pasar por acá.
 * - El stock de un kit no se guarda: se calcula de sus componentes, y se informan los
 *   componentes ("Incluye: …") sin exponer el stock de cada uno.
 */
export async function serializeProducts(
  products: ProductDocument[],
  viewerIsAdmin: true,
): Promise<ProductView[]>;
export async function serializeProducts(
  products: ProductDocument[],
  viewerIsAdmin: boolean,
): Promise<(ProductView | PublicProductView)[]>;
export async function serializeProducts(
  products: ProductDocument[],
  viewerIsAdmin: boolean,
): Promise<(ProductView | PublicProductView)[]> {
  const components = await loadComponents(products.filter((p) => p.isBundle));

  return products.map((product) => {
    const json = product.toJSON() as unknown as ProductView;
    if (product.isBundle) {
      const available = bundleAvailability(product, components);
      json.variants = json.variants.map((v) => ({ ...v, stock: available }));
      json.bundleComponents = describeComponents(product, components);
    }
    if (viewerIsAdmin) return json;
    const { supplier: _supplier, ...publicJson } = json;
    return {
      ...publicJson,
      variants: json.variants.map(({ costPrice: _costPrice, ...variant }) => variant),
    };
  });
}

const SORTS: Record<NonNullable<ListProductsQuery["sort"]>, Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: 1 },
  // Sobre un array Mongo ordena por el menor precio (asc) o el mayor (desc): para productos de una
  // sola variante es exacto, y con varias variantes es una buena aproximación.
  price_asc: { "variants.price": 1, _id: 1 },
  price_desc: { "variants.price": -1, _id: 1 },
  name: { name: 1, _id: 1 },
};

async function buildFilter(
  query: ListProductsQuery,
  { includeInactive, hideSoldOutUniquePieces }: { includeInactive: boolean; hideSoldOutUniquePieces: boolean },
): Promise<FilterQuery<IProduct>> {
  const filter: FilterQuery<IProduct> = {};
  const and: FilterQuery<IProduct>[] = [];

  if (!includeInactive) filter.isActive = true;
  // La categoría incluye a sus subcategorías (Sahumerios → Sahumerios de sándalo).
  if (query.category) filter.category = { $in: await getCategoryWithDescendantIds(query.category) };
  if (query.isFeatured !== undefined) filter.isFeatured = query.isFeatured;
  if (query.tags?.length) filter.tags = { $in: query.tags };
  if (query.brand) filter.brand = query.brand;
  if (query.search) filter.$text = { $search: query.search };

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const price: { $gte?: number; $lte?: number } = {};
    if (query.minPrice !== undefined) price.$gte = query.minPrice;
    if (query.maxPrice !== undefined) price.$lte = query.maxPrice;
    and.push({ variants: { $elemMatch: { price } } });
  }

  // Una pieza única vendida sale del listado (la ficha sigue accesible por el link: "vendida").
  if (hideSoldOutUniquePieces) {
    and.push({
      variants: { $elemMatch: { $or: [{ isUniquePiece: { $ne: true } }, { stock: { $gt: 0 } }] } },
    });
  }

  if (and.length > 0) filter.$and = and;
  return filter;
}

async function paginate(
  filter: FilterQuery<IProduct>,
  query: ListProductsQuery,
): Promise<PaginatedResult<ProductDocument>> {
  const skip = (query.page - 1) * query.limit;
  const sort: Record<string, 1 | -1 | { $meta: string }> = query.sort
    ? SORTS[query.sort]
    : query.search
      ? { score: { $meta: "textScore" } }
      : SORTS.newest;
  const projection = query.search ? { score: { $meta: "textScore" } } : undefined;

  let find = Product.find(filter, projection).sort(sort).skip(skip).limit(query.limit);
  // Orden alfabético sin distinguir mayúsculas ni tildes. $text no admite collation.
  if (query.sort === "name" && !query.search) find = find.collation({ locale: "es", strength: 1 });

  const [items, total] = await Promise.all([find, Product.countDocuments(filter)]);

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
): Promise<PaginatedResult<ProductView | PublicProductView>> {
  const filter = await buildFilter(query, {
    includeInactive: viewerIsAdmin,
    hideSoldOutUniquePieces: !viewerIsAdmin,
  });
  const result = await paginate(filter, query);
  return { ...result, items: await serializeProducts(result.items, viewerIsAdmin) };
}

export async function getPublicProductBySlug(
  slug: string,
  viewerIsAdmin: boolean,
): Promise<ProductView | PublicProductView> {
  const filter: FilterQuery<IProduct> = viewerIsAdmin ? { slug } : { slug, isActive: true };
  const product = await Product.findOne(filter);
  if (!product) throw new NotFoundError("Producto no encontrado");
  const [view] = await serializeProducts([product], viewerIsAdmin);
  return view as ProductView | PublicProductView;
}

export async function listAdminProducts(
  query: AdminListProductsQuery,
): Promise<PaginatedResult<ProductView>> {
  const filter = await buildFilter(query, {
    includeInactive: query.includeInactive,
    hideSoldOutUniquePieces: false,
  });
  const result = await paginate(filter, query);
  return { ...result, items: await serializeProducts(result.items, true) };
}

export async function getAdminProductById(id: string): Promise<ProductDocument> {
  const product = await Product.findById(id);
  if (!product) throw new NotFoundError("Producto no encontrado");
  return product;
}

export async function toAdminView(product: ProductDocument): Promise<ProductView> {
  const [view] = await serializeProducts([product], true);
  return view as ProductView;
}

export interface CatalogFacets {
  brands: string[];
  tags: string[];
  /** Centavos. `null` si todavía no hay productos. */
  price: { min: number; max: number } | null;
}

/** Valores para armar los filtros de la tienda (solo lo que hoy se vende). */
export async function getCatalogFacets(): Promise<CatalogFacets> {
  const active = { isActive: true };
  const [brands, tags, price] = await Promise.all([
    Product.distinct("brand", { ...active, brand: { $nin: [null, ""] } }),
    Product.distinct("tags", active),
    Product.aggregate<{ min: number; max: number }>([
      { $match: active },
      { $unwind: "$variants" },
      { $group: { _id: null, min: { $min: "$variants.price" }, max: { $max: "$variants.price" } } },
    ]),
  ]);
  const collator = new Intl.Collator("es", { sensitivity: "base" });
  return {
    brands: (brands as string[]).sort(collator.compare),
    tags: (tags as string[]).filter(Boolean).sort(collator.compare),
    price: price[0] ? { min: price[0].min, max: price[0].max } : null,
  };
}

async function assertCategoryExists(categoryId: string): Promise<void> {
  const exists = await Category.exists({ _id: categoryId });
  if (!exists) throw new NotFoundError("Categoría no encontrada");
}

async function assertSupplierExists(supplierId: string | null | undefined): Promise<void> {
  if (!supplierId) return;
  if (!(await Supplier.exists({ _id: supplierId }))) throw new NotFoundError("Proveedor no encontrado");
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
  await assertSupplierExists(input.supplier);

  const isBundle = input.isBundle ?? false;
  const bundle = await validateBundle({
    isBundle,
    bundleItems: input.bundleItems ?? [],
    variantCount: input.variants.length,
  });
  // Un kit no tiene stock propio y su costo es la suma del de sus componentes.
  const variants = isBundle
    ? input.variants.map((v) => ({ ...v, stock: 0, isUniquePiece: false, costPrice: bundle.costPrice }))
    : input.variants;

  const product = await Product.create({ ...input, variants, bundleItems: bundle.items });
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
      attributes: data.attributes,
      price: data.price,
      costPrice: data.costPrice,
      lowStockThreshold: data.lowStockThreshold,
      weight: data.weight,
      height: data.height,
      width: data.width,
      length: data.length,
      barcode: data.barcode,
      isUniquePiece: data.isUniquePiece,
    });
  }
  return created;
}

function sameComposition(
  current: { product: Types.ObjectId; variantSku: string; quantity: number }[],
  next: { product: string; variantSku: string; quantity: number }[],
): boolean {
  const key = (p: string, sku: string, qty: number) => `${p}:${sku.toUpperCase()}:${qty}`;
  const a = current.map((i) => key(i.product.toString(), i.variantSku, i.quantity)).sort();
  const b = next.map((i) => key(i.product, i.variantSku, i.quantity)).sort();
  return a.length === b.length && a.every((k, i) => k === b[i]);
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
  await assertSupplierExists(input.supplier);
  if (input.isBundle !== undefined && input.isBundle !== product.isBundle) {
    // Cambiaría de qué se descuenta el stock de las ventas ya hechas.
    throw new BadRequestError("Un producto no se puede convertir en kit (ni al revés): creá uno nuevo");
  }

  const { variants, bundleItems, isBundle: _isBundle, ...fields } = input;
  let incomingVariants = variants;

  if (product.isBundle) {
    if (variants && variants.length !== 1) {
      throw new BadRequestError("Un kit tiene una sola variante: la del precio del kit");
    }
    let costPrice = product.variants[0]?.costPrice ?? 0;
    if (bundleItems && !sameComposition(product.bundleItems, bundleItems)) {
      await assertBundleNeverSold(id);
      const validated = await validateBundle({ isBundle: true, bundleItems, variantCount: 1 }, id);
      product.bundleItems = validated.items;
      costPrice = validated.costPrice;
      // Si el formulario no reenvía las variantes, el costo nuevo igual tiene que quedar guardado.
      if (!variants && product.variants[0]) product.variants[0].costPrice = costPrice;
    }
    // El costo del kit lo calcula el sistema; el stock no se guarda.
    incomingVariants = variants?.map((v) => ({ ...v, costPrice, isUniquePiece: false, stock: 0 }));
  } else if (bundleItems && bundleItems.length > 0) {
    throw new BadRequestError("Solo un kit puede tener componentes");
  }

  Object.assign(product, fields);
  const createdSkus = incomingVariants
    ? applyVariantEdits(product, incomingVariants)
    : new Set<string>();
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
