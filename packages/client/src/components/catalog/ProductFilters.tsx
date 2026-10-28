import { centsToPesos } from "@caracol/shared";
import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { activeFilterCount, SORT_OPTIONS, type CatalogFilters, type SortKey } from "@/lib/catalogFilters";
import type { CatalogFacets } from "@/lib/productsApi";
import { cn } from "@/lib/utils";

interface ProductFiltersProps {
  filters: CatalogFilters;
  facets: CatalogFacets | null;
  onChange: (filters: CatalogFilters) => void;
}

function toNumber(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Orden siempre a la vista; el resto de los filtros se despliega para no recargar el catálogo. */
export function ProductFilters({ filters, facets, onChange }: ProductFiltersProps) {
  const [open, setOpen] = useState(false);
  // Los precios se aplican al terminar de escribir (blur / Enter), no en cada tecla.
  const [min, setMin] = useState(filters.minPrice?.toString() ?? "");
  const [max, setMax] = useState(filters.maxPrice?.toString() ?? "");
  const count = activeFilterCount(filters);

  useEffect(() => {
    setMin(filters.minPrice?.toString() ?? "");
    setMax(filters.maxPrice?.toString() ?? "");
  }, [filters.minPrice, filters.maxPrice]);

  const hasBrands = (facets?.brands.length ?? 0) > 0;
  const hasTags = (facets?.tags.length ?? 0) > 0;

  function applyPrices() {
    const minPrice = toNumber(min);
    const maxPrice = toNumber(max);
    if (minPrice !== filters.minPrice || maxPrice !== filters.maxPrice) {
      onChange({ ...filters, minPrice, maxPrice });
    }
  }

  function toggleTag(tag: string) {
    const tags = filters.tags.includes(tag) ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag];
    onChange({ ...filters, tags });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <SlidersHorizontal className="size-4" /> Filtros{count > 0 ? ` (${count})` : ""}
        </Button>
        <div className="w-full sm:w-52">
          <Select
            aria-label="Ordenar por"
            value={filters.sort ?? "newest"}
            onChange={(e) => onChange({ ...filters, sort: e.target.value as SortKey })}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-text">Precio</legend>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  aria-label="Precio mínimo"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder={facets?.price ? `Desde $${centsToPesos(facets.price.min)}` : "Desde"}
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                  onBlur={applyPrices}
                  onKeyDown={(e) => e.key === "Enter" && applyPrices()}
                />
                <Input
                  aria-label="Precio máximo"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder={facets?.price ? `Hasta $${centsToPesos(facets.price.max)}` : "Hasta"}
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                  onBlur={applyPrices}
                  onKeyDown={(e) => e.key === "Enter" && applyPrices()}
                />
              </div>
            </fieldset>

            {hasBrands && (
              <Select
                label="Marca"
                value={filters.brand ?? ""}
                onChange={(e) => onChange({ ...filters, brand: e.target.value || undefined })}
              >
                <option value="">Todas</option>
                {facets!.brands.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {hasTags && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-text">Para qué lo buscás</legend>
              <div className="flex flex-wrap gap-2">
                {facets!.tags.map((tag) => {
                  const selected = filters.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        "rounded-full border px-3.5 py-1 text-sm transition-colors",
                        selected
                          ? "border-primary bg-primary text-on-primary"
                          : "border-border bg-surface text-text hover:bg-surface-alt",
                      )}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {count > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => onChange({ tags: [], sort: filters.sort })}
            >
              <X className="size-4" /> Limpiar filtros
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
