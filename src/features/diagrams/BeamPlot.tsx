import { useId } from "react";
import type { BeamLoading, BeamResult } from "@/analysis/beam-cases";
import { useSettings } from "@/app/settings";
import { fmtQ } from "@/lib/units";

/** Same 56…704 plotting range as the shared LineChart. */
export function LoadingSchematic({ loading, compact = false }: { loading: BeamLoading; compact?: boolean }) {
  const { units } = useSettings();
  const id = useId().replace(/:/g, "");
  const sx = (x: number) => 56 + (x / loading.L) * 648;
  const peak = Math.max(...loading.distributed.flatMap((q) => [Math.abs(q.wStart), Math.abs(q.wEnd)]), 1e-12);
  return (
    <svg
      viewBox={`0 0 720 ${compact ? 115 : 155}`}
      className="w-full"
      role="img"
      aria-label="Beam supports and applied loads"
    >
      <defs>
        <marker id={id} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0 0L6 3L0 6Z" fill="var(--accent)" />
        </marker>
      </defs>
      <line x1="56" x2="704" y1="84" y2="84" stroke="var(--steel)" strokeWidth="5" />
      {loading.distributed.map((q, i) => (
        <g key={i} stroke="var(--accent)" fill="none" strokeWidth="1.3">
          <path
            d={`M${sx(q.start)} ${76 - (Math.abs(q.wStart) / peak) * 35}L${sx(q.end)} ${76 - (Math.abs(q.wEnd) / peak) * 35}`}
          />
          {Array.from({ length: 13 }, (_, j) => {
            const x = q.start + ((q.end - q.start) * j) / 12;
            const w = q.wStart + ((q.wEnd - q.wStart) * j) / 12;
            return (
              Math.abs(w) > 1e-12 && (
                <line
                  key={j}
                  x1={sx(x)}
                  x2={sx(x)}
                  y1={w < 0 ? 80 : 76 - (Math.abs(w) / peak) * 35}
                  y2={w < 0 ? 76 - (Math.abs(w) / peak) * 35 : 80}
                  markerEnd={`url(#${id})`}
                />
              )
            );
          })}
          {!compact && (
            <text
              x={(sx(q.start) + sx(q.end)) / 2}
              y="29"
              fill="var(--accent)"
              stroke="none"
              textAnchor="middle"
              fontSize="11"
            >
              {fmtQ(q.wStart, "lineLoad", units)}
              {q.wEnd !== q.wStart ? ` → ${fmtQ(q.wEnd, "lineLoad", units)}` : ""}
            </text>
          )}
        </g>
      ))}
      {loading.points
        .filter((p) => Math.abs(p.P) > 1e-10)
        .map((p, i) => (
          <g key={i}>
            <line
              x1={sx(p.x)}
              x2={sx(p.x)}
              y1={p.P < 0 ? 79 : 12}
              y2={p.P < 0 ? 12 : 79}
              stroke="var(--accent)"
              strokeWidth="2"
              markerEnd={`url(#${id})`}
            />
            {!compact && (
              <text
                x={sx(p.x) + (p.x > loading.L * 0.8 ? -8 : 8)}
                y="14"
                textAnchor={p.x > loading.L * 0.8 ? "end" : "start"}
                fill="var(--accent)"
                fontSize="11"
              >
                {fmtQ(p.P, "force", units)}
              </text>
            )}
          </g>
        ))}
      {loading.supports.map((s, i) => (
        <g key={i} stroke="var(--muted)" fill="var(--surface-2)" strokeWidth="1.5">
          {s.fixed ? (
            <>
              <line x1={sx(s.x)} x2={sx(s.x)} y1="68" y2="105" strokeWidth="3" />
              {[0, 1, 2, 3, 4].map((j) => (
                <line key={j} x1={sx(s.x) - 9} x2={sx(s.x)} y1={76 + j * 7} y2={69 + j * 7} />
              ))}
            </>
          ) : (
            <>
              <path d={`M${sx(s.x)} 88l-9 15h18Z`} />
              {i > 0 && (
                <>
                  <circle cx={sx(s.x) - 5} cy="107" r="2" />
                  <circle cx={sx(s.x) + 5} cy="107" r="2" />
                </>
              )}
            </>
          )}
        </g>
      ))}
      {!compact && (
        <>
          <line x1="56" x2="704" y1="132" y2="132" stroke="var(--line-strong)" />
          <text x="380" y="148" textAnchor="middle" fill="var(--muted)" fontSize="11">
            L = {fmtQ(loading.L, "span", units)} · x from left end
          </text>
        </>
      )}
    </svg>
  );
}
export function BeamDiagrams({ result, deflection = true }: { result: BeamResult; deflection?: boolean }) {
  const { units } = useSettings();
  const rows = [
    { key: "V", title: "Shear V", fn: result.V, max: result.max.V, q: "force", color: "var(--accent)", sign: 1 },
    { key: "M", title: "Moment M", fn: result.M, max: result.max.M, q: "moment", color: "var(--pass)", sign: 1 },
    ...(deflection
      ? [
          {
            key: "delta",
            title: "Deflection Δ",
            fn: result.delta,
            max: result.max.delta,
            q: "length" as const,
            color: "var(--muted)",
            sign: -1,
          },
        ]
      : []),
  ] as const;
  const positions = [
    ...new Set([
      ...Array.from({ length: 181 }, (_, i) => (result.L * i) / 180),
      ...result.breaks.flatMap((x) => [Math.max(0, x - result.L * 1e-8), x]),
      ...rows.map((r) => r.max.x),
    ]),
  ].sort((a, b) => a - b);
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const magnitude = Math.max(Math.abs(row.max.value), 1e-12);
        const sx = (x: number) => 56 + (x / result.L) * 648;
        const sy = (y: number) => 65 - ((row.sign * y) / magnitude) * 38; // deflection (downward positive) is drawn below the axis
        const line = positions.map((x) => `${sx(x)},${sy(row.fn(x))}`).join(" ");
        return (
          <div key={row.key}>
            <div className="flex flex-wrap justify-between gap-1 text-xs">
              <span className="font-medium text-muted">{row.title}</span>
              <span className="num text-ink">
                |max| {fmtQ(Math.abs(row.max.value), row.q, units)} at {fmtQ(row.max.x, "span", units)}
              </span>
            </div>
            <svg
              viewBox="0 0 720 126"
              className="w-full"
              role="img"
              aria-label={`${row.title} diagram; absolute maximum ${fmtQ(Math.abs(row.max.value), row.q, units)}`}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <g key={t}>
                  <line x1={sx(t * result.L)} x2={sx(t * result.L)} y1="12" y2="108" stroke="var(--line)" />
                  <text x={sx(t * result.L)} y="123" fontSize="10" textAnchor="middle" fill="var(--faint)">
                    {fmtQ(t * result.L, "span", units)}
                  </text>
                </g>
              ))}
              <line x1="56" x2="704" y1="65" y2="65" stroke="var(--line-strong)" />
              <polygon points={`56,65 ${line} 704,65`} fill={row.color} fillOpacity=".10" />
              <polyline points={line} fill="none" stroke={row.color} strokeWidth="2" />
              <circle cx={sx(row.max.x)} cy={sy(row.max.value)} r="3.5" fill={row.color}>
                <title>{fmtQ(row.max.value, row.q, units)}</title>
              </circle>
            </svg>
          </div>
        );
      })}
    </div>
  );
}
