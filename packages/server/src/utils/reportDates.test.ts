import { describe, expect, it } from "vitest";
import { bucketKey, dayKey, isValidDayKey, listBuckets, MAX_RANGE_DAYS, resolveRange } from "./reportDates.js";

describe("dayKey (día de Argentina)", () => {
  it("una venta a las 23:30 en Argentina cuenta ese día aunque en UTC ya sea el siguiente", () => {
    // 23:30 del 15 en Buenos Aires = 02:30 del 16 en UTC
    expect(dayKey(new Date("2026-10-16T02:30:00.000Z"))).toBe("2026-10-15");
  });

  it("a las 00:30 en Argentina ya es el día siguiente", () => {
    expect(dayKey(new Date("2026-10-16T03:30:00.000Z"))).toBe("2026-10-16");
  });

  it("el límite exacto de la medianoche argentina", () => {
    expect(dayKey(new Date("2026-10-16T02:59:59.999Z"))).toBe("2026-10-15");
    expect(dayKey(new Date("2026-10-16T03:00:00.000Z"))).toBe("2026-10-16");
  });
});

describe("isValidDayKey", () => {
  it("acepta fechas reales y rechaza el resto", () => {
    expect(isValidDayKey("2026-02-28")).toBe(true);
    expect(isValidDayKey("2028-02-29")).toBe(true);
    expect(isValidDayKey("2026-02-30")).toBe(false);
    expect(isValidDayKey("2026-13-01")).toBe(false);
    expect(isValidDayKey("26-10-01")).toBe(false);
    expect(isValidDayKey("hoy")).toBe(false);
  });
});

describe("resolveRange", () => {
  const now = new Date("2026-10-29T15:00:00.000Z");

  it("por defecto va del primer día del mes hasta hoy", () => {
    const range = resolveRange(undefined, undefined, now);
    expect(range.fromKey).toBe("2026-10-01");
    expect(range.toKey).toBe("2026-10-29");
  });

  it("incluye el día entero de Argentina en ambos extremos", () => {
    const range = resolveRange("2026-10-10", "2026-10-12", now);
    expect(range.start.toISOString()).toBe("2026-10-10T03:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-13T02:59:59.999Z");
  });

  it("si solo se manda 'hasta', arranca el primer día de ese mes", () => {
    expect(resolveRange(undefined, "2026-09-15", now).fromKey).toBe("2026-09-01");
  });

  it("acepta un solo día", () => {
    const range = resolveRange("2026-10-05", "2026-10-05", now);
    expect(range.end.getTime() - range.start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it("rechaza fechas inválidas, invertidas o demasiado largas", () => {
    expect(() => resolveRange("2026-02-30", "2026-03-01", now)).toThrow("AAAA-MM-DD");
    expect(() => resolveRange("hoy", undefined, now)).toThrow("AAAA-MM-DD");
    expect(() => resolveRange("2026-10-20", "2026-10-10", now)).toThrow("posterior");
    expect(() => resolveRange("2024-01-01", "2026-01-01", now)).toThrow(String(MAX_RANGE_DAYS));
  });

  it("un año entero es el máximo permitido", () => {
    expect(() => resolveRange("2026-01-01", "2026-12-31", now)).not.toThrow();
  });
});

describe("bucketKey", () => {
  it("por día es el mismo día; por mes, el mes", () => {
    expect(bucketKey("2026-10-14", "day")).toBe("2026-10-14");
    expect(bucketKey("2026-10-14", "month")).toBe("2026-10");
  });

  it("por semana es el lunes de esa semana (lunes a domingo)", () => {
    // 2026-10-14 es miércoles → lunes 12
    expect(bucketKey("2026-10-14", "week")).toBe("2026-10-12");
    expect(bucketKey("2026-10-12", "week")).toBe("2026-10-12"); // lunes
    expect(bucketKey("2026-10-18", "week")).toBe("2026-10-12"); // domingo cierra la semana
    expect(bucketKey("2026-10-19", "week")).toBe("2026-10-19");
  });

  it("una semana puede arrancar en el mes anterior", () => {
    // miércoles 1/oct/2026 → lunes 29/sep
    expect(bucketKey("2026-10-01", "week")).toBe("2026-09-28");
  });
});

describe("listBuckets", () => {
  it("lista todos los días, también los sin ventas", () => {
    expect(listBuckets("2026-10-01", "2026-10-04", "day")).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("agrupa por semana sin repetir", () => {
    expect(listBuckets("2026-10-12", "2026-10-26", "week")).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
  });

  it("agrupa por mes cruzando el cambio de año", () => {
    expect(listBuckets("2026-11-15", "2027-01-10", "month")).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});
