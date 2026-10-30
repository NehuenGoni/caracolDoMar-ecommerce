/**
 * `transform` de `toJSON` para pedidos y ventas: saca el costo (`unitCost`) de cada línea.
 *
 * Ese costo es un dato interno que se guarda para calcular márgenes en los reportes. Los pedidos
 * los ve el cliente y las ventas del local las ve el vendedor, así que no puede salir en ninguna
 * respuesta. Poniéndolo en el schema, ninguna ruta —ni una futura— lo puede devolver por
 * descuido. Los reportes lo leen con `lean()`, que no pasa por `toJSON`.
 */
export function hideItemCost<T extends { items?: { unitCost?: number }[] }>(_doc: unknown, ret: T): T {
  for (const item of ret.items ?? []) delete item.unitCost;
  return ret;
}
