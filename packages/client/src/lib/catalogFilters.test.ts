import { describe, expect, it } from "vitest";
import { activeFilterCount, filtersFromParams, filtersToApi, filtersToParams } from "./catalogFilters";

describe("filtersFromParams", () => {
  it("lee marca, tags, precios (en pesos) y orden de la URL", () => {
    const filters = filtersFromParams(
      new URLSearchParams("marca=Goloka&tags=limpieza,amor&min=1500&max=9000&orden=price_asc"),
    );
    expect(filters).toEqual({
      brand: "Goloka",
      tags: ["limpieza", "amor"],
      minPrice: 1500,
      maxPrice: 9000,
      sort: "price_asc",
    });
  });

  it("ignora valores inválidos", () => {
    const filters = filtersFromParams(new URLSearchParams("min=abc&max=-5&orden=al_azar&tags=,,"));
    expect(filters).toEqual({
      brand: undefined,
      tags: [],
      minPrice: undefined,
      maxPrice: undefined,
      sort: undefined,
    });
  });

  it("acepta 0 como precio mínimo", () => {
    expect(filtersFromParams(new URLSearchParams("min=0")).minPrice).toBe(0);
  });
});

describe("filtersToParams", () => {
  it("es la inversa de filtersFromParams (salvo el orden por defecto)", () => {
    const params = new URLSearchParams(
      Object.entries(
        filtersToParams({ brand: "Goloka", tags: ["a", "b"], minPrice: 100, maxPrice: 200, sort: "name" }),
      ).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    expect(filtersFromParams(params)).toEqual({
      brand: "Goloka",
      tags: ["a", "b"],
      minPrice: 100,
      maxPrice: 200,
      sort: "name",
    });
  });

  it("deja en undefined lo vacío y el orden 'más nuevos' (que es el de siempre)", () => {
    expect(filtersToParams({ tags: [], sort: "newest" })).toEqual({
      marca: undefined,
      tags: undefined,
      min: undefined,
      max: undefined,
      orden: undefined,
    });
  });
});

describe("filtersToApi", () => {
  it("convierte los precios de pesos a centavos y los tags a lista separada por comas", () => {
    expect(filtersToApi({ brand: "X", tags: ["a", "b"], minPrice: 1500.5, maxPrice: 3000, sort: "price_desc" })).toEqual({
      brand: "X",
      tags: "a,b",
      minPrice: 150050,
      maxPrice: 300000,
      sort: "price_desc",
    });
  });
});

describe("activeFilterCount", () => {
  it("cuenta marca, tags y cada extremo de precio; no el orden", () => {
    expect(activeFilterCount({ tags: [] , sort: "price_asc" })).toBe(0);
    expect(activeFilterCount({ brand: "X", tags: ["a", "b"], minPrice: 0, maxPrice: 10 })).toBe(5);
  });
});
