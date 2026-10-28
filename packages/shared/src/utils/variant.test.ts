import { describe, expect, it } from "vitest";
import { formatVariantLabel, withVariantLabel } from "./variant.js";

describe("formatVariantLabel", () => {
  it("une los valores de los atributos", () => {
    expect(
      formatVariantLabel([
        { name: "Color", value: "Rojo" },
        { name: "Talle", value: "M" },
      ]),
    ).toBe("Rojo / M");
  });

  it("devuelve vacío sin atributos", () => {
    expect(formatVariantLabel([])).toBe("");
    expect(formatVariantLabel(undefined)).toBe("");
  });

  it("ignora valores en blanco", () => {
    expect(formatVariantLabel([{ name: "Color", value: "  " }, { name: "Talle", value: "S" }])).toBe("S");
  });
});

describe("withVariantLabel", () => {
  it("agrega la variante solo si existe", () => {
    expect(withVariantLabel("Remera", "Rojo / M")).toBe("Remera - Rojo / M");
    expect(withVariantLabel("Vela", "")).toBe("Vela");
  });
});
