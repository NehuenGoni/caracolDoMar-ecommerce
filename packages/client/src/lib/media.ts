/**
 * Cloudinary devuelve un fotograma del video si se pide la misma URL con extensión de imagen:
 * sirve de portada (y de miniatura) sin tener que subir nada más. Para videos externos no hay
 * forma de saberlo, así que no hay portada.
 */
export function videoPoster(url: string): string | undefined {
  if (!/^https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\//.test(url)) return undefined;
  return url.replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
}

export type MediaItem =
  | { kind: "image"; url: string; alt?: string }
  | { kind: "video"; url: string; poster?: string };

/** La galería de un producto: primero las fotos (en su orden) y después los videos. */
export function buildGallery(product: {
  images: { url: string; alt?: string; order: number }[];
  videos?: { url: string; order: number }[];
}): MediaItem[] {
  const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;
  return [
    ...[...product.images].sort(byOrder).map((i): MediaItem => ({ kind: "image", url: i.url, alt: i.alt })),
    ...[...(product.videos ?? [])]
      .sort(byOrder)
      .map((v): MediaItem => ({ kind: "video", url: v.url, poster: videoPoster(v.url) })),
  ];
}
