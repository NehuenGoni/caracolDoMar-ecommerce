/**
 * Fotos y textos de la tienda que no salen de la base: se editan acá.
 *
 * Las fotos van en `packages/client/public/` y se nombran con la ruta (`/local.jpg`). Con `null` se
 * usa un fondo cálido en su lugar. Según la identidad de la marca: productos sobre madera y
 * estantes con luz natural, sin fondos blancos de estudio.
 */

export interface InstagramPost {
  /** Foto guardada en `public/` (las de Instagram vencen: no usar su URL directa). */
  image: string;
  /** Link al post o reel. */
  url: string;
  alt: string;
}

export const STORE_CONTENT = {
  hero: {
    image: null as string | null,
    eyebrow: "Tienda holística",
    title: "Rituales, aromas y energía para tu hogar",
    text: "Sahumerios, velas, cristales, tarot, estatuas y ropa hindú, elegidos con intención para acompañarte.",
  },

  /** Frases que separan las secciones de la Home (en el orden en que aparecen). */
  affirmations: ["Confía en el proceso", "Sos magia", "Todo lo que buscás también te está buscando"],

  owner: {
    /** Nombre de quien atiende el local. Vacío: no se muestra. */
    name: "",
    photo: null as string | null,
    paragraphs: [
      "Detrás de cada sahumerio, cada vela y cada cristal hay alguien que los elige uno por uno, pensando en para qué te pueden servir.",
      "Si tenés dudas sobre qué elegir o para qué es cada cosa, escribinos: te ayudamos con gusto.",
    ],
  },

  /** Últimos posts para la grilla de la Home. Vacío: se muestra solo el link a la cuenta. */
  instagramPosts: [] as InstagramPost[],

  /** Foto del local para "Visitanos" y para las pantallas de ingreso. */
  storePhoto: null as string | null,
};
