import type { ProductVariantAttribute } from "../types/product.js";

/**
 * Texto corto para mostrar una variante en carritos, pedidos y tickets
 * ("Rojo / M"). Vacío para productos de una sola variante sin atributos.
 */
export function formatVariantLabel(attributes: readonly ProductVariantAttribute[] | undefined): string {
  return (attributes ?? [])
    .map((a) => a.value.trim())
    .filter(Boolean)
    .join(" / ");
}

/** "Producto" o "Producto - Rojo / M": el nombre con la variante, si la tiene. */
export function withVariantLabel(productName: string, variantLabel: string): string {
  return variantLabel ? `${productName} - ${variantLabel}` : productName;
}
