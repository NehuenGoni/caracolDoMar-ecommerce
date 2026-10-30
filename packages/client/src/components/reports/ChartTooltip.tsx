export interface TooltipRow {
  /** Color de la serie: se muestra como una línea corta, no como una caja. */
  color?: string;
  label: string;
  value: string;
}

interface ChartTooltipProps {
  /** Posición, en px, dentro del contenedor relativo del gráfico. */
  x: number;
  y: number;
  /** Ancho del contenedor: para que el tooltip no se salga por los costados. */
  containerWidth: number;
  title: string;
  rows: TooltipRow[];
  /** Una última línea destacada (por ejemplo, el total). */
  total?: TooltipRow;
}

const WIDTH = 200;

/**
 * Un solo tooltip con todas las series de esa posición. Primero el valor (alto contraste) y después
 * el nombre; cada serie con su línea de color. Nunca es la única forma de ver un dato: todo está
 * también en la tabla del gráfico. El texto entra como hijo de React (nunca como HTML).
 */
export function ChartTooltip({ x, y, containerWidth, title, rows, total }: ChartTooltipProps) {
  const left = Math.min(Math.max(x, WIDTH / 2 + 4), Math.max(containerWidth - WIDTH / 2 - 4, WIDTH / 2 + 4));

  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 rounded-xl border px-3 py-2.5 text-xs shadow-lg"
      style={{
        left,
        top: y,
        width: WIDTH,
        transform: "translateX(-50%)",
        background: "var(--viz-surface)",
        borderColor: "var(--viz-border)",
        color: "var(--viz-text)",
      }}
    >
      <p className="mb-1.5 font-medium" style={{ color: "var(--viz-text-2)" }}>
        {title}
      </p>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2" style={{ color: "var(--viz-text-2)" }}>
              {row.color && (
                <span aria-hidden className="h-[3px] w-3 shrink-0 rounded-full" style={{ background: row.color }} />
              )}
              {row.label}
            </span>
            <span className="font-semibold tabular-nums" style={{ color: "var(--viz-text)" }}>
              {row.value}
            </span>
          </li>
        ))}
      </ul>
      {total && (
        <div
          className="mt-1.5 flex items-center justify-between gap-3 border-t pt-1.5"
          style={{ borderColor: "var(--viz-grid)" }}
        >
          <span style={{ color: "var(--viz-text-2)" }}>{total.label}</span>
          <span className="font-semibold tabular-nums">{total.value}</span>
        </div>
      )}
    </div>
  );
}
