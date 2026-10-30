import { AnimatePresence, motion } from "framer-motion";
import { Check, ImageOff, Play, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { formatVariantLabel, productSeo } from "@caracol/shared";
import { useParams } from "react-router-dom";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { PriceTag } from "@/components/ui/PriceTag";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/contexts/CartContext";
import { useCategories } from "@/hooks/useCategories";
import { useProduct } from "@/hooks/useProduct";
import { siteUrl, useSeo } from "@/hooks/useSeo";
import { buildGallery } from "@/lib/media";
import { attributeOptions, isValueAvailable, pickVariant } from "@/lib/variantSelection";
import NotFound from "./NotFound";

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { product, isLoading, error } = useProduct(slug);
  const { addItem } = useCart();
  const { categories } = useCategories();
  const category = product ? categories.find((c) => c._id === product.category) : undefined;
  useSeo(product ? productSeo(siteUrl(), product, category) : null);

  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [confirmation, setConfirmation] = useState(false);

  const variant = useMemo(() => {
    if (!product) return null;
    return product.variants.find((v) => v.sku === selectedSku) ?? product.variants[0] ?? null;
  }, [product, selectedSku]);

  const options = useMemo(() => (product ? attributeOptions(product.variants) : []), [product]);

  if (isLoading) return <Spinner label="Cargando producto…" />;
  if (error || !product) return <NotFound />;

  const gallery = buildGallery(product);
  const current = gallery[selectedImage] ?? gallery[0];

  async function handleAddToCart() {
    if (!product || !variant) return;
    await addItem({
      productId: product._id,
      variantSku: variant.sku,
      quantity,
      name: product.name,
      slug: product.slug,
      image: product.images[0]?.url,
      variantLabel: formatVariantLabel(variant.attributes),
      unitPrice: variant.price,
      availableStock: variant.stock,
    });
    setConfirmation(true);
    setTimeout(() => setConfirmation(false), 2500);
  }

  return (
    <div className="grid gap-10 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        <motion.div
          layoutId={`product-image-${product._id}`}
          className="aspect-square overflow-hidden rounded-2xl bg-surface-alt"
        >
          {current?.kind === "video" ? (
            <video
              key={current.url}
              src={current.url}
              poster={current.poster}
              controls
              playsInline
              preload="metadata"
              className="size-full bg-black object-contain"
            />
          ) : current ? (
            <img src={current.url} alt={current.alt ?? product.name} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-text-muted">
              <ImageOff className="size-10" />
            </div>
          )}
        </motion.div>
        {gallery.length > 1 && (
          <div className="flex gap-2">
            {gallery.map((item, index) => (
              <button
                key={item.url + index}
                type="button"
                onClick={() => setSelectedImage(index)}
                aria-label={item.kind === "video" ? "Ver video" : `Ver imagen ${index + 1}`}
                className={`size-16 shrink-0 overflow-hidden rounded-xl border-2 transition-colors ${
                  index === selectedImage ? "border-accent" : "border-transparent"
                }`}
              >
                {item.kind === "video" ? (
                  <span className="relative block size-full bg-text/80">
                    {item.poster && <img src={item.poster} alt="" className="size-full object-cover opacity-70" />}
                    <Play className="absolute inset-0 m-auto size-5 text-bg" />
                  </span>
                ) : (
                  <img src={item.url} alt="" className="size-full object-cover" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-display text-3xl text-text">{product.name}</h1>
          {product.brand && <p className="mt-1 text-sm text-text-muted">{product.brand}</p>}
        </div>

        {variant && (
          <p className="font-display text-2xl text-accent-deep">
            <PriceTag cents={variant.price} />
          </p>
        )}

        {product.description && <p className="text-sm leading-relaxed text-text-muted">{product.description}</p>}

        {product.isBundle && product.bundleComponents && product.bundleComponents.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface-alt p-4">
            <p className="text-sm font-medium text-text">Este kit incluye</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-text-muted">
              {product.bundleComponents.map((c) => (
                <li key={c.productId + c.variantSku}>
                  {c.quantity} × {c.productName}
                  {c.variantLabel ? ` (${c.variantLabel})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {variant &&
          options.map((option) => (
            <div key={option.name} className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text">{option.name}</span>
              <div className="flex flex-wrap gap-2">
                {option.values.map((value) => {
                  const selected = variant.attributes.some((a) => a.name === option.name && a.value === value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setSelectedSku(pickVariant(product.variants, variant, option.name, value).sku);
                        setQuantity(1);
                      }}
                      disabled={!selected && !isValueAvailable(product.variants, variant, option.name, value)}
                      aria-pressed={selected}
                      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        selected
                          ? "border-primary bg-primary text-on-primary"
                          : "border-border bg-surface text-text hover:bg-surface-alt"
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

        {variant && (
          <div className="flex items-center gap-4">
            <QuantityStepper value={quantity} max={variant.stock} onChange={setQuantity} />
            <span className="text-sm text-text-muted">
              {variant.isUniquePiece
                ? variant.stock > 0
                  ? "Pieza única: hay una sola unidad"
                  : "Esta pieza única ya fue vendida"
                : variant.stock > 0
                  ? `${variant.stock} disponibles`
                  : "Sin stock"}
            </span>
          </div>
        )}

        <Button size="lg" onClick={handleAddToCart} disabled={!variant || variant.stock <= 0} className="w-fit">
          <ShoppingBag className="size-4" /> Agregar al carrito
        </Button>

        <AnimatePresence>
          {confirmation && (
            <InlineMessage tone="success">
              <span className="inline-flex items-center gap-1">
                <Check className="size-4" /> Agregado al carrito
              </span>
            </InlineMessage>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
