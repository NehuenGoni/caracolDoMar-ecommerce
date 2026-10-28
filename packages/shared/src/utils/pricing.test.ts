import { describe, expect, it } from "vitest";
import { applyMargin, marginFromPrices, netFromGross, roundUpToStep, suggestedPrice } from "./pricing";

describe("applyMargin", () => {
  it("aplica el margen sobre el costo", () => {
    expect(applyMargin(10000, 60)).toBe(16000);
    expect(applyMargin(10000, 0)).toBe(10000);
    expect(applyMargin(3333, 100)).toBe(6666);
  });
});

describe("roundUpToStep", () => {
  it("redondea hacia arriba al múltiplo", () => {
    expect(roundUpToStep(17483, 10000)).toBe(20000);
    expect(roundUpToStep(20000, 10000)).toBe(20000);
    expect(roundUpToStep(1, 100)).toBe(100);
  });

  it("no toca el valor si el paso no es positivo", () => {
    expect(roundUpToStep(1234, 0)).toBe(1234);
    expect(roundUpToStep(1234, -5)).toBe(1234);
  });
});

describe("suggestedPrice", () => {
  it("aplica margen y redondea", () => {
    // costo $1.234 + 100% = $2.468 → redondeado a $2.500 con paso de $100
    expect(suggestedPrice(123400, { marginPercent: 100, roundingStep: 10000 })).toBe(250000);
  });
});

describe("netFromGross", () => {
  it("saca el IVA de un importe final", () => {
    expect(netFromGross(12100, 21)).toBe(10000);
    expect(netFromGross(10500, 10.5)).toBe(9502);
  });
});

describe("marginFromPrices", () => {
  it("es la inversa de applyMargin", () => {
    expect(marginFromPrices(10000, 16000)).toBeCloseTo(60);
    expect(marginFromPrices(10000, 10000)).toBe(0);
  });

  it("devuelve 0 si no hay costo", () => {
    expect(marginFromPrices(0, 5000)).toBe(0);
  });
});
