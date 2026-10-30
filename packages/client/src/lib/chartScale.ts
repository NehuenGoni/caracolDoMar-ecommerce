import type { ReportGroupBy } from "@caracol/shared";

/** Un tope "redondo" para el eje (1, 2, 2,5, 5 × 10ⁿ) y las marcas intermedias, en la unidad que se le pase. */
export function niceScale(maxValue: number, targetTicks = 4): { max: number; ticks: number[] } {
  if (!(maxValue > 0)) return { max: 1, ticks: [0, 1] };

  const rawStep = maxValue / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude;

  const max = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 1000; value += step) ticks.push(Math.round(value * 1000) / 1000);
  return { max, ticks };
}

const compactDecimal = (value: number) => value.toLocaleString("es-AR", { maximumFractionDigits: 1 });

/** Pesos en versión corta para los ejes: $900 · $1 mil · $2,5 mil · $1,2 M. Recibe centavos. */
export function formatCompactPesos(cents: number): string {
  const pesos = Math.abs(cents) / 100;
  const sign = cents < 0 ? "-" : "";
  if (pesos >= 1_000_000) return `${sign}$${compactDecimal(pesos / 1_000_000)} M`;
  if (pesos >= 1_000) return `${sign}$${compactDecimal(pesos / 1_000)} mil`;
  return `${sign}$${compactDecimal(pesos)}`;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const WEEKDAYS_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function dayParts(key: string) {
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month: month - 1, day, weekday };
}

function addDaysKey(key: string, days: number): string {
  return new Date(new Date(`${key}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Etiqueta corta para el eje: "5 oct", "5 oct" (lunes de la semana) u "oct 26". */
export function shortPeriodLabel(period: string, groupBy: ReportGroupBy): string {
  if (groupBy === "month") {
    const { year, month } = dayParts(`${period}-01`);
    return `${MONTHS[month]} ${String(year).slice(2)}`;
  }
  const { day, month } = dayParts(period);
  return `${day} ${MONTHS[month]}`;
}

/** Etiqueta completa para el tooltip y la tabla: "lunes 5 de octubre", "Semana del 5 al 11 de oct", "octubre de 2026". */
export function longPeriodLabel(period: string, groupBy: ReportGroupBy): string {
  if (groupBy === "month") {
    const { year, month } = dayParts(`${period}-01`);
    return `${MONTHS_LONG[month]} de ${year}`;
  }
  if (groupBy === "week") {
    const start = dayParts(period);
    const end = dayParts(addDaysKey(period, 6));
    return start.month === end.month
      ? `Semana del ${start.day} al ${end.day} de ${MONTHS[end.month]}`
      : `Semana del ${start.day} de ${MONTHS[start.month]} al ${end.day} de ${MONTHS[end.month]}`;
  }
  const { day, month, weekday } = dayParts(period);
  return `${WEEKDAYS_LONG[weekday]} ${day} de ${MONTHS_LONG[month]}`;
}

/** Cada cuántas columnas poner una etiqueta en el eje para que no se pisen. */
export function labelEvery(bandWidth: number, labelWidth = 48): number {
  return Math.max(1, Math.ceil(labelWidth / Math.max(bandWidth, 1)));
}

/** Variación porcentual contra el período anterior; null si no hay con qué comparar. */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
