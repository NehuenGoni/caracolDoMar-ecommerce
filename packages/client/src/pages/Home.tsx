import { BUSINESS, homeSeo, isBusinessFieldSet } from "@caracol/shared";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Instagram, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { Spinner } from "@/components/ui/Spinner";
import { WarmPhoto } from "@/components/ui/WarmPhoto";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { useCategories } from "@/hooks/useCategories";
import { useProducts } from "@/hooks/useProducts";
import { siteUrl, useSeo } from "@/hooks/useSeo";
import { STORE_CONTENT } from "@/lib/storeContent";

const EASE = [0.16, 1, 0.3, 1] as const;

const hasWhatsApp = isBusinessFieldSet(BUSINESS.whatsappNumber);
const hasAddress = isBusinessFieldSet(BUSINESS.address);
const hasHours = isBusinessFieldSet(BUSINESS.openingHours);

/** Una frase del feed ("Sos magia") como separador entre secciones. */
function Affirmation({ text }: { text: string }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.8 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="flex items-center gap-4 text-center font-affirmation text-3xl text-accent3 sm:text-4xl"
    >
      <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
      {text}
      <span aria-hidden className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
    </motion.p>
  );
}

export default function Home() {
  const { data, isLoading } = useProducts({ isFeatured: true, limit: 8 });
  const { categories } = useCategories();
  useSeo(homeSeo(siteUrl()));

  const { hero, affirmations, owner, instagramPosts } = STORE_CONTENT;

  return (
    <div className="flex flex-col gap-16">
      <section className="relative isolate flex min-h-[28rem] items-end overflow-hidden rounded-3xl px-6 py-12 sm:min-h-[32rem] sm:px-12 md:items-center">
        {/* El texto va siempre en crema sobre el velo de madera oscura, en ambos temas. */}
        <motion.div
          initial={{ scale: 1.06 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.2, ease: EASE }}
          className="absolute inset-0 -z-20"
        >
          <WarmPhoto src={hero.image} alt="" loading="eager" className="size-full" />
        </motion.div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-madera-oscura/90 via-madera-oscura/50 to-madera-oscura/5 md:bg-gradient-to-r md:from-madera-oscura/85 md:via-madera-oscura/45 md:to-transparent" />
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.15 }}
          className="flex max-w-lg flex-col gap-5"
        >
          <span className="w-fit rounded-full bg-crema/15 px-3 py-1 text-xs font-semibold tracking-wide text-crema backdrop-blur-sm">
            {hero.eyebrow}
          </span>
          <h1 className="font-display text-5xl leading-[1.05] text-crema sm:text-6xl">{hero.title}</h1>
          <p className="max-w-md text-crema/85">{hero.text}</p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/catalogo"
              className="inline-flex items-center gap-2 rounded-full bg-crema px-6 py-3 text-sm font-semibold text-madera-oscura transition-colors hover:bg-dorado-viejo"
            >
              Ver catálogo <ArrowRight className="size-4" />
            </Link>
            {hasWhatsApp && (
              <a
                href={BUSINESS.whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-crema/40 px-6 py-3 text-sm font-semibold text-crema backdrop-blur-sm transition-colors hover:bg-crema/10"
              >
                <WhatsAppIcon className="size-4" /> Consultanos
              </a>
            )}
          </div>
        </motion.div>
      </section>

      {categories.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-3xl text-text">Categorías</h2>
          <div className="flex flex-wrap gap-3">
            {categories.slice(0, 8).map((category) => (
              <Link
                key={category._id}
                to={`/catalogo?categoria=${category.slug}`}
                className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-accent hover:text-accent-deep"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {affirmations[0] && <Affirmation text={affirmations[0]} />}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-3xl text-text">Destacados</h2>
          <Link to="/catalogo" className="text-sm font-semibold text-accent-deep hover:underline">
            Ver todo
          </Link>
        </div>
        {isLoading ? <Spinner /> : <ProductGrid products={data?.items ?? []} />}
      </section>

      <section className="grid items-center gap-8 overflow-hidden rounded-3xl border border-border bg-surface md:grid-cols-[2fr_3fr]">
        <WarmPhoto
          src={owner.photo}
          alt={owner.name ? `${owner.name}, de ${BUSINESS.name}` : `Quién atiende ${BUSINESS.name}`}
          className="aspect-[4/5] w-full md:h-full md:aspect-auto md:min-h-[22rem]"
        />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex flex-col gap-4 px-6 pb-8 md:py-10 md:pr-12 md:pl-0"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-deep">Quién está detrás</span>
          <h2 className="font-display text-3xl text-text sm:text-4xl">
            {owner.name ? `Hola, soy ${owner.name}` : "Elegido con intención"}
          </h2>
          {owner.paragraphs.map((paragraph) => (
            <p key={paragraph} className="leading-relaxed text-text-muted">
              {paragraph}
            </p>
          ))}
        </motion.div>
      </section>

      {affirmations[1] && <Affirmation text={affirmations[1]} />}

      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-3xl text-text">En Instagram</h2>
            <p className="text-sm text-text-muted">Novedades, rituales y lo que va llegando al local.</p>
          </div>
          <a
            href={BUSINESS.instagramUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent3 hover:text-accent3"
          >
            <Instagram className="size-4" /> {BUSINESS.instagramHandle}
          </a>
        </div>
        {instagramPosts.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {instagramPosts.slice(0, 6).map((post) => (
              <a
                key={post.url}
                href={post.url}
                target="_blank"
                rel="noreferrer"
                className="group relative block aspect-square overflow-hidden rounded-2xl"
              >
                <img
                  src={post.image}
                  alt={post.alt}
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-madera-oscura/0 text-crema opacity-0 transition-all group-hover:bg-madera-oscura/40 group-hover:opacity-100">
                  <Instagram className="size-6" />
                </span>
              </a>
            ))}
          </div>
        )}
      </section>

      {(hasAddress || hasHours || hasWhatsApp) && (
        <>
          {affirmations[2] && <Affirmation text={affirmations[2]} />}

          <section className="relative isolate overflow-hidden rounded-3xl px-6 py-14 sm:px-12 sm:py-20">
            <WarmPhoto src={STORE_CONTENT.storePhoto} alt="" className="absolute inset-0 -z-20 size-full" />
            <div className="absolute inset-0 -z-10 bg-madera-oscura/65 md:bg-gradient-to-l md:from-madera-oscura/90 md:via-madera-oscura/65 md:to-madera-oscura/20" />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="ml-auto flex max-w-md flex-col gap-6 text-crema"
            >
              <div className="flex flex-col gap-2">
                <h2 className="font-display text-4xl">Visitanos</h2>
                <p className="text-crema/80">Vení a conocer el local, oler los sahumerios y elegir tus cristales en persona.</p>
              </div>
              <div className="flex flex-col gap-4 text-sm">
                {hasAddress && (
                  <div className="flex gap-3">
                    <MapPin className="mt-0.5 size-5 shrink-0 text-dorado-viejo" />
                    <div>
                      <p className="font-semibold">{BUSINESS.address}</p>
                      <p className="text-crema/75">{BUSINESS.city}</p>
                    </div>
                  </div>
                )}
                {hasHours && (
                  <div className="flex gap-3">
                    <Clock className="mt-0.5 size-5 shrink-0 text-dorado-viejo" />
                    <p className="font-semibold">{BUSINESS.openingHours}</p>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                {isBusinessFieldSet(BUSINESS.mapsUrl) && (
                  <a
                    href={BUSINESS.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-dorado-viejo px-6 py-3 text-sm font-semibold text-madera-oscura transition-colors hover:bg-crema"
                  >
                    Cómo llegar <ArrowRight className="size-4" />
                  </a>
                )}
                {hasWhatsApp && (
                  <a
                    href={BUSINESS.whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-crema/40 px-6 py-3 text-sm font-semibold text-crema backdrop-blur-sm transition-colors hover:bg-crema/10"
                  >
                    <WhatsAppIcon className="size-4" /> Escribinos
                  </a>
                )}
              </div>
            </motion.div>
          </section>
        </>
      )}
    </div>
  );
}
