import { useEffect, useState } from "react";
import { getCatalogFacets, type CatalogFacets } from "@/lib/productsApi";

/** Marcas, tags y rango de precios de lo que hoy se vende, para armar los filtros. */
export function useCatalogFacets() {
  const [facets, setFacets] = useState<CatalogFacets | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCatalogFacets()
      .then((result) => {
        if (!cancelled) setFacets(result);
      })
      // Los filtros son un extra: si fallan, el catálogo se sigue pudiendo recorrer.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return facets;
}
