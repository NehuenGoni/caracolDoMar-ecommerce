import { describe, expect, it } from "vitest";
import { attributeOptions, isValueAvailable, pickVariant } from "./variantSelection";

function v(sku: string, color: string, talle: string, stock = 1) {
  return {
    sku,
    stock,
    attributes: [
      { name: "Color", value: color },
      { name: "Talle", value: talle },
    ],
  };
}

const variants = [
  v("R-S", "Rojo", "S"),
  v("R-M", "Rojo", "M"),
  v("A-S", "Azul", "S"),
  v("A-M", "Azul", "M", 0), // azul M agotado
];

describe("attributeOptions", () => {
  it("agrupa los valores por atributo sin repetir", () => {
    expect(attributeOptions(variants)).toEqual([
      { name: "Color", values: ["Rojo", "Azul"] },
      { name: "Talle", values: ["S", "M"] },
    ]);
  });

  it("devuelve vacío si las variantes no tienen atributos", () => {
    expect(attributeOptions([{ sku: "X", stock: 1, attributes: [] }])).toEqual([]);
  });
});

describe("pickVariant", () => {
  it("mantiene el resto de la selección al cambiar un atributo", () => {
    const current = variants[1]!; // Rojo / M
    expect(pickVariant(variants, current, "Color", "Azul").sku).not.toBe("A-M"); // A-M está agotada
    expect(pickVariant(variants, variants[0]!, "Color", "Azul").sku).toBe("A-S");
  });

  it("si la combinación está agotada, cae a una variante con stock que tenga ese valor", () => {
    // Rojo / M → elegir Azul: Azul / M no tiene stock, así que va a Azul / S
    expect(pickVariant(variants, variants[1]!, "Color", "Azul").sku).toBe("A-S");
  });

  it("devuelve la actual si el valor no existe", () => {
    expect(pickVariant(variants, variants[0]!, "Color", "Verde")).toBe(variants[0]);
  });
});

describe("isValueAvailable", () => {
  it("marca como no disponible el valor que solo existe agotado con la selección actual", () => {
    const current = variants[1]!; // Rojo / M
    expect(isValueAvailable(variants, current, "Color", "Rojo")).toBe(true);
    expect(isValueAvailable(variants, current, "Color", "Azul")).toBe(false); // Azul / M agotado
    expect(isValueAvailable(variants, current, "Talle", "S")).toBe(true); // Rojo / S
  });
});
