/**
 * Escapa un texto para usarlo literal dentro de una expresión regular (por ejemplo en un `$regex`
 * de Mongo). Sin esto, lo que escribe un usuario se interpreta como patrón: de un `(a+)+$` se
 * cuelga la consulta (ReDoS) y un `.*` matchea todo.
 */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
