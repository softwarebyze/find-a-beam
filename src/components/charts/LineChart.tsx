/**
 * Minimal, dependency-free SVG line chart with axes, gridlines, hover crosshair and markers.
 * Values are DISPLAY values (convert with toDisplay before passing).
 */
import { useMemo, useRef, useState, type ReactNode } from "react";

export interface Series {
  id: string;
  label: string;
  points: { x: number; y: number }[];
  /** CSS color, defaults to accent palette cycling */
  color?: string;
  dashed?: boolean;
}

export interface Marker {
  x: number;
  y?: number;
  label: string;
  color?: string;
}

const PALETTE = ["var(--accent)", "#e0782a", "#0f8a5f", "#8b5cf6", "#c8322f", "#0891b2"];

function niceTicks(min: number, max: number, count = 6): number[] {
  if (!(max > min)) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? mag * 10;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

export function LineChart({
  series,
  xLabel,
  yLabel,
  height = 300,
  markers = [],
  yMin,
  xMin,
  formatX = (v) => String(v),
  formatY = (v) => String(v),
  legend = true,
  footer,
  fillBelow,
}: {
  series: Series[];
  xLabel: ReactNode;
  yLabel: ReactNode;
  height?: number;
  markers?: Marker[];
  yMin?: number;
  xMin?: number;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  legend?: boolean;
  footer?: ReactNode;
  /** Shade area under the first series (for diagrams) */
  fillBelow?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const W = 720,
    H = height,
    m = { l: 56, r: 16, t: 12, b: 40 };
  const all = series.flatMap((s) => s.points);
  const [x0, x1, y0, y1] = useMemo(() => {
    const xs = all.map((p) => p.x),
      ys = all.map((p) => p.y);
    const lo = Math.min(yMin ?? Infinity, ...ys),
      hi = Math.max(...ys);
    const pad = (hi - lo) * 0.06 || 1;
    return [xMin ?? Math.min(...xs), Math.max(...xs), yMin ?? lo - (lo < 0 ? pad : 0), hi + pad];
  }, [all, yMin, xMin]);
  const sx = (x: number) => m.l + ((x - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const sy = (y: number) => H - m.b - ((y - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);
  const xt = niceTicks(x0, x1, 8),
    yt = niceTicks(y0, y1, 6);
  const color = (s: Series, i: number) => s.color ?? PALETTE[i % PALETTE.length]!;

  const nearest = (s: Series, x: number) =>
    s.points.reduce((a, p) => (Math.abs(p.x - x) < Math.abs(a.x - x) ? p : a), s.points[0]!);

  return (
    <div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
        onMouseMove={(e) => {
          const r = ref.current!.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const x = x0 + ((px - m.l) / (W - m.l - m.r)) * (x1 - x0);
          setHoverX(x >= x0 && x <= x1 ? x : null);
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        {yt.map((t) => (
          <g key={`y${t}`}>
            <line x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--line)" />
            <text x={m.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--faint)" className="num">
              {formatY(t)}
            </text>
          </g>
        ))}
        {xt.map((t) => (
          <g key={`x${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={m.t} y2={H - m.b} stroke="var(--line)" strokeOpacity={0.6} />
            <text x={sx(t)} y={H - m.b + 16} textAnchor="middle" fontSize="11" fill="var(--faint)" className="num">
              {formatX(t)}
            </text>
          </g>
        ))}
        {y0 < 0 && y1 > 0 && <line x1={m.l} x2={W - m.r} y1={sy(0)} y2={sy(0)} stroke="var(--line-strong)" />}
        <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" fontSize="11.5" fill="var(--muted)">
          {xLabel}
        </text>
        <text
          transform={`translate(13 ${(m.t + H - m.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="11.5"
          fill="var(--muted)"
        >
          {yLabel}
        </text>
        {fillBelow && series[0] && (
          <path
            d={`M${sx(series[0].points[0]!.x)},${sy(Math.max(0, y0))} ${series[0].points.map((p) => `L${sx(p.x)},${sy(p.y)}`).join(" ")} L${sx(series[0].points.at(-1)!.x)},${sy(Math.max(0, y0))} Z`}
            fill={color(series[0], 0)}
            fillOpacity={0.12}
          />
        )}
        {series.map((s, i) => (
          <polyline
            key={s.id}
            fill="none"
            stroke={color(s, i)}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            strokeLinejoin="round"
            points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")}
          />
        ))}
        {markers.map((mk, i) => (
          <g key={i}>
            <line
              x1={sx(mk.x)}
              x2={sx(mk.x)}
              y1={m.t}
              y2={H - m.b}
              stroke={mk.color ?? "var(--faint)"}
              strokeDasharray="3 3"
            />
            <text x={sx(mk.x) + 4} y={m.t + 11} fontSize="10.5" fill={mk.color ?? "var(--muted)"}>
              {mk.label}
            </text>
            {mk.y !== undefined && <circle cx={sx(mk.x)} cy={sy(mk.y)} r={3.5} fill={mk.color ?? "var(--ink)"} />}
          </g>
        ))}
        {hoverX !== null && (
          <g pointerEvents="none">
            <line x1={sx(hoverX)} x2={sx(hoverX)} y1={m.t} y2={H - m.b} stroke="var(--muted)" strokeOpacity={0.5} />
            {series.map((s, i) => {
              const p = nearest(s, hoverX);
              return (
                <circle
                  key={s.id}
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={3.5}
                  fill={color(s, i)}
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                />
              );
            })}
          </g>
        )}
      </svg>
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-xs">
        {legend && (
          <div className="flex flex-wrap gap-3">
            {series.map((s, i) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 text-muted">
                <span className="inline-block h-0.5 w-4 rounded" style={{ background: color(s, i) }} />
                {s.label}
              </span>
            ))}
          </div>
        )}
        {hoverX !== null ? (
          <div className="num text-muted">
            {formatX(nearest(series[0]!, hoverX).x)} ·{" "}
            {series.map((s) => `${s.label}: ${formatY(nearest(s, hoverX).y)}`).join(" · ")}
          </div>
        ) : (
          footer
        )}
      </div>
    </div>
  );
}
