import { BUSINESS } from "../constants/business.js";
import type { Category } from "../types/category.js";
import type { Product } from "../types/product.js";

/**
 * Título, descripción, imagen y datos estructurados (JSON-LD) de cada página pública. Los usan el
 * cliente (`useSeo`) y el server (el HTML que reciben Google, WhatsApp e Instagram), así los dos
 * dicen exactamente lo mismo.
 *
 * `siteUrl` es la URL pública de la tienda, sin barra al final (en el server, `CLIENT_URL`).
 */

export const SEO_DEFAULT_DESCRIPTION =
  "Tienda holística: sahumerios, velas, cristales, tarot, estatuas y ropa hindú. Comprá online con envío a todo el país o visitanos en el local.";

const DESCRIPTION_MAX = 155;

export interface SeoMeta {
  title: string;
  description: string;
  /** URL absoluta, sin filtros ni búsqueda: la versión "oficial" de la página. */
  canonical: string;
  /** URL absoluta de la imagen para la vista previa (WhatsApp, Instagram, Facebook). */
  image: string;
  type: "website" | "product";
  jsonLd: Record<string, unknown>[];
}

/** Lo que el SEO necesita de un producto (sirve tanto la vista pública como la del admin). */
export type SeoProduct = Pick<Product, "name" | "slug" | "description" | "brand" | "images"> & {
  variants: Pick<Product["variants"][number], "sku" | "price" | "stock" | "isUniquePiece">[];
};

export type SeoCategory = Pick<Category, "name" | "slug" | "description">;

export function pageTitle(name?: string): string {
  return name ? `${name} | ${BUSINESS.name}` : `${BUSINESS.name} · Tienda holística`;
}

export function absoluteUrl(siteUrl: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${siteUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function catalogPath(categorySlug?: string): string {
  return categorySlug ? `/catalogo?categoria=${encodeURIComponent(categorySlug)}` : "/catalogo";
}

export function productPath(slug: string): string {
  return `/productos/${encodeURIComponent(slug)}`;
}

/** Texto plano de una línea, cortado en una palabra y con "…" si no entra. */
export function metaDescription(text: string | undefined, fallback = SEO_DEFAULT_DESCRIPTION): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  if (clean.length <= DESCRIPTION_MAX) return clean;
  const cut = clean.slice(0, DESCRIPTION_MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:]+$/, "")}…`;
}

/** Precio en el formato de schema.org: pesos con punto decimal ("12500.00"). */
function schemaPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

function storeJsonLd(siteUrl: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    name: BUSINESS.name,
    url: absoluteUrl(siteUrl, "/"),
    image: absoluteUrl(siteUrl, "/logo.png"),
    sameAs: [BUSINESS.instagramUrl],
  };
}

function breadcrumbJsonLd(siteUrl: string, items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(siteUrl, item.path),
    })),
  };
}

function availability(product: SeoProduct): string {
  if (product.variants.some((v) => v.stock > 0)) return "https://schema.org/InStock";
  // Una pieza única vendida no vuelve: "agotada para siempre", no "sin stock por ahora".
  if (product.variants.every((v) => v.isUniquePiece)) return "https://schema.org/SoldOut";
  return "https://schema.org/OutOfStock";
}

export function productJsonLd(siteUrl: string, product: SeoProduct): Record<string, unknown> {
  const url = absoluteUrl(siteUrl, productPath(product.slug));
  const prices = product.variants.map((v) => v.price);
  const offerBase = { priceCurrency: "ARS", availability: availability(product), url };

  const offers =
    product.variants.length === 1
      ? { "@type": "Offer", ...offerBase, price: schemaPrice(prices[0] ?? 0), sku: product.variants[0]?.sku }
      : {
          "@type": "AggregateOffer",
          ...offerBase,
          lowPrice: schemaPrice(Math.min(...prices)),
          highPrice: schemaPrice(Math.max(...prices)),
          offerCount: product.variants.length,
        };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url,
    ...(product.description ? { description: metaDescription(product.description, "") } : {}),
    image: sortedImages(product).map((img) => img.url),
    ...(product.variants.length === 1 && product.variants[0] ? { sku: product.variants[0].sku } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    offers,
  };
}

function sortedImages(product: Pick<SeoProduct, "images">) {
  return [...product.images].sort((a, b) => a.order - b.order);
}

export function homeSeo(siteUrl: string): SeoMeta {
  return {
    title: pageTitle(),
    description: SEO_DEFAULT_DESCRIPTION,
    canonical: absoluteUrl(siteUrl, "/"),
    image: absoluteUrl(siteUrl, "/logo.png"),
    type: "website",
    jsonLd: [storeJsonLd(siteUrl)],
  };
}

export function catalogSeo(siteUrl: string, category?: SeoCategory | null): SeoMeta {
  if (!category) {
    return {
      title: pageTitle("Catálogo"),
      description: SEO_DEFAULT_DESCRIPTION,
      canonical: absoluteUrl(siteUrl, catalogPath()),
      image: absoluteUrl(siteUrl, "/logo.png"),
      type: "website",
      jsonLd: [breadcrumbJsonLd(siteUrl, [{ name: "Inicio", path: "/" }, { name: "Catálogo", path: catalogPath() }])],
    };
  }

  return {
    title: pageTitle(category.name),
    description: metaDescription(
      category.description,
      `${category.name} en ${BUSINESS.name}. Comprá online con envío a todo el país o retiralo en el local.`,
    ),
    canonical: absoluteUrl(siteUrl, catalogPath(category.slug)),
    image: absoluteUrl(siteUrl, "/logo.png"),
    type: "website",
    jsonLd: [
      breadcrumbJsonLd(siteUrl, [
        { name: "Inicio", path: "/" },
        { name: "Catálogo", path: catalogPath() },
        { name: category.name, path: catalogPath(category.slug) },
      ]),
    ],
  };
}

export function productSeo(siteUrl: string, product: SeoProduct, category?: SeoCategory | null): SeoMeta {
  const image = sortedImages(product)[0]?.url;

  const crumbs = [
    { name: "Inicio", path: "/" },
    { name: "Catálogo", path: catalogPath() },
    ...(category ? [{ name: category.name, path: catalogPath(category.slug) }] : []),
    { name: product.name, path: productPath(product.slug) },
  ];

  return {
    title: pageTitle(product.name),
    description: metaDescription(
      product.description,
      `${product.name} en ${BUSINESS.name}. Comprá online con envío a todo el país o retiralo en el local.`,
    ),
    canonical: absoluteUrl(siteUrl, productPath(product.slug)),
    image: image ? absoluteUrl(siteUrl, image) : absoluteUrl(siteUrl, "/logo.png"),
    type: "product",
    jsonLd: [productJsonLd(siteUrl, product), breadcrumbJsonLd(siteUrl, crumbs)],
  };
}

/**
 * JSON-LD listo para ir dentro de `<script type="application/ld+json">`: se escapa `<` para que un
 * texto con "</script>" (una descripción, por ejemplo) no pueda cerrar la etiqueta.
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
