import { formatMoney, type ReportGroupBy, type SalesSeriesPoint } from "@caracol/shared";
import { useState } from "react";
import { useElementWidth } from "@/hooks/useElementWidth";
import { formatCompactPesos, labelEvery, longPeriodLabel, niceScale, shortPeriodLabel } from "@/lib/chartScale";
import { ChartTooltip } from "./ChartTooltip";

export interface ColumnSeries {
  key: "online" | "store";
  label: string;
  /** Variable CSS del color (ver styles/viz.css). */
  color: string;
}

interface StackedColumnChartProps {
  points: SalesSeriesPoint[];
  groupBy: ReportGroupBy;
  series: ColumnSeries[];
  ariaLabel: string;
  height?: number;
}

const MARGIN = { top: 8, right: 8, bottom: 28, left: 56 };
const MAX_BAR = 24; // columnas finas: nunca llenan el casillero
const SEGMENT_GAP = 2; // la separación entre segmentos es aire, no un borde
const ROUND = 4; // solo el extremo de los datos; en la base queda recto

/** Segmento con el extremo superior redondeado y la base recta. */
function roundedTop(x: number, y: number, w: number, h: number): string {
  const r = Math.min(ROUND, h, w / 2);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/**
 * Columnas apiladas por período (online y local). Las dos series SON el tema, así que cada una lleva
 * su color; la leyenda siempre está, y el valor exacto de cada columna sale en el tooltip (también
 * con teclado) y en la tabla del gráfico.
 */
export function StackedColumnChart({ points, groupBy, series, ariaLabel, height = 280 }: StackedColumnChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 1);
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const baseY = MARGIN.top + plotH;
  const band = plotW / Math.max(points.length, 1);
  const barW = Math.min(MAX_BAR, Math.max(2, band * 0.64));

  const maxValue = Math.max(0, ...points.map((p) => p.revenue));
  const { max, ticks } = niceScale(maxValue);
  const scale = (cents: number) => (cents / max) * plotH;
  const every = labelEvery(band, 52);

  const hovered = hover !== null ? points[hover] : undefined;

  return (
    <div>
      <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--viz-text-2)" }}>
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>

      <div ref={ref} className="relative" style={{ height }}>
        <svg width={width} height={height} role="group" aria-label={ariaLabel} className="block overflow-visible">
          {/* grilla: línea fina, sólida y apenas visible */}
          {ticks.map((tick) => {
            const y = baseY - scale(tick);
            return (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={width - MARGIN.right}
                  y1={y}
                  y2={y}
                  stroke={tick === 0 ? "var(--viz-axis)" : "var(--viz-grid)"}
                  strokeWidth={1}
                />
                <text x={MARGIN.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="var(--viz-muted)">
                  {formatCompactPesos(tick)}
                </text>
              </g>
            );
          })}

          {points.map((point, i) => {
            const cx = MARGIN.left + i * band;
            const x = cx + (band - barW) / 2;
            const visible = series.filter((s) => point[s.key] > 0);
            let cursor = baseY;
            const segments = visible.map((s, index) => {
              const h = scale(point[s.key]);
              const isTop = index === visible.length - 1;
              const gap = index > 0 ? SEGMENT_GAP : 0;
              const top = cursor - h;
              const seg = { s, y: top, h: Math.max(h - gap, 1), isTop };
              cursor = top;
              return seg;
            });

            return (
              <g key={point.period}>
                {hover === i && (
                  <rect x={cx} y={MARGIN.top} width={band} height={plotH} fill="var(--viz-grid)" opacity={0.55} />
                )}
                {segments.map(({ s, y, h, isTop }) =>
                  isTop ? (
                    <path key={s.key} d={roundedTop(x, y, barW, h)} fill={s.color} />
                  ) : (
                    <rect key={s.key} x={x} y={y} width={barW} height={h} fill={s.color} />
                  ),
                )}
                {i % every === 0 && (
                  <text x={cx + band / 2} y={baseY + 18} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">
                    {shortPeriodLabel(point.period, groupBy)}
                  </text>
                )}
                {/* La zona de hover es la columna entera del período: más grande que la marca. */}
                <rect
                  x={cx}
                  y={MARGIN.top}
                  width={band}
                  height={plotH + 4}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${longPeriodLabel(point.period, groupBy)}: ${series
                    .map((s) => `${s.label} ${formatMoney(point[s.key])}`)
                    .join(", ")}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((current) => (current === i ? null : current))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((current) => (current === i ? null : current))}
                  className="outline-none focus-visible:stroke-[var(--viz-text-2)]"
                  stroke="none"
                />
              </g>
            );
          })}
        </svg>

        {hovered && hover !== null && (
          <ChartTooltip
            x={MARGIN.left + hover * band + band / 2}
            y={MARGIN.top}
            containerWidth={width}
            title={longPeriodLabel(hovered.period, groupBy)}
            rows={series.map((s) => ({ color: s.color, label: s.label, value: formatMoney(hovered[s.key]) }))}
            total={{ label: "Total", value: formatMoney(hovered.revenue) }}
          />
        )}
      </div>
    </div>
  );
}
