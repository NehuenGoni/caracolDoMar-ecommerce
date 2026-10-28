const CURRENCY_LOCALE = "es-AR";
const CURRENCY_CODE = "ARS";

/**
 * Formatea un monto en centavos (entero) como pesos argentinos, ej:
 * formatMoney(123456) -> "$ 1.234,56"
 */
export function formatMoney(cents: number, options: { withSymbol?: boolean } = {}): string {
  const { withSymbol = true } = options;
  const pesos = cents / 100;
  const formatted = new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: withSymbol ? "currency" : "decimal",
    currency: CURRENCY_CODE,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pesos);
  return formatted;
}

/** Convierte un monto en pesos (puede tener decimales) a centavos enteros. */
export function pesosToCents(pesos: number): number {
  return Math.round(pesos * 100);
}

/** Convierte centavos a pesos como número (solo para cálculos, no para mostrar). */
export function centsToPesos(cents: number): number {
  return cents / 100;
}

/** Suma segura de montos en centavos, siempre devuelve un entero. */
export function sumCents(...amounts: number[]): number {
  return amounts.reduce((total, amount) => total + Math.round(amount), 0);
}

/** Calcula un porcentaje sobre un monto en centavos, redondeando al centavo. */
export function percentageOfCents(cents: number, percentage: number): number {
  return Math.round((cents * percentage) / 100);
}

/**
 * Convierte un importe escrito en una factura ("1.234,56") a centavos enteros. Es el formato
 * argentino (punto de miles, coma decimal), con el estadounidense ("1,234.56") como respaldo.
 * Se usa para los importes crudos que devuelve la lectura de facturas: nunca se le pide
 * aritmética al modelo, se hace acá.
 *
 * Si aparecen los dos separadores, el que está más a la derecha es el decimal. Si aparece uno
 * solo una única vez y tiene exactamente 3 dígitos detrás, se asume de miles ("1.234" → 1234
 * pesos); si no, es decimal ("12.5" → 12,5 pesos). Varias apariciones del mismo separador son
 * siempre de miles ("1.234.567" → 1234567 pesos).
 *
 * Devuelve null si está vacío o no es un número reconocible.
 */
export function parseArsAmount(raw: string): number | null {
  if (!raw) return null;

  const cleaned = raw.trim().replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalized: string;
  if (lastComma !== -1 && lastDot !== -1) {
    normalized =
      lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (lastComma !== -1 || lastDot !== -1) {
    const sep = lastComma !== -1 ? "," : ".";
    const occurrences = cleaned.split(sep).length - 1;
    const digitsAfterLast = cleaned.length - cleaned.lastIndexOf(sep) - 1;
    const isThousandsSeparator = occurrences > 1 || digitsAfterLast === 3;
    normalized = isThousandsSeparator ? cleaned.split(sep).join("") : cleaned.replace(sep, ".");
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  return Math.round(value * 100);
}
