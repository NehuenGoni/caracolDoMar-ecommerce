/**
 * Datos legales y de contacto del negocio. Los valores "COMPLETAR" deben
 * reemplazarse con los datos reales antes de publicar las páginas legales.
 */
export const BUSINESS = {
  name: "Caracol do Mar",
  legalName: "COMPLETAR",
  cuit: "COMPLETAR",
  address: "COMPLETAR",
  city: "Buenos Aires, Argentina",
  phone: "COMPLETAR",
  whatsappNumber: "COMPLETAR",
  whatsappUrl: "https://wa.me/COMPLETAR",
  email: "COMPLETAR",
  instagramUrl: "https://www.instagram.com/caracol_do_mar/",
  instagramHandle: "@caracol_do_mar",
  /** Una línea para el pie de página y textos cortos. */
  tagline: "Sahumerios, velas, cristales, tarot, estatuas y ropa hindú, elegidos con intención.",
  /** Días y horarios del local, como se muestran ("Lunes a sábados · 10 a 19 h"). */
  openingHours: "COMPLETAR",
  /** Link de Google Maps al local. */
  mapsUrl: "COMPLETAR",
  consumerDefenseUrl: "https://www.argentina.gob.ar/produccion/defensadelconsumidor",
  /** Días corridos para ejercer el arrepentimiento (Ley 24.240, art. 34). */
  withdrawalDays: 10,
} as const;

/** Si un dato del negocio ya se cargó (los pendientes dicen "COMPLETAR" y no se muestran en la tienda). */
export function isBusinessFieldSet(value: string): boolean {
  return value.trim() !== "" && !value.includes("COMPLETAR");
}
