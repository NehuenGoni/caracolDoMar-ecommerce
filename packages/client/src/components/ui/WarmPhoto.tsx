import { Shell } from "lucide-react";
import { cn } from "@/lib/utils";

interface WarmPhotoProps {
  src: string | null;
  alt: string;
  className?: string;
  /** Recorte de la foto (`object-position`). */
  position?: string;
  loading?: "lazy" | "eager";
}

/**
 * Una foto de la tienda o, mientras no la haya, un fondo de luz cálida en madera, terracota y
 * dorado (con un caracol de marca de agua). Ocupa lo que le dé `className`.
 */
export function WarmPhoto({ src, alt, className, position, loading = "lazy" }: WarmPhotoProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        loading={loading}
        style={position ? { objectPosition: position } : undefined}
        className={cn("object-cover", className)}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        "flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_20%_20%,var(--color-dorado-viejo)_0%,transparent_55%),radial-gradient(circle_at_85%_75%,var(--color-terracota)_0%,transparent_60%),linear-gradient(135deg,var(--color-madera)_0%,var(--color-madera-oscura)_100%)]",
        className,
      )}
    >
      <Shell className="size-1/3 max-h-48 max-w-48 text-crema/15" strokeWidth={1} />
    </div>
  );
}
