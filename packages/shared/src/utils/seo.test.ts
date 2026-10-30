import { describe, expect, it } from "vitest";
import {
  absoluteUrl,
  catalogSeo,
  homeSeo,
  metaDescription,
  productSeo,
  serializeJsonLd,
  type SeoProduct,
} from "./seo.js";

const SITE = "https://caracoldomar.com.ar";

function product(overrides: Partial<SeoProduct> = {}): SeoProduct {
  return {
    name: "Sahumerio de sándalo",
    slug: "sahumerio-de-sandalo",
    description: "Caja de 20 varitas, aroma suave.",
    images: [
      { url: "https://res.cloudinary.com/x/2.jpg", source: "cloudinary", order: 1 },
      { url: "https://res.cloudinary.com/x/1.jpg", source: "cloudinary", order: 0 },
    ],
    variants: [{ sku: "SAH-1", price: 250000, stock: 3 }],
    ...overrides,
  };
}

describe("absoluteUrl", () => {
  it("une la URL del sitio con la ruta sin duplicar barras", () => {
    expect(absoluteUrl(`${SITE}/`, "/catalogo")).toBe(`${SITE}/catalogo`);
    expect(absoluteUrl(SITE, "catalogo")).toBe(`${SITE}/catalogo`);
  });

  it("deja tal cual una URL que ya es absoluta", () => {
    expect(absoluteUrl(SITE, "https://res.cloudinary.com/a.jpg")).toBe("https://res.cloudinary.com/a.jpg");
  });
});

describe("metaDescription", () => {
  it("usa el texto por defecto si no hay descripción", () => {
    expect(metaDescription("   ", "Por defecto")).toBe("Por defecto");
  });

  it("junta los saltos de línea y corta los textos largos en una palabra", () => {
    const long = `Primera línea.\n\n${"palabra ".repeat(40)}`;
    const result = metaDescription(long);
    expect(result).not.toContain("\n");
    expect(result.length).toBeLessThanOrEqual(155);
    expect(result.endsWith("palabra…")).toBe(true);
  });
});

describe("productSeo", () => {
  it("arma título, canonical y la primera imagen por orden", () => {
    const seo = productSeo(SITE, product(), { name: "Sahumerios", slug: "sahumerios" });
    expect(seo.title).toBe("Sahumerio de sándalo | Caracol do Mar");
    expect(seo.canonical).toBe(`${SITE}/productos/sahumerio-de-sandalo`);
    expect(seo.image).toBe("https://res.cloudinary.com/x/1.jpg");
    expect(seo.type).toBe("product");
  });

  it("una sola variante es una oferta con precio en pesos y SKU", () => {
    const [ld] = productSeo(SITE, product()).jsonLd;
    expect(ld?.offers).toMatchObject({
      "@type": "Offer",
      price: "2500.00",
      priceCurrency: "ARS",
      sku: "SAH-1",
      availability: "https://schema.org/InStock",
    });
  });

  it("varias variantes son una oferta agregada con el rango de precios", () => {
    const [ld] = productSeo(
      SITE,
      product({
        variants: [
          { sku: "A", price: 100000, stock: 0 },
          { sku: "B", price: 300000, stock: 0 },
        ],
      }),
    ).jsonLd;
    expect(ld?.offers).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "1000.00",
      highPrice: "3000.00",
      offerCount: 2,
      availability: "https://schema.org/OutOfStock",
    });
  });

  it("una pieza única vendida figura como agotada para siempre", () => {
    const [ld] = productSeo(SITE, product({ variants: [{ sku: "U", price: 1, stock: 0, isUniquePiece: true }] })).jsonLd;
    expect(ld?.offers).toMatchObject({ availability: "https://schema.org/SoldOut" });
  });

  it("el breadcrumb pasa por la categoría cuando se conoce", () => {
    const crumbs = productSeo(SITE, product(), { name: "Sahumerios", slug: "sahumerios" }).jsonLd[1];
    const names = (crumbs?.itemListElement as { name: string }[]).map((c) => c.name);
    expect(names).toEqual(["Inicio", "Catálogo", "Sahumerios", "Sahumerio de sándalo"]);
  });

  it("sin imágenes usa el logo de la tienda", () => {
    expect(productSeo(SITE, product({ images: [] })).image).toBe(`${SITE}/logo.png`);
  });
});

describe("catalogSeo y homeSeo", () => {
  it("la categoría tiene su propia URL canónica", () => {
    const seo = catalogSeo(SITE, { name: "Velas", slug: "velas" });
    expect(seo.title).toBe("Velas | Caracol do Mar");
    expect(seo.canonical).toBe(`${SITE}/catalogo?categoria=velas`);
    expect(seo.description).toContain("Velas");
  });

  it("el inicio describe la tienda", () => {
    const seo = homeSeo(SITE);
    expect(seo.canonical).toBe(`${SITE}/`);
    expect(seo.jsonLd[0]).toMatchObject({ "@type": "Store", name: "Caracol do Mar" });
  });
});

describe("serializeJsonLd", () => {
  it("no deja cerrar la etiqueta script desde un texto", () => {
    const out = serializeJsonLd({ description: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out)).toEqual({ description: "</script><script>alert(1)</script>" });
  });
});
