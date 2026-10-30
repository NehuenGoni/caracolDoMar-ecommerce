import { useState } from "react";
import { useElementWidth } from "@/hooks/useElementWidth";
import { ChartTooltip } from "./ChartTooltip";

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Texto extra para el tooltip (por ejemplo, "3 ventas"). */
  detail?: string;
}

interface HorizontalBarChartProps {
  rows: BarRow[];
  formatValue: (value: number) => string;
  ariaLabel: string;
  /** Qué mide la barra, para el tooltip ("Ventas"). */
  valueLabel: string;
  color?: string;
}

const BAR_HEIGHT = 12; // fina: nunca llena el casillero

/**
 * Compara una sola medida entre categorías SIN orden natural (medios de pago, rubros): por eso
 * todas las barras son del mismo color — pintarlas más oscuras cuanto más grandes repetiría el
 * largo de la barra con el color. El valor va en la punta de cada barra, el extremo de los datos
 * es redondeado y la base (a la izquierda) es recta. Con una sola serie no hace falta leyenda.
 */
export function HorizontalBarChart({
  rows,
  formatValue,
  ariaLabel,
  valueLabel,
  color = "var(--viz-series-1)",
}: HorizontalBarChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>(480);
  const [hover, setHover] = useState<{ key: string; y: number } | null>(null);

  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((n, r) => n + Math.max(r.value, 0), 0);
  const hoveredRow = hover ? rows.find((r) => r.key === hover.key) : undefined;

  return (
    <div ref={ref} className="relative">
      <ul aria-label={ariaLabel} className="flex flex-col">
        {rows.map((row) => {
          const isHovered = hover?.key === row.key;
          return (
            <li
              key={row.key}
              tabIndex={0}
              aria-label={`${row.label}: ${formatValue(row.value)}${row.detail ? `, ${row.detail}` : ""}`}
              onPointerEnter={(e) => setHover({ key: row.key, y: e.currentTarget.offsetTop })}
              onPointerLeave={() => setHover((current) => (current?.key === row.key ? null : current))}
              onFocus={(e) => setHover({ key: row.key, y: e.currentTarget.offsetTop })}
              onBlur={() => setHover((current) => (current?.key === row.key ? null : current))}
              className="grid grid-cols-[minmax(0,8.5rem)_1fr] items-center gap-3 rounded-lg px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--viz-text-2)]"
              style={{ background: isHovered ? "var(--viz-grid)" : undefined }}
            >
              <span className="truncate text-xs" style={{ color: "var(--viz-text-2)" }} title={row.label}>
                {row.label}
              </span>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <div
                    style={{
                      height: BAR_HEIGHT,
                      width: `${(Math.max(row.value, 0) / max) * 100}%`,
                      minWidth: row.value > 0 ? 2 : 0,
                      background: color,
                      borderRadius: "0 4px 4px 0",
                      filter: isHovered ? "brightness(1.12)" : undefined,
                    }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums" style={{ color: "var(--viz-text)" }}>
                  {formatValue(row.value)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {hoveredRow && hover && (
        <ChartTooltip
          x={width / 2}
          y={Math.max(hover.y - 8, 0)}
          containerWidth={width}
          title={hoveredRow.label}
          rows={[
            { label: valueLabel, value: formatValue(hoveredRow.value) },
            ...(total > 0 ? [{ label: "Del total", value: `${Math.round((hoveredRow.value / total) * 100)}%` }] : []),
            ...(hoveredRow.detail ? [{ label: "Detalle", value: hoveredRow.detail }] : []),
          ]}
        />
      )}
    </div>
  );
}
