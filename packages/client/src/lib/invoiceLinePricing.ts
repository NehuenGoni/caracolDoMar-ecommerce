import { marginFromPrices, suggestedPrice } from "@caracol/shared";

/** Precio de venta sugerido para un costo: margen y redondeo hacia arriba (los de Ajustes). */
export function priceFromMargin(costCents: number, marginPercent: number, roundingStep: number): number {
  return suggestedPrice(costCents, { marginPercent, roundingStep });
}

/** Margen (%, entero) que implica un precio dado sobre un costo, para mostrarlo al editar el precio a mano. */
export function marginFromPrice(costCents: number, priceCents: number): number {
  return Math.round(marginFromPrices(costCents, priceCents));
}

/** Variación porcentual de un valor contra el anterior; null si no hay anterior con qué comparar. */
export function percentChange(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
