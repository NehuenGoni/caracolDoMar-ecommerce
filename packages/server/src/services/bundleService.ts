import { formatVariantLabel, sumCents, type BundleComponent } from "@caracol/shared";
import { Types } from "mongoose";
import { Order } from "../models/Order.js";
import { Product, type IBundleItem, type ProductDocument } from "../models/Product.js";
import { StoreSale } from "../models/StoreSale.js";
import { BadRequestError, ConflictError } from "../utils/AppError.js";

/**
 * Kits/combos: un producto con una sola variante (el precio del kit) y sin stock propio.
 * Lo que se vende de más no se puede "inventar": el stock disponible sale de los componentes
 * y, al venderse, se descuenta de cada uno. Todo el stock pasa por `decrementStock`,
 * `restockItems` y `returnStock`, que expanden los kits con `expandBundleItems`.
 */

export type ComponentsById = Map<string, ProductDocument>;

export interface StockItem {
  product: Types.ObjectId | string;
  variantSku: string;
  quantity: number;
}

/** Carga, en una sola consulta, los productos que son componentes de los kits dados. */
export async function loadComponents(
  bundles: Pick<ProductDocument, "bundleItems">[],
): Promise<ComponentsById> {
  const ids = [...new Set(bundles.flatMap((b) => b.bundleItems.map((i) => i.product.toString())))];
  if (ids.length === 0) return new Map();
  const products = await Product.find({ _id: { $in: ids } });
  return new Map(products.map((p) => [p._id.toString(), p]));
}

/**
 * Cuántos kits se pueden armar con el stock actual: el componente más escaso manda.
 * Un componente archivado o que ya no existe deja el kit sin stock.
 */
export function bundleAvailability(
  bundle: Pick<ProductDocument, "bundleItems">,
  components: ComponentsById,
): number {
  if (bundle.bundleItems.length === 0) return 0;
  let available = Infinity;
  for (const item of bundle.bundleItems) {
    const component = components.get(item.product.toString());
    const variant = component?.variants.find((v) => v.sku === item.variantSku);
    if (!component?.isActive || !variant) return 0;
    available = Math.min(available, Math.floor(variant.stock / item.quantity));
  }
  return Number.isFinite(available) ? available : 0;
}

/** Stock que se le muestra y se le permite comprar a un cliente: propio, o derivado si es un kit. */
export function sellableStock(
  product: Pick<ProductDocument, "isBundle" | "bundleItems">,
  variantStock: number,
  components: ComponentsById,
): number {
  return product.isBundle ? bundleAvailability(product, components) : variantStock;
}

export function describeComponents(
  bundle: Pick<ProductDocument, "bundleItems">,
  components: ComponentsById,
): BundleComponent[] {
  return bundle.bundleItems.map((item) => {
    const component = components.get(item.product.toString());
    const variant = component?.variants.find((v) => v.sku === item.variantSku);
    return {
      productId: item.product.toString(),
      productName: component?.name ?? "Producto no disponible",
      variantSku: item.variantSku,
      variantLabel: formatVariantLabel(variant?.attributes),
      quantity: item.quantity,
    };
  });
}

/**
 * Reemplaza cada kit por sus componentes (cantidad del kit × cantidad del componente) y junta los
 * repetidos. Lo que no es un kit pasa igual. Devuelve ids como string.
 */
export async function expandBundleItems(
  items: StockItem[],
): Promise<{ product: string; variantSku: string; quantity: number }[]> {
  const ids = [...new Set(items.map((i) => i.product.toString()))];
  const bundles = await Product.find({ _id: { $in: ids }, isBundle: true }).select("bundleItems");
  const bundleById = new Map(bundles.map((b) => [b._id.toString(), b]));

  const merged = new Map<string, { product: string; variantSku: string; quantity: number }>();
  const add = (product: string, variantSku: string, quantity: number) => {
    const key = `${product}:${variantSku}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += quantity;
    else merged.set(key, { product, variantSku, quantity });
  };

  for (const item of items) {
    const bundle = bundleById.get(item.product.toString());
    if (!bundle) {
      add(item.product.toString(), item.variantSku, item.quantity);
      continue;
    }
    for (const component of bundle.bundleItems) {
      add(component.product.toString(), component.variantSku, component.quantity * item.quantity);
    }
  }
  return [...merged.values()];
}

interface BundleInput {
  isBundle: boolean;
  bundleItems: { product: string; variantSku: string; quantity: number }[];
  variantCount: number;
}

/**
 * Valida la composición de un kit y devuelve el costo que le corresponde (suma de los costos de
 * los componentes). Un kit no puede incluirse a sí mismo ni a otros kits: el descuento de stock
 * se expande un solo nivel.
 */
export async function validateBundle(
  input: BundleInput,
  selfId?: string,
): Promise<{ items: IBundleItem[]; costPrice: number }> {
  if (!input.isBundle) {
    if (input.bundleItems.length > 0) {
      throw new BadRequestError("Solo un kit puede tener componentes");
    }
    return { items: [], costPrice: 0 };
  }
  if (input.bundleItems.length === 0) {
    throw new BadRequestError("Un kit necesita al menos un componente");
  }
  if (input.variantCount !== 1) {
    throw new BadRequestError("Un kit tiene una sola variante: la del precio del kit");
  }

  const keys = input.bundleItems.map((i) => `${i.product}:${i.variantSku.toUpperCase()}`);
  if (new Set(keys).size !== keys.length) {
    throw new BadRequestError("Un componente del kit está repetido");
  }
  if (selfId && input.bundleItems.some((i) => i.product === selfId)) {
    throw new BadRequestError("Un kit no puede incluirse a sí mismo");
  }

  const products = await Product.find({ _id: { $in: input.bundleItems.map((i) => i.product) } });
  const productById = new Map(products.map((p) => [p._id.toString(), p]));

  const items: IBundleItem[] = [];
  const costs: number[] = [];
  for (const item of input.bundleItems) {
    const sku = item.variantSku.toUpperCase();
    const component = productById.get(item.product);
    const variant = component?.variants.find((v) => v.sku === sku);
    if (!component || !variant) {
      throw new BadRequestError(`Componente no encontrado (${sku})`);
    }
    if (component.isBundle) {
      throw new BadRequestError(`${component.name} es un kit: un kit no puede incluir otros kits`);
    }
    if (!component.isActive) {
      throw new BadRequestError(`${component.name} está archivado`);
    }
    items.push({ product: component._id, variantSku: sku, quantity: item.quantity });
    costs.push(variant.costPrice * item.quantity);
  }
  return { items, costPrice: sumCents(...costs) };
}

/**
 * Un kit ya vendido no puede cambiar de composición: las devoluciones y cancelaciones reponen
 * stock según la composición actual, así que cambiarla dejaría el inventario mal.
 */
export async function assertBundleNeverSold(productId: string): Promise<void> {
  const [inOrder, inSale] = await Promise.all([
    Order.exists({ "items.product": productId }),
    StoreSale.exists({ "items.product": productId }),
  ]);
  if (inOrder || inSale) {
    throw new ConflictError(
      "Este kit ya tiene ventas: no se puede cambiar su composición. Archivalo y creá uno nuevo.",
    );
  }
}
