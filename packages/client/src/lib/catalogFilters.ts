import { pesosToCents } from "@caracol/shared";

export const SORT_OPTIONS = [
  { value: "newest", label: "Más nuevos" },
  { value: "price_asc", label: "Menor precio" },
  { value: "price_desc", label: "Mayor precio" },
  { value: "name", label: "Nombre (A-Z)" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

/** Filtros del catálogo tal como se muestran: precios en pesos (la API los quiere en centavos). */
export interface CatalogFilters {
  brand?: string;
  tags: string[];
  minPrice?: number;
  maxPrice?: number;
  sort?: SortKey;
}

const SORT_VALUES = new Set<string>(SORT_OPTIONS.map((o) => o.value));

function parsePesos(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Los filtros viven en la URL (se pueden compartir y el botón "atrás" funciona). */
export function filtersFromParams(params: URLSearchParams): CatalogFilters {
  const sort = params.get("orden");
  return {
    brand: params.get("marca") || undefined,
    tags: (params.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    minPrice: parsePesos(params.get("min")),
    maxPrice: parsePesos(params.get("max")),
    sort: sort && SORT_VALUES.has(sort) ? (sort as SortKey) : undefined,
  };
}

/** Los params de URL que representan estos filtros (los vacíos van como `undefined`, para quitarlos). */
export function filtersToParams(filters: CatalogFilters): Record<string, string | undefined> {
  return {
    marca: filters.brand,
    tags: filters.tags.length ? filters.tags.join(",") : undefined,
    min: filters.minPrice !== undefined ? String(filters.minPrice) : undefined,
    max: filters.maxPrice !== undefined ? String(filters.maxPrice) : undefined,
    orden: filters.sort && filters.sort !== "newest" ? filters.sort : undefined,
  };
}

export function filtersToApi(filters: CatalogFilters) {
  return {
    brand: filters.brand,
    tags: filters.tags.length ? filters.tags.join(",") : undefined,
    minPrice: filters.minPrice !== undefined ? pesosToCents(filters.minPrice) : undefined,
    maxPrice: filters.maxPrice !== undefined ? pesosToCents(filters.maxPrice) : undefined,
    sort: filters.sort,
  };
}

/** Cuántos filtros hay activos (el orden no cuenta: no saca productos). */
export function activeFilterCount(filters: CatalogFilters): number {
  return (
    (filters.brand ? 1 : 0) +
    filters.tags.length +
    (filters.minPrice !== undefined ? 1 : 0) +
    (filters.maxPrice !== undefined ? 1 : 0)
  );
}

