import type { ReportGroupBy } from "@caracol/shared";
import { BadRequestError } from "./AppError.js";

/**
 * Los reportes cuentan por día de Argentina. Argentina no tiene horario de verano desde 2009, así
 * que el offset es siempre -03:00.
 */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const AR_OFFSET = "-03:00";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Para que un pedido de reporte no recorra años de ventas de una sola vez. */
export const MAX_RANGE_DAYS = 366;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` del día de Argentina al que pertenece un instante. */
export function dayKey(date: Date): string {
  return new Date(date.getTime() - AR_OFFSET_MS).toISOString().slice(0, 10);
}

function parseDayKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function addDays(key: string, days: number): string {
  return new Date(parseDayKey(key).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function isValidDayKey(key: string): boolean {
  if (!DAY_KEY.test(key)) return false;
  const date = parseDayKey(key);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === key;
}

export interface ReportRange {
  fromKey: string;
  toKey: string;
  /** Primer instante del primer día (00:00 de Argentina). */
  start: Date;
  /** Último instante del último día (23:59:59.999 de Argentina). */
  end: Date;
}

/**
 * Convierte `from`/`to` (`YYYY-MM-DD`, días de Argentina, ambos incluidos) en un rango de instantes.
 * Por defecto: desde el primer día del mes hasta hoy.
 */
export function resolveRange(from?: string, to?: string, now: Date = new Date()): ReportRange {
  const today = dayKey(now);
  const toKey = to ?? today;
  const fromKey = from ?? `${toKey.slice(0, 8)}01`;

  if (!isValidDayKey(fromKey) || !isValidDayKey(toKey)) {
    throw new BadRequestError("Las fechas tienen que tener el formato AAAA-MM-DD");
  }
  if (fromKey > toKey) {
    throw new BadRequestError("La fecha 'desde' no puede ser posterior a 'hasta'");
  }
  const days = Math.round((parseDayKey(toKey).getTime() - parseDayKey(fromKey).getTime()) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new BadRequestError(`El período no puede superar ${MAX_RANGE_DAYS} días`);
  }

  return {
    fromKey,
    toKey,
    start: new Date(`${fromKey}T00:00:00.000${AR_OFFSET}`),
    end: new Date(`${toKey}T23:59:59.999${AR_OFFSET}`),
  };
}

/** A qué período del gráfico pertenece un día: él mismo, el lunes de su semana o su mes. */
export function bucketKey(day: string, groupBy: ReportGroupBy): string {
  if (groupBy === "day") return day;
  if (groupBy === "month") return day.slice(0, 7);
  // getUTCDay: 0 = domingo. Semana de lunes a domingo.
  const weekday = parseDayKey(day).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/** Todos los períodos entre dos días (incluso los sin ventas), para que el gráfico no tenga huecos. */
export function listBuckets(fromKey: string, toKey: string, groupBy: ReportGroupBy): string[] {
  const buckets: string[] = [];
  for (let day = fromKey; day <= toKey; day = addDays(day, 1)) {
    const bucket = bucketKey(day, groupBy);
    if (buckets[buckets.length - 1] !== bucket) buckets.push(bucket);
  }
  return buckets;
}
