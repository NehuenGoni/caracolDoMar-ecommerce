import {
  BUSINESS,
  absoluteUrl,
  catalogPath,
  catalogSeo,
  formatMoney,
  homeSeo,
  productPath,
  productSeo,
  serializeJsonLd,
  type SeoMeta,
} from "@caracol/shared";
import { env } from "../config/env.js";
import { Category } from "../models/Category.js";
import { Product } from "../models/Product.js";
import { escapeHtml } from "../utils/html.js";
import { listPublicProducts, listSitemapProducts } from "./productService.js";

/**
 * SEO del lado del server. La tienda es una SPA: Google ejecuta JavaScript, pero WhatsApp, Instagram
 * y Facebook no. Para ellos (y para que Google lo tenga fácil) el middleware de Vercel pide acá un
 * HTML chico con los meta, el JSON-LD y el contenido básico de la página.
 */

const siteUrl = () => env.CLIENT_URL;

/** Rutas que no tienen nada que indexar (y en algunos casos son datos de un cliente). */
const PRIVATE_PATHS = [
  "/admin",
  "/cuenta",
  "/carrito",
  "/checkout",
  "/order-confirmation",
  "/login",
  "/registro",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
];

export function buildRobotsTxt(): string {
  return [
    "User-agent: *",
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${absoluteUrl(siteUrl(), "/sitemap.xml")}`,
    "",
  ].join("\n");
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sitemapEntry(loc: string, lastmod?: Date): string {
  const lastmodTag = lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : "";
  return `  <url><loc>${xmlEscape(loc)}</loc>${lastmodTag}</url>`;
}

export async function buildSitemapXml(): Promise<string> {
  const [categories, products] = await Promise.all([
    Category.find({ isActive: true }, { slug: 1, updatedAt: 1 }).lean<{ slug: string; updatedAt: Date }[]>(),
    listSitemapProducts(),
  ]);
  const site = siteUrl();

  const entries = [
    sitemapEntry(absoluteUrl(site, "/")),
    sitemapEntry(absoluteUrl(site, catalogPath())),
    ...categories.map((c) => sitemapEntry(absoluteUrl(site, catalogPath(c.slug)), c.updatedAt)),
    ...products.map((p) => sitemapEntry(absoluteUrl(site, productPath(p.slug)), p.updatedAt)),
    ...["/contacto", "/terminos-y-condiciones", "/cambios-y-devoluciones", "/politica-de-privacidad"].map((path) =>
      sitemapEntry(absoluteUrl(site, path)),
    ),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}

interface PageBody {
  heading: string;
  image?: string;
  paragraphs: string[];
  links: { label: string; href: string }[];
}

export interface RenderedPage {
  status: 200 | 404;
  html: string;
}

function renderHtml(meta: SeoMeta, body: PageBody, extraMeta: [string, string][] = []): string {
  const tag = (property: string, content: string) =>
    `<meta property="${property}" content="${escapeHtml(content)}">`;

  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}">`,
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}">`,
    tag("og:type", meta.type),
    tag("og:site_name", BUSINESS.name),
    tag("og:locale", "es_AR"),
    tag("og:title", meta.title),
    tag("og:description", meta.description),
    tag("og:url", meta.canonical),
    tag("og:image", meta.image),
    ...extraMeta.map(([property, content]) => tag(property, content)),
    `<meta name="twitter:card" content="summary_large_image">`,
    ...meta.jsonLd.map((data) => `<script type="application/ld+json">${serializeJsonLd(data)}</script>`),
  ];

  const main = [
    `<h1>${escapeHtml(body.heading)}</h1>`,
    body.image ? `<img src="${escapeHtml(body.image)}" alt="${escapeHtml(body.heading)}">` : "",
    ...body.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    body.links.length > 0
      ? `<ul>${body.links.map((l) => `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a></li>`).join("")}</ul>`
      : "",
  ];

  return `<!doctype html>\n<html lang="es-AR">\n<head>\n${head.join("\n")}\n</head>\n<body>\n<main>\n${main.filter(Boolean).join("\n")}\n</main>\n</body>\n</html>\n`;
}

async function categoryLinks(): Promise<PageBody["links"]> {
  const categories = await Category.find({ isActive: true }).sort({ order: 1, name: 1 }).lean();
  return categories.map((c) => ({ label: c.name, href: absoluteUrl(siteUrl(), catalogPath(c.slug)) }));
}

async function productLinks(query: { category?: string; isFeatured?: boolean }): Promise<PageBody["links"]> {
  const { items } = await listPublicProducts({ page: 1, limit: 48, ...query }, false);
  return items.map((p) => ({ label: p.name, href: absoluteUrl(siteUrl(), productPath(p.slug)) }));
}

async function renderHome(): Promise<RenderedPage> {
  const meta = homeSeo(siteUrl());
  const [categories, featured] = await Promise.all([categoryLinks(), productLinks({ isFeatured: true })]);
  return {
    status: 200,
    html: renderHtml(meta, {
      heading: BUSINESS.name,
      paragraphs: [meta.description],
      links: [...categories, ...featured],
    }),
  };
}

async function renderCatalog(categorySlug: string | null): Promise<RenderedPage> {
  const category = categorySlug ? await Category.findOne({ slug: categorySlug, isActive: true }).lean() : null;
  if (categorySlug && !category) return renderNotFound();

  const meta = catalogSeo(siteUrl(), category);
  const links = category ? await productLinks({ category: category._id.toString() }) : await categoryLinks();
  return {
    status: 200,
    html: renderHtml(meta, {
      heading: category?.name ?? "Catálogo",
      image: category?.image,
      paragraphs: [meta.description],
      links,
    }),
  };
}

async function renderProduct(slug: string): Promise<RenderedPage> {
  const product = await Product.findOne({ slug, isActive: true }).lean();
  if (!product) return renderNotFound();
  const category = await Category.findOne({ _id: product.category, isActive: true }).lean();

  const meta = productSeo(siteUrl(), product, category);
  const prices = product.variants.map((v) => v.price);
  const minPrice = Math.min(...prices);
  const priceText = prices.length > 1 && Math.max(...prices) > minPrice ? `Desde ${formatMoney(minPrice)}` : formatMoney(minPrice);
  const inStock = product.variants.some((v) => v.stock > 0);

  return {
    status: 200,
    html: renderHtml(
      meta,
      {
        heading: product.name,
        image: meta.image,
        paragraphs: [priceText, inStock ? "Disponible" : "Sin stock", ...(product.description ? [product.description] : [])],
        links: category ? [{ label: category.name, href: absoluteUrl(siteUrl(), catalogPath(category.slug)) }] : [],
      },
      [
        ["product:price:amount", (minPrice / 100).toFixed(2)],
        ["product:price:currency", "ARS"],
      ],
    ),
  };
}

function renderNotFound(): RenderedPage {
  const meta = { ...homeSeo(siteUrl()), title: `Página no encontrada | ${BUSINESS.name}`, jsonLd: [] };
  return {
    status: 404,
    html: renderHtml(meta, { heading: "No encontramos esta página", paragraphs: [], links: [] }),
  };
}

/** `path` es la ruta pública tal cual la pidió el bot, con su query (`/catalogo?categoria=velas`). */
export async function renderPublicPage(path: string): Promise<RenderedPage> {
  const url = new URL(path, "http://tienda.local");
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/") return renderHome();
  if (pathname === "/catalogo") return renderCatalog(url.searchParams.get("categoria"));

  const product = /^\/productos\/([^/]+)$/.exec(pathname);
  if (product?.[1]) {
    try {
      return await renderProduct(decodeURIComponent(product[1]));
    } catch (err) {
      if (err instanceof URIError) return renderNotFound();
      throw err;
    }
  }

  return renderNotFound();
}
