import type { ProductVariant } from "@caracol/shared";

export interface AttributeOption {
  name: string;
  values: string[];
}

type Selectable = Pick<ProductVariant, "sku" | "attributes" | "stock">;

/** Los atributos de todas las variantes, en orden de aparición y sin repetir (Color → [Rojo, Azul], Talle → [S, M]). */
export function attributeOptions(variants: readonly Selectable[]): AttributeOption[] {
  const byName = new Map<string, string[]>();
  for (const variant of variants) {
    for (const { name, value } of variant.attributes) {
      const values = byName.get(name) ?? [];
      if (!values.includes(value)) values.push(value);
      byName.set(name, values);
    }
  }
  return [...byName].map(([name, values]) => ({ name, values }));
}

function valueOf(variant: Selectable, name: string): string | undefined {
  return variant.attributes.find((a) => a.name === name)?.value;
}

/** ¿La variante coincide con todos los valores pedidos (salvo el atributo `except`)? */
function matches(variant: Selectable, wanted: Record<string, string>, except?: string): boolean {
  return Object.entries(wanted).every(([name, value]) => name === except || valueOf(variant, name) === value);
}

function selectionOf(variant: Selectable): Record<string, string> {
  return Object.fromEntries(variant.attributes.map((a) => [a.name, a.value]));
}

/**
 * Al elegir un valor se busca la variante que lo tenga manteniendo, si se puede, el resto de la
 * selección actual (cambiar el color no debería cambiar el talle). Si esa combinación no existe o
 * está agotada, se cae a la que más se parezca: con stock primero.
 */
export function pickVariant<V extends Selectable>(
  variants: readonly V[],
  current: V,
  name: string,
  value: string,
): V {
  const withValue = variants.filter((v) => valueOf(v, name) === value);
  const wanted = selectionOf(current);
  const sameRest = withValue.filter((v) => matches(v, wanted, name));
  return (
    sameRest.find((v) => v.stock > 0) ??
    withValue.find((v) => v.stock > 0) ??
    sameRest[0] ??
    withValue[0] ??
    current
  );
}

/** Un valor se puede elegir si existe alguna variante con stock que lo tenga junto al resto de la selección actual. */
export function isValueAvailable(
  variants: readonly Selectable[],
  current: Selectable,
  name: string,
  value: string,
): boolean {
  const wanted = selectionOf(current);
  return variants.some((v) => v.stock > 0 && valueOf(v, name) === value && matches(v, wanted, name));
}
