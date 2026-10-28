import type { ImageRef, VideoRef, WithTimestamps } from "./common.js";

/** Un atributo que distingue a la variante (Color: Rojo, Talle: M, Aroma: Lavanda…). */
export interface ProductVariantAttribute {
  name: string;
  value: string;
}

/**
 * Los atributos son una lista genérica (nombre/valor) para cubrir distintos rubros:
 * la ropa combina talle y color, mientras que un sahumerio o una vela pueden no tener
 * ninguno (producto de una sola variante).
 */
export interface ProductVariant {
  sku: string;
  attributes: ProductVariantAttribute[];
  price: number;
  costPrice: number;
  stock: number;
  lowStockThreshold: number;
  /** Gramos. Usado para cotizar el envío. */
  weight?: number;
  /** Centímetros. Usados para cotizar el envío. */
  height?: number;
  width?: number;
  length?: number;
  barcode?: string;
  /**
   * Pieza única (una piedra, una estatua): stock 1 y sale del listado de la tienda al venderse.
   * Se la trata como una variante normal salvo por eso, y no dispara alertas de stock bajo.
   */
  isUniquePiece?: boolean;
}

/** Un componente de un kit: se descuenta del stock de esa variante cada vez que se vende el kit. */
export interface BundleItem {
  product: string;
  variantSku: string;
  quantity: number;
}

/** Componente de un kit con los nombres ya resueltos, para mostrarlo ("Incluye: …"). */
export interface BundleComponent {
  productId: string;
  productName: string;
  variantSku: string;
  variantLabel: string;
  quantity: number;
}

export interface Product extends WithTimestamps {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  category: string;
  brand?: string;
  tags: string[];
  isActive: boolean;
  isFeatured: boolean;
  images: ImageRef[];
  videos: VideoRef[];
  variants: ProductVariant[];
  /**
   * Kit/combo (ej. "kit limpieza": sal + ruda + sahumerio + vela): una sola variante con el precio
   * del kit y sin stock propio. El stock disponible sale de sus componentes.
   */
  isBundle: boolean;
  bundleItems: BundleItem[];
  /** Solo en respuestas de la API, para kits. */
  bundleComponents?: BundleComponent[];
}
