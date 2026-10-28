import { describe, expect, it } from "vitest";
import { centsToPesos, formatMoney, parseArsAmount, percentageOfCents, pesosToCents, sumCents } from "./money.js";

const NBSP = " ";

describe("formatMoney", () => {
  it("formatea centavos como pesos argentinos con símbolo", () => {
    expect(formatMoney(123456)).toBe(`$${NBSP}1.234,56`);
  });

  it("formatea sin símbolo cuando se pide", () => {
    expect(formatMoney(123456, { withSymbol: false })).toBe("1.234,56");
  });

  it("maneja cero", () => {
    expect(formatMoney(0)).toBe(`$${NBSP}0,00`);
  });

  it("maneja montos negativos", () => {
    expect(formatMoney(-500)).toBe(`-$${NBSP}5,00`);
  });
});

describe("pesosToCents", () => {
  it("convierte pesos con decimales a centavos enteros", () => {
    expect(pesosToCents(10.5)).toBe(1050);
  });

  it("redondea flotantes imprecisos", () => {
    expect(pesosToCents(19.99)).toBe(1999);
  });
});

describe("centsToPesos", () => {
  it("convierte centavos a pesos", () => {
    expect(centsToPesos(1050)).toBe(10.5);
  });
});

describe("sumCents", () => {
  it("suma múltiples montos en centavos", () => {
    expect(sumCents(100, 200, 300)).toBe(600);
  });

  it("redondea cada término antes de sumar", () => {
    expect(sumCents(100.4, 200.4)).toBe(300);
  });
});

describe("percentageOfCents", () => {
  it("calcula un porcentaje y redondea al centavo", () => {
    expect(percentageOfCents(10000, 21)).toBe(2100);
  });

  it("redondea correctamente casos no exactos", () => {
    expect(percentageOfCents(999, 10)).toBe(100);
  });
});

describe("parseArsAmount", () => {
  it("parsea formato argentino con miles y decimales", () => {
    expect(parseArsAmount("1.234,56")).toBe(123456);
  });

  it("ignora el símbolo de moneda y espacios", () => {
    expect(parseArsAmount("$ 1.234,56")).toBe(123456);
  });

  it("acepta formato estadounidense como respaldo", () => {
    expect(parseArsAmount("1,234.56")).toBe(123456);
  });

  it("interpreta un único separador con 3 dígitos detrás como separador de miles", () => {
    expect(parseArsAmount("1.234")).toBe(123400);
    expect(parseArsAmount("1,234")).toBe(123400);
  });

  it("interpreta un único separador con menos de 3 dígitos como decimal", () => {
    expect(parseArsAmount("12.5")).toBe(1250);
    expect(parseArsAmount("12,50")).toBe(1250);
  });

  it("interpreta varias apariciones del mismo separador como miles", () => {
    expect(parseArsAmount("1.234.567,89")).toBe(123456789);
    expect(parseArsAmount("1.234.567")).toBe(123456700);
  });

  it("parsea un entero sin separadores", () => {
    expect(parseArsAmount("500")).toBe(50000);
  });

  it("devuelve null si no hay un número reconocible", () => {
    expect(parseArsAmount("")).toBeNull();
    expect(parseArsAmount("—")).toBeNull();
    expect(parseArsAmount("N/A")).toBeNull();
  });
});
