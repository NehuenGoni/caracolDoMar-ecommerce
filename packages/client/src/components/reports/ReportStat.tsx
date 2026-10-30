import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface ReportStatProps {
  /** En oraciones, sin dos puntos al final. */
  label: string;
  value: string;
  /** La cifra que encabeza la pantalla: va grande. Una sola por vista. */
  hero?: boolean;
  /** Variación contra el período anterior, en %. `undefined` oculta la línea; `null` explica que no hay con qué comparar. */
  delta?: number | null;
  /** Si subir es bueno (ventas, ganancia) o malo (costos). */
  upIsGood?: boolean;
  /** Texto de apoyo debajo ("Margen 60,2%"). */
  hint?: ReactNode;
}

/**
 * El número ES el gráfico: una ficha con la cifra, su variación y una línea de contexto. Cifras
 * proporcionales (no tabulares): un número suelto y grande se ve flojo con dígitos de ancho fijo.
 */
export function ReportStat({ label, value, hero, delta, upIsGood = true, hint }: ReportStatProps) {
  const good = delta !== undefined && delta !== null && (delta === 0 || delta > 0 === upIsGood);

  return (
    <Card className={cn("flex flex-col gap-1.5", hero && "sm:col-span-2")}>
      <p className="text-sm text-text-muted">{label}</p>
      <p className={cn("font-semibold text-text", hero ? "text-5xl leading-tight" : "text-2xl")}>{value}</p>
      {delta !== undefined && (
        <p className="text-xs text-text-muted">
          {delta === null ? (
            "Sin ventas en el período anterior para comparar"
          ) : (
            <>
              {/* La dirección va en un símbolo y en palabras: el color no es lo único que la dice. */}
              <span className={cn("font-semibold", good ? "text-support" : "text-accent2-deep")}>
                {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {delta > 0 ? "+" : ""}
                {delta.toLocaleString("es-AR")}%
              </span>{" "}
              vs. el período anterior
            </>
          )}
        </p>
      )}
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </Card>
  );
}
