import { describe, expect, it } from "vitest";
import {
  deltaPercent,
  formatCompactPesos,
  labelEvery,
  longPeriodLabel,
  niceScale,
  shortPeriodLabel,
} from "./chartScale";

describe("niceScale", () => {
  it("redondea el tope hacia arriba a un número limpio y arma las marcas desde 0", () => {
    expect(niceScale(87)).toEqual({ max: 100, ticks: [0, 25, 50, 75, 100] });
    expect(niceScale(1200)).toEqual({ max: 1500, ticks: [0, 500, 1000, 1500] });
    expect(niceScale(10)).toEqual({ max: 10, ticks: [0, 2.5, 5, 7.5, 10] });
  });

  it("siempre cubre el máximo de los datos", () => {
    for (const value of [1, 7, 99, 101, 4_321, 56_789, 1_234_567]) {
      expect(niceScale(value).max).toBeGreaterThanOrEqual(value);
    }
  });

  it("sin datos devuelve una escala válida", () => {
    expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] });
    expect(niceScale(-5).max).toBe(1);
  });

  it("no genera más marcas de las necesarias", () => {
    expect(niceScale(5_000_000).ticks.length).toBeLessThanOrEqual(7);
  });
});

describe("formatCompactPesos", () => {
  it("achica de a miles y millones, recibiendo centavos", () => {
    expect(formatCompactPesos(0)).toBe("$0");
    expect(formatCompactPesos(90_000)).toBe("$900");
    expect(formatCompactPesos(100_000)).toBe("$1 mil");
    expect(formatCompactPesos(250_000)).toBe("$2,5 mil");
    expect(formatCompactPesos(125_000_000)).toBe("$1,3 M");
  });

  it("mantiene el signo", () => {
    expect(formatCompactPesos(-250_000)).toBe("-$2,5 mil");
  });
});

describe("etiquetas de período", () => {
  it("cortas para el eje", () => {
    expect(shortPeriodLabel("2026-10-05", "day")).toBe("5 oct");
    expect(shortPeriodLabel("2026-10-05", "week")).toBe("5 oct");
    expect(shortPeriodLabel("2026-10", "month")).toBe("oct 26");
  });

  it("largas para el tooltip", () => {
    expect(longPeriodLabel("2026-10-05", "day")).toBe("lunes 5 de octubre");
    expect(longPeriodLabel("2026-10", "month")).toBe("octubre de 2026");
  });

  it("la semana nombra sus dos extremos, también si cruza de mes", () => {
    expect(longPeriodLabel("2026-10-12", "week")).toBe("Semana del 12 al 18 de oct");
    expect(longPeriodLabel("2026-09-28", "week")).toBe("Semana del 28 de sep al 4 de oct");
  });
});

describe("labelEvery", () => {
  it("cuando las columnas son angostas se saltean etiquetas", () => {
    expect(labelEvery(60)).toBe(1);
    expect(labelEvery(12)).toBe(4);
    expect(labelEvery(0)).toBe(48);
  });
});

describe("deltaPercent", () => {
  it("compara contra el período anterior", () => {
    expect(deltaPercent(120, 100)).toBe(20);
    expect(deltaPercent(50, 100)).toBe(-50);
    expect(deltaPercent(100, 100)).toBe(0);
  });

  it("sin período anterior con ventas no hay variación que mostrar", () => {
    expect(deltaPercent(100, 0)).toBeNull();
  });
});
