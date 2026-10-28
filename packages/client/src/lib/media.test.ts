import { describe, expect, it } from "vitest";
import { buildGallery, videoPoster } from "./media";

describe("videoPoster", () => {
  it("usa un fotograma de Cloudinary como portada", () => {
    expect(videoPoster("https://res.cloudinary.com/caracol/video/upload/v12/caracol/products/reel.mp4")).toBe(
      "https://res.cloudinary.com/caracol/video/upload/v12/caracol/products/reel.jpg",
    );
  });

  it("no inventa portada para videos externos ni para imágenes", () => {
    expect(videoPoster("https://example.com/reel.mp4")).toBeUndefined();
    expect(videoPoster("https://res.cloudinary.com/caracol/image/upload/v1/foto.jpg")).toBeUndefined();
  });
});

describe("buildGallery", () => {
  it("pone las fotos primero y los videos al final, cada grupo en su orden", () => {
    const gallery = buildGallery({
      images: [
        { url: "b.jpg", order: 1 },
        { url: "a.jpg", order: 0, alt: "Frente" },
      ],
      videos: [
        { url: "https://example.com/2.mp4", order: 1 },
        { url: "https://example.com/1.mp4", order: 0 },
      ],
    });
    expect(gallery.map((m) => `${m.kind}:${m.url}`)).toEqual([
      "image:a.jpg",
      "image:b.jpg",
      "video:https://example.com/1.mp4",
      "video:https://example.com/2.mp4",
    ]);
    expect(gallery[0]).toMatchObject({ alt: "Frente" });
  });

  it("funciona sin videos", () => {
    expect(buildGallery({ images: [{ url: "a.jpg", order: 0 }] })).toHaveLength(1);
    expect(buildGallery({ images: [] })).toEqual([]);
  });
});
