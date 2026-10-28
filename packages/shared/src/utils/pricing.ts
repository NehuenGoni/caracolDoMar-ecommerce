/**
 * Aplica un margen porcentual sobre un costo en centavos.
 * Ej: applyMargin(10000, 60) -> 16000 (60% de margen sobre un costo de $100).
 */
export function applyMargin(costCents: number, marginPercent: number): number {
  return Math.round(costCents * (1 + marginPercent / 100));
}

/**
 * Redondea hacia arriba al múltiplo de `stepCents`. Se usa para que un precio calculado por
 * margen no termine en un valor como $17.483,20: nadie publica un precio así.
 */
export function roundUpToStep(cents: number, stepCents: number): number {
  if (stepCents <= 0) return cents;
  return Math.ceil(cents / stepCents) * stepCents;
}

/** Precio de venta sugerido para un costo: margen y después redondeo hacia arriba. */
export function suggestedPrice(
  costCents: number,
  pricing: { marginPercent: number; roundingStep: number },
): number {
  return roundUpToStep(applyMargin(costCents, pricing.marginPercent), pricing.roundingStep);
}

/**
 * Convierte un importe con IVA incluido a su valor neto (sin IVA), dada la alícuota.
 * Ej: netFromGross(12100, 21) -> 10000. El costo de las variantes se guarda siempre neto,
 * y una factura puede discriminar el IVA o no.
 */
export function netFromGross(grossCents: number, taxPercent: number): number {
  return Math.round(grossCents / (1 + taxPercent / 100));
}

/**
 * Margen efectivo (%) entre un costo y un precio de venta, ambos en centavos. Es la inversa de
 * `applyMargin`; sirve para mostrar el margen de un precio que se editó a mano.
 */
export function marginFromPrices(costCents: number, priceCents: number): number {
  if (costCents <= 0) return 0;
  return ((priceCents - costCents) / costCents) * 100;
}
