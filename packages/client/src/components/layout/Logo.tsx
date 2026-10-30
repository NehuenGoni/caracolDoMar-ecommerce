import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-3xl",
};

/**
 * Logotipo tipográfico. Cuando esté el logo de Caracol en `public/`, se puede volver a una imagen
 * (en oscuro va a necesitar su versión clara).
 */
export function Logo({ size = "md", className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap font-display leading-none text-text", SIZES[size], className)}>
      <span className="font-semibold tracking-tight">Caracol</span>
      <span className="font-affirmation text-[0.8em] text-accent-deep">do Mar</span>
    </span>
  );
}
