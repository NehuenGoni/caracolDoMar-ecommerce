import { describe, expect, it } from "vitest";
import { marginFromPrice, percentChange, priceFromMargin } from "./invoiceLinePricing";

describe("priceFromMargin", () => {
  it("aplica el margen y redondea hacia arriba al paso", () => {
    // $1.234 + 100% = $2.468 → $2.500 con paso de $100
    expect(priceFromMargin(123400, 100, 10000)).toBe(250000);
    expect(priceFromMargin(60000, 100, 10000)).toBe(120000);
  });

  it("con margen 0 devuelve el costo redondeado", () => {
    expect(priceFromMargin(60000, 0, 10000)).toBe(60000);
    expect(priceFromMargin(60050, 0, 10000)).toBe(70000);
  });
});

describe("marginFromPrice", () => {
  it("es el margen implícito de un precio puesto a mano", () => {
    expect(marginFromPrice(10000, 16000)).toBe(60);
    expect(marginFromPrice(10000, 10000)).toBe(0);
    expect(marginFromPrice(10000, 8000)).toBe(-20);
  });

  it("sin costo no hay margen que calcular", () => {
    expect(marginFromPrice(0, 5000)).toBe(0);
  });
});

describe("percentChange", () => {
  it("compara contra el valor anterior", () => {
    expect(percentChange(60000, 50000)).toBe(20);
    expect(percentChange(40000, 50000)).toBe(-20);
    expect(percentChange(50000, 50000)).toBe(0);
  });

  it("devuelve null si no hay valor anterior o es cero", () => {
    expect(percentChange(60000, null)).toBeNull();
    expect(percentChange(60000, 0)).toBeNull();
  });
});
