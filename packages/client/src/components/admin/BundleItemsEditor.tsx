import type { BundleComponent } from "@caracol/shared";
import { formatVariantLabel } from "@caracol/shared";
import { Trash2 } from "lucide-react";
import { ProductVariantPicker } from "@/components/admin/ProductVariantPicker";
import { Input } from "@/components/ui/Input";

interface BundleItemsEditorProps {
  components: BundleComponent[];
  onChange: (components: BundleComponent[]) => void;
}

const sameComponent = (a: BundleComponent, b: { productId: string; variantSku: string }) =>
  a.productId === b.productId && a.variantSku === b.variantSku;

/**
 * Qué incluye el kit. Al venderlo se descuenta el stock de cada componente (cantidad × cantidad
 * del kit); el kit en sí no tiene stock propio.
 */
export function BundleItemsEditor({ components, onChange }: BundleItemsEditorProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-alt p-4">
      <div>
        <p className="text-sm font-medium text-text">Componentes del kit</p>
        <p className="text-xs text-text-muted">
          El stock del kit sale de estos productos y su costo es la suma de los costos. Un kit no puede incluir
          otros kits.
        </p>
      </div>

      {components.length > 0 && (
        <ul className="flex flex-col gap-2">
          {components.map((component, index) => (
            <li
              key={`${component.productId}:${component.variantSku}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{component.productName}</p>
                <p className="text-xs text-text-muted">
                  {[component.variantLabel, `SKU ${component.variantSku}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="w-20">
                <Input
                  aria-label={`Cantidad de ${component.productName}`}
                  type="number"
                  min={1}
                  max={99}
                  value={component.quantity}
                  onChange={(e) =>
                    onChange(
                      components.map((c, i) =>
                        i === index ? { ...c, quantity: Math.max(1, Number(e.target.value) || 1) } : c,
                      ),
                    )
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => onChange(components.filter((_, i) => i !== index))}
                aria-label={`Quitar ${component.productName}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-accent2-deep hover:bg-surface-alt"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ProductVariantPicker
        value={null}
        onClear={() => {}}
        // Los kits no se anidan y un componente archivado no se puede vender.
        filter={(product) => !product.isBundle && product.isActive}
        onChange={({ product, variant }) => {
          const next: BundleComponent = {
            productId: product._id,
            productName: product.name,
            variantSku: variant.sku,
            variantLabel: formatVariantLabel(variant.attributes),
            quantity: 1,
          };
          if (components.some((c) => sameComponent(c, next))) return;
          onChange([...components, next]);
        }}
      />
    </div>
  );
}
