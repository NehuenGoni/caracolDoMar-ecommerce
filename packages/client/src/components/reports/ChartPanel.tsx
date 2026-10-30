import { Download, Table2, BarChart3 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ChartPanelProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** La misma información como tabla: todo gráfico tiene su gemelo accesible. */
  table?: ReactNode;
  /** Descargar los datos (CSV). */
  onExport?: () => void | Promise<void>;
  isExporting?: boolean;
  /** Mientras se vuelve a pedir, se conserva lo anterior a media opacidad: sin parpadeos ni saltos. */
  isRefreshing?: boolean;
  className?: string;
}

/** Marco de un gráfico: título, vista de gráfico/tabla y exportación. Define la superficie de los colores del gráfico. */
export function ChartPanel({
  title,
  subtitle,
  children,
  table,
  onExport,
  isExporting,
  isRefreshing,
  className,
}: ChartPanelProps) {
  const [showTable, setShowTable] = useState(false);
  const bodyId = useId();

  const actionClass =
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors hover:bg-[var(--viz-grid)] disabled:opacity-50";

  return (
    <section
      className={cn("viz-root rounded-2xl border p-5", className)}
      style={{ borderColor: "var(--viz-border)" }}
      aria-busy={isRefreshing || undefined}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg" style={{ color: "var(--viz-text)" }}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs" style={{ color: "var(--viz-text-2)" }}>
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {table && (
            <button
              type="button"
              aria-pressed={showTable}
              aria-controls={bodyId}
              onClick={() => setShowTable((value) => !value)}
              className={actionClass}
              style={{ borderColor: "var(--viz-border)", color: "var(--viz-text-2)" }}
            >
              {showTable ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
              {showTable ? "Ver gráfico" : "Ver como tabla"}
            </button>
          )}
          {onExport && (
            <button
              type="button"
              onClick={() => void onExport()}
              disabled={isExporting}
              className={actionClass}
              style={{ borderColor: "var(--viz-border)", color: "var(--viz-text-2)" }}
            >
              <Download className="size-3.5" /> {isExporting ? "Descargando…" : "CSV"}
            </button>
          )}
        </div>
      </div>

      <div id={bodyId} className={cn("transition-opacity", isRefreshing && "opacity-60")}>
        {showTable && table ? <div className="overflow-x-auto">{table}</div> : children}
      </div>
    </section>
  );
}
