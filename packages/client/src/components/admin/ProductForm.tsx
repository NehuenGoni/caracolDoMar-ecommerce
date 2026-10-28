import type { BundleComponent } from "@caracol/shared";
import { useState, type FormEvent } from "react";
import { BundleItemsEditor } from "@/components/admin/BundleItemsEditor";
import { ProductImagesEditor } from "@/components/admin/ProductImagesEditor";
import { ProductVariantsEditor } from "@/components/admin/ProductVariantsEditor";
import { ProductVideosEditor } from "@/components/admin/ProductVideosEditor";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useAdminCategories } from "@/hooks/admin/useAdminCategories";
import { useSuppliers } from "@/hooks/admin/useSuppliers";
import { ApiError } from "@/lib/apiClient";
import type { ProductInput } from "@/lib/adminProductsApi";

interface ProductFormProps {
  /** Al editar viene el producto completo; `bundleComponents` trae los nombres de los componentes de un kit. */
  initialValue?: Partial<ProductInput> & { bundleComponents?: BundleComponent[] };
  onSubmit: (input: ProductInput) => Promise<void>;
  submitLabel?: string;
}

function toValues(initial?: Partial<ProductInput>): ProductInput {
  return {
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "",
    brand: initial?.brand ?? "",
    tags: initial?.tags ?? [],
    isActive: initial?.isActive ?? true,
    isFeatured: initial?.isFeatured ?? false,
    images: initial?.images ?? [],
    videos: initial?.videos ?? [],
    isBundle: initial?.isBundle ?? false,
    supplier: initial?.supplier ?? "",
    bundleItems: initial?.bundleItems ?? [],
    variants: initial?.variants ?? [
      { sku: "", attributes: [], price: 0, costPrice: 0, stock: 0, lowStockThreshold: 0, isUniquePiece: false },
    ],
  };
}

export function ProductForm({ initialValue, onSubmit, submitLabel = "Guardar producto" }: ProductFormProps) {
  const { categories } = useAdminCategories();
  const { suppliers } = useSuppliers();
  const [values, setValues] = useState<ProductInput>(() => toValues(initialValue));
  // Las variantes que vienen del servidor quedan con SKU y stock bloqueados; las que se agregan después no.
  const [lockedSkus] = useState<ReadonlySet<string>>(
    () => new Set((initialValue?.variants ?? []).map((v) => v.sku)),
  );
  const isEditing = initialValue !== undefined;
  const [components, setComponents] = useState<BundleComponent[]>(() => initialValue?.bundleComponents ?? []);
  const [tagsText, setTagsText] = useState(() => (initialValue?.tags ?? []).join(", "));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  /** Un kit tiene una sola variante (el precio del kit) y sin stock propio. */
  function toggleBundle(isBundle: boolean) {
    setValues((prev) => ({
      ...prev,
      isBundle,
      variants: isBundle
        ? prev.variants.slice(0, 1).map((v) => ({ ...v, isUniquePiece: false, stock: 0, lowStockThreshold: 0 }))
        : prev.variants,
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (values.isBundle && components.length === 0) {
      setError("Agregá al menos un componente al kit");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await onSubmit({
        ...values,
        tags,
        slug: values.slug || undefined,
        // Al editar, "" significa que se quitó el proveedor (null); al crear, simplemente no hay.
        supplier: values.supplier || (isEditing ? null : undefined),
        bundleItems: values.isBundle
          ? components.map((c) => ({ product: c.productId, variantSku: c.variantSku, quantity: c.quantity }))
          : [],
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar el producto");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nombre" required value={values.name} onChange={(e) => set("name", e.target.value)} />
        <Input
          label="Slug (opcional)"
          hint="Se genera automáticamente a partir del nombre si lo dejás vacío"
          value={values.slug}
          onChange={(e) => set("slug", e.target.value)}
        />
      </div>

      <Textarea
        label="Descripción"
        value={values.description}
        onChange={(e) => set("description", e.target.value)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Categoría"
          required
          value={values.category}
          onChange={(e) => set("category", e.target.value)}
        >
          <option value="">Seleccionar…</option>
          {categories.map((category) => (
            <option key={category._id} value={category._id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Input label="Marca (opcional)" value={values.brand} onChange={(e) => set("brand", e.target.value)} />
        <Select
          label="Proveedor habitual (opcional)"
          value={values.supplier ?? ""}
          onChange={(e) => set("supplier", e.target.value)}
        >
          <option value="">Sin proveedor</option>
          {suppliers.map((supplier) => (
            <option key={supplier._id} value={supplier._id}>
              {supplier.name}
            </option>
          ))}
        </Select>
      </div>

      <Input
        label="Tags (separados por coma)"
        value={tagsText}
        onChange={(e) => setTagsText(e.target.value)}
      />

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            className="size-4 rounded border-border accent-accent"
          />
          Producto activo (visible en la tienda)
        </label>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={values.isFeatured}
            onChange={(e) => set("isFeatured", e.target.checked)}
            className="size-4 rounded border-border accent-accent"
          />
          Destacado
        </label>
      </div>

      <label className="flex items-start gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={values.isBundle}
          disabled={isEditing}
          onChange={(e) => toggleBundle(e.target.checked)}
          className="mt-0.5 size-4 rounded border-border accent-accent"
        />
        <span>
          Es un kit o combo
          <span className="block text-xs text-text-muted">
            {isEditing
              ? "Un producto no se puede convertir en kit (ni al revés)."
              : "Se arma con otros productos y descuenta el stock de cada uno cuando se vende."}
          </span>
        </span>
      </label>

      <ProductImagesEditor images={values.images} onChange={(images) => set("images", images)} />
      <ProductVideosEditor videos={values.videos} onChange={(videos) => set("videos", videos)} />
      {values.isBundle && <BundleItemsEditor components={components} onChange={setComponents} />}
      <ProductVariantsEditor
        isBundle={values.isBundle}
        variants={values.variants}
        lockedSkus={lockedSkus}
        onChange={(variants) => set("variants", variants)}
      />

      {error && <InlineMessage tone="error">{error}</InlineMessage>}

      <div>
        <Button type="submit" isLoading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
