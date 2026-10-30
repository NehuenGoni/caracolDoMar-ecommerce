export type CsvCell = string | number | null | undefined;

/**
 * CSV pensado para abrirse con doble click en Excel en español (Argentina): separador `;`, decimales
 * con coma (ver `pesos`) y un BOM al principio para que respete las tildes.
 */
const SEPARATOR = ";";
const BOM = "﻿";

function escapeCell(cell: CsvCell): string {
  const text = cell === null || cell === undefined ? "" : String(cell);
  // Una celda que empieza con = + - @ se interpretaría como una fórmula al abrirla en Excel
  // (inyección de fórmulas): se le antepone un apóstrofo. Los números no pasan por acá.
  const safe = typeof cell === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: CsvCell[][]): string {
  return BOM + rows.map((row) => row.map(escapeCell).join(SEPARATOR)).join("\r\n") + "\r\n";
}

/** Centavos → pesos con coma decimal ("123456" → "1234,56"), sin separador de miles. */
export function pesos(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Un porcentaje con coma decimal, o vacío si no se puede calcular. */
export function percent(value: number | null): string {
  return value === null ? "" : value.toFixed(1).replace(".", ",");
}
