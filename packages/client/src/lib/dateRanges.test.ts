import { describe, expect, it } from "vitest";
import { addDays, daysInRange, matchPreset, presetRange, previousRange, todayKey } from "./dateRanges";

describe("todayKey", () => {
  it("es el día de Argentina, no el de UTC", () => {
    // 23:30 en Buenos Aires = 02:30 del día siguiente en UTC
    expect(todayKey(new Date("2026-10-16T02:30:00.000Z"))).toBe("2026-10-15");
    expect(todayKey(new Date("2026-10-16T03:00:00.000Z"))).toBe("2026-10-16");
  });
});

describe("addDays / daysInRange", () => {
  it("suma y resta días cruzando meses y años", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("cuenta los dos extremos", () => {
    expect(daysInRange("2026-10-01", "2026-10-01")).toBe(1);
    expect(daysInRange("2026-10-01", "2026-10-31")).toBe(31);
  });
});

describe("presetRange", () => {
  const today = "2026-10-29";

  it("devuelve el período de cada atajo", () => {
    expect(presetRange("today", today)).toEqual({ from: "2026-10-29", to: "2026-10-29" });
    expect(presetRange("last7", today)).toEqual({ from: "2026-10-23", to: "2026-10-29" });
    expect(presetRange("last30", today)).toEqual({ from: "2026-09-30", to: "2026-10-29" });
    expect(presetRange("month", today)).toEqual({ from: "2026-10-01", to: "2026-10-29" });
    expect(presetRange("year", today)).toEqual({ from: "2026-01-01", to: "2026-10-29" });
  });

  it("el mes pasado es el mes calendario anterior completo", () => {
    expect(presetRange("lastMonth", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("lastMonth", "2026-03-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetRange("lastMonth", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("los atajos de 7 y 30 días caben en lo que acepta el server", () => {
    expect(daysInRange(presetRange("year", "2026-12-31").from, "2026-12-31")).toBeLessThanOrEqual(366);
  });
});

describe("matchPreset", () => {
  it("reconoce un período que coincide con un atajo", () => {
    expect(matchPreset({ from: "2026-10-01", to: "2026-10-29" }, "2026-10-29")).toBe("month");
    expect(matchPreset({ from: "2026-10-29", to: "2026-10-29" }, "2026-10-29")).toBe("today");
  });

  it("devuelve null para un período personalizado", () => {
    expect(matchPreset({ from: "2026-10-05", to: "2026-10-12" }, "2026-10-29")).toBeNull();
  });
});

describe("previousRange", () => {
  it("compara contra los días inmediatamente anteriores y de la misma duración", () => {
    expect(previousRange({ from: "2026-10-23", to: "2026-10-29" })).toEqual({ from: "2026-10-16", to: "2026-10-22" });
    expect(previousRange({ from: "2026-10-29", to: "2026-10-29" })).toEqual({ from: "2026-10-28", to: "2026-10-28" });
  });

  it("un mes calendario completo se compara con el mes anterior completo", () => {
    expect(previousRange({ from: "2026-10-01", to: "2026-10-31" })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousRange({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("un mes todavía en curso se compara con los mismos días del anterior (no con otro largo)", () => {
    // 1 al 29 de octubre (29 días) vs los 29 días anteriores
    expect(previousRange({ from: "2026-10-01", to: "2026-10-29" })).toEqual({ from: "2026-09-02", to: "2026-09-30" });
  });
});
