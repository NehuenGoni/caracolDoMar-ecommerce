import { BUSINESS, serializeJsonLd, type SeoMeta } from "@caracol/shared";
import { useEffect } from "react";

const MANAGED = "data-seo";

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"][${MANAGED}]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, key);
    tag.setAttribute(MANAGED, "");
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function clearManaged() {
  document.head.querySelectorAll(`[${MANAGED}]`).forEach((el) => el.remove());
}

/**
 * Título, descripción, canonical, Open Graph y JSON-LD de la página. Los arma `@caracol/shared`
 * (`productSeo`, `catalogSeo`, `homeSeo`), igual que el HTML que el server les da a los bots.
 * `null` mientras carga: no toca nada. Al salir de la página se limpia todo, así una pantalla sin
 * SEO propio (carrito, cuenta) no hereda el título del producto anterior.
 */
export function useSeo(meta: SeoMeta | null) {
  const key = meta ? JSON.stringify(meta) : null;

  useEffect(() => {
    if (!meta) return;
    clearManaged();
    document.title = meta.title;

    setMeta("name", "description", meta.description);
    setMeta("property", "og:type", meta.type);
    setMeta("property", "og:site_name", BUSINESS.name);
    setMeta("property", "og:locale", "es_AR");
    setMeta("property", "og:title", meta.title);
    setMeta("property", "og:description", meta.description);
    setMeta("property", "og:url", meta.canonical);
    setMeta("property", "og:image", meta.image);
    setMeta("name", "twitter:card", "summary_large_image");

    const canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.href = meta.canonical;
    canonical.setAttribute(MANAGED, "");
    document.head.appendChild(canonical);

    for (const data of meta.jsonLd) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.text = serializeJsonLd(data);
      script.setAttribute(MANAGED, "");
      document.head.appendChild(script);
    }

    return () => {
      clearManaged();
      document.title = BUSINESS.name;
    };
    // `key` resume `meta`: un objeto nuevo con el mismo contenido no vuelve a tocar el <head>.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** La URL pública de la tienda (la misma que `CLIENT_URL` en el server). */
export function siteUrl(): string {
  return window.location.origin;
}
