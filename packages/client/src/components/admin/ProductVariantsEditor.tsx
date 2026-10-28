import type { ProductVariantAttribute } from "@caracol/shared";
import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import type { ProductVariantInput } from "@/lib/adminProductsApi";

function emptyVariant(): ProductVariantInput {
  return {
    sku: "",
    attributes: [],
    price: 0,
    costPrice: 0,
    stock: 0,
    lowStockThreshold: 0,
  };
}

interface ProductVariantsEditorProps {
  variants: ProductVariantInput[];
  onChange: (variants: ProductVariantInput[]) => void;
  /**
   * SKUs de variantes que ya están guardadas. Su SKU es su identidad y su stock lo mueven las
   * ventas, compras y ajustes (con registro): desde acá no se editan.
   */
  lockedSkus?: ReadonlySet<string>;
  /** Un kit tiene una sola variante (el precio del kit): sin costo, stock ni alertas propias. */
  isBundle?: boolean;
}

const SUGGESTED_ATTRIBUTES = ["Color", "Talle", "Tamaño", "Aroma", "Presentación", "Material"];

/**
 * Los atributos son opcionales: un sahumerio o una vela de una sola variante no necesitan ninguno,
 * mientras que la ropa combina, por ejemplo, Color y Talle.
 */
function VariantAttributesEditor({
  attributes,
  onChange,
}: {
  attributes: ProductVariantAttribute[];
  onChange: (attributes: ProductVariantAttribute[]) => void;
}) {
  const listId = useId();

  function patch(index: number, change: Partial<ProductVariantAttribute>) {
    onChange(attributes.map((a, i) => (i === index ? { ...a, ...change } : a)));
  }

  return (
    <div className="flex flex-col gap-2">
      <datalist id={listId}>
        {SUGGESTED_ATTRIBUTES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {attributes.map((attribute, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
          <Input
            label={i === 0 ? "Atributo" : undefined}
            placeholder="Color, Talle…"
            list={listId}
            required
            value={attribute.name}
            onChange={(e) => patch(i, { name: e.target.value })}
          />
          <Input
            label={i === 0 ? "Valor" : undefined}
            placeholder="Rojo, M…"
            required
            value={attribute.value}
            onChange={(e) => patch(i, { value: e.target.value })}
          />
          <button
            type="button"
            onClick={() => onChange(attributes.filter((_, j) => j !== i))}
            aria-label="Quitar atributo"
            className="mb-1.5 flex size-8 items-center justify-center rounded-full text-accent2-deep hover:bg-surface-alt"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      {attributes.length < 4 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => onChange([...attributes, { name: "", value: "" }])}
        >
          <Plus className="size-4" /> {attributes.length === 0 ? "Agregar atributo (color, talle…)" : "Agregar otro atributo"}
        </Button>
      )}
    </div>
  );
}

export function ProductVariantsEditor({ variants, onChange, lockedSkus, isBundle }: ProductVariantsEditorProps) {
  function update(index: number, patch: Partial<ProductVariantInput>) {
    onChange(variants.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function remove(index: number) {
    onChange(variants.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...variants, emptyVariant()]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text">{isBundle ? "Precio del kit" : "Variantes"}</p>
        {!isBundle && (
          <Button type="button" variant="secondary" size="sm" onClick={add}>
            <Plus className="size-4" /> Agregar variante
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {variants.map((variant, index) => (
          <Card key={index} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text-muted">Variante {index + 1}</p>
              {variants.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label="Quitar variante"
                  className="flex size-8 items-center justify-center rounded-full text-accent2-deep hover:bg-surface-alt"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="SKU"
                required
                value={variant.sku}
                disabled={lockedSkus?.has(variant.sku)}
                onChange={(e) => update(index, { sku: e.target.value })}
              />
            </div>

            <VariantAttributesEditor
              attributes={variant.attributes}
              onChange={(attributes) => update(index, { attributes })}
            />

            {isBundle ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <MoneyInput
                  label="Precio del kit"
                  value={variant.price}
                  onChange={(cents) => update(index, { price: cents })}
                />
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <MoneyInput
                    label="Precio de venta"
                    value={variant.price}
                    onChange={(cents) => update(index, { price: cents })}
                  />
                  <MoneyInput
                    label="Costo"
                    value={variant.costPrice}
                    onChange={(cents) => update(index, { costPrice: cents })}
                  />
                  <Input
                    label={lockedSkus?.has(variant.sku) ? "Stock actual" : "Stock inicial"}
                    type="number"
                    min={0}
                    max={variant.isUniquePiece ? 1 : undefined}
                    value={variant.stock}
                    disabled={lockedSkus?.has(variant.sku)}
                    hint={lockedSkus?.has(variant.sku) ? "Se ajusta desde Inventario" : undefined}
                    onChange={(e) => update(index, { stock: Number(e.target.value) })}
                  />
                  <Input
                    label="Alerta de stock bajo"
                    type="number"
                    min={0}
                    value={variant.lowStockThreshold}
                    onChange={(e) => update(index, { lowStockThreshold: Number(e.target.value) })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={Boolean(variant.isUniquePiece)}
                    onChange={(e) =>
                      update(
                        index,
                        e.target.checked
                          ? lockedSkus?.has(variant.sku)
                            ? { isUniquePiece: true }
                            : { isUniquePiece: true, stock: Math.min(variant.stock, 1), lowStockThreshold: 0 }
                          : { isUniquePiece: false },
                      )
                    }
                    className="size-4 rounded border-border accent-accent"
                  />
                  Pieza única (una sola unidad: sale de la tienda cuando se vende)
                </label>
              </>
            )}

            <div className="grid gap-3 sm:grid-cols-4">
              <Input
                label="Peso en gramos"
                type="number"
                min={0}
                value={variant.weight ?? ""}
                onChange={(e) => update(index, { weight: e.target.value ? Number(e.target.value) : undefined })}
              />
              <Input
                label="Alto en cm"
                type="number"
                min={0}
                value={variant.height ?? ""}
                onChange={(e) => update(index, { height: e.target.value ? Number(e.target.value) : undefined })}
              />
              <Input
                label="Ancho en cm"
                type="number"
                min={0}
                value={variant.width ?? ""}
                onChange={(e) => update(index, { width: e.target.value ? Number(e.target.value) : undefined })}
              />
              <Input
                label="Largo en cm"
                type="number"
                min={0}
                value={variant.length ?? ""}
                onChange={(e) => update(index, { length: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
            <p className="-mt-2 text-xs text-text-muted">
              Peso y medidas del paquete: se usan para cotizar el envío. Si no se cargan, se usa un paquete
              genérico configurado en Envíos.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Código de barras (opcional)"
                value={variant.barcode ?? ""}
                onChange={(e) => update(index, { barcode: e.target.value || undefined })}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
