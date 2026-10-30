import { catalogSeo, homeSeo } from "@caracol/shared";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useSeo } from "./useSeo";

const SITE = "https://tienda.test";

afterEach(() => {
  document.head.innerHTML = "";
});

describe("useSeo", () => {
  it("escribe título, descripción, canonical, Open Graph y JSON-LD", () => {
    renderHook(() => useSeo(catalogSeo(SITE, { name: "Velas", slug: "velas" })));

    expect(document.title).toBe("Velas | Caracol do Mar");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toContain("Velas");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      `${SITE}/catalogo?categoria=velas`,
    );
    expect(document.head.querySelector('meta[property="og:title"]')?.getAttribute("content")).toBe(
      "Velas | Caracol do Mar",
    );
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
  });

  it("al cambiar de página reemplaza las etiquetas en vez de duplicarlas", () => {
    const { rerender } = renderHook(({ meta }) => useSeo(meta), { initialProps: { meta: homeSeo(SITE) } });
    rerender({ meta: catalogSeo(SITE) });

    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.title).toBe("Catálogo | Caracol do Mar");
  });

  it("al salir limpia todo y vuelve al título de la tienda", () => {
    const { unmount } = renderHook(() => useSeo(homeSeo(SITE)));
    unmount();
    expect(document.head.querySelector("[data-seo]")).toBeNull();
    expect(document.title).toBe("Caracol do Mar");
  });

  it("con null (cargando) no toca nada", () => {
    document.title = "Anterior";
    renderHook(() => useSeo(null));
    expect(document.title).toBe("Anterior");
  });
});
