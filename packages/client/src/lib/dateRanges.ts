/**
 * Los períodos de los reportes son días de Argentina (`YYYY-MM-DD`, ambos extremos incluidos),
 * igual que en el server. Argentina no tiene horario de verano: el offset es siempre -03:00.
 */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Hoy en Argentina, sin importar en qué zona horaria esté la computadora. */
export function todayKey(now: Date = new Date()): string {
  return new Date(now.getTime() - AR_OFFSET_MS).toISOString().slice(0, 10);
}

function parse(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function addDays(key: string, days: number): string {
  return new Date(parse(key).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Cantidad de días del período, contando ambos extremos. */
export function daysInRange(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / DAY_MS) + 1;
}

export type RangePreset = "today" | "last7" | "last30" | "month" | "lastMonth" | "year";

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: "Hoy",
  last7: "Últimos 7 días",
  last30: "Últimos 30 días",
  month: "Este mes",
  lastMonth: "Mes pasado",
  year: "Este año",
};

export interface DateRange {
  from: string;
  to: string;
}

export function presetRange(preset: RangePreset, today: string = todayKey()): DateRange {
  const monthStart = `${today.slice(0, 8)}01`;
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "month":
      return { from: monthStart, to: today };
    case "lastMonth": {
      const to = addDays(monthStart, -1);
      return { from: `${to.slice(0, 8)}01`, to };
    }
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/** A cuál de los atajos corresponde un período, si a alguno (para marcarlo como elegido). */
export function matchPreset(range: DateRange, today: string = todayKey()): RangePreset | null {
  const presets = Object.keys(PRESET_LABELS) as RangePreset[];
  return presets.find((p) => {
    const r = presetRange(p, today);
    return r.from === range.from && r.to === range.to;
  }) ?? null;
}

/**
 * Los mismos días, pero del mes anterior (el 1 al 12 de octubre → el 1 al 12 de septiembre). Es la
 * comparación natural para el mes en curso. El período tiene que estar dentro de un solo mes; los
 * días que el mes anterior no tiene (31 de marzo → febrero) se recortan a su último día.
 */
export function sameDaysLastMonth(range: DateRange): DateRange {
  const lastOfPrevious = addDays(`${range.from.slice(0, 8)}01`, -1);
  const clamp = (key: string) => {
    const day = `${lastOfPrevious.slice(0, 8)}${key.slice(8)}`;
    return day > lastOfPrevious ? lastOfPrevious : day;
  };
  return { from: clamp(range.from), to: clamp(range.to) };
}

/**
 * El período anterior de la misma duración, justo antes (para decir "vs el período anterior").
 * Un mes calendario completo se compara con el mes anterior completo, no con los N días previos.
 */
export function previousRange(range: DateRange): DateRange {
  const { from, to } = range;
  const isWholeMonth = from.endsWith("-01") && addDays(to, 1).endsWith("-01") && from.slice(0, 7) === to.slice(0, 7);
  if (isWholeMonth) {
    const prevTo = addDays(from, -1);
    return { from: `${prevTo.slice(0, 8)}01`, to: prevTo };
  }
  const length = daysInRange(from, to);
  return { from: addDays(from, -length), to: addDays(from, -1) };
}
