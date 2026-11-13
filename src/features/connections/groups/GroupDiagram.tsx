import { useId } from "react";
import type { GroupAnalysis } from "@/aisc/connections/groups";
import type { BoltCoord, WeldSegment } from "@/aisc/connections/types";
import { useSettings } from "@/app/settings";
import { fmtQ } from "@/lib/units";

export function GroupDiagram({
  analysis,
  bolts,
  segments,
  ex,
  angle,
}: {
  analysis: GroupAnalysis;
  bolts?: BoltCoord[];
  segments?: WeldSegment[];
  ex: number;
  angle: number;
}) {
  const { units } = useSettings(),
    id = useId().replaceAll(":", "");
  const points =
    bolts ??
    segments?.flatMap((s) => [
      { x: s.x1, y: s.y1 },
      { x: s.x2, y: s.y2 },
    ]) ??
    [];
  const local = points.map((p) => ({ x: p.x - analysis.centroid.x, y: p.y - analysis.centroid.y }));
  const a = (angle * Math.PI) / 180,
    dir = { x: Math.sin(a), y: -Math.cos(a) },
    load = { x: ex * Math.cos(a), y: ex * Math.sin(a) };
  const span = Math.max(2, ...local.map((p) => Math.hypot(p.x, p.y)), Math.abs(ex));
  const showIC = analysis.ic && Math.hypot(analysis.ic.x, analysis.ic.y) < 4 * span;
  const plot = [...local, load, { x: 0, y: 0 }, ...(showIC && analysis.ic ? [analysis.ic] : [])];
  const maxX = Math.max(...plot.map((p) => Math.abs(p.x)), span),
    maxY = Math.max(...plot.map((p) => Math.abs(p.y)), span);
  const scale = Math.min(190 / maxX, 125 / maxY),
    x = (v: number) => 260 + v * scale,
    y = (v: number) => 170 - v * scale;
  const maxForce = Math.max(...analysis.forces.map((p) => Math.hypot(p.fx, p.fy)), 1e-9);
  const vectors = analysis.forces.filter(
    (_, i) => bolts || i % Math.max(1, Math.floor(analysis.forces.length / 24)) === 0,
  );
  return (
    <div>
      <svg
        viewBox="0 0 520 350"
        role="img"
        aria-label={`${bolts ? "Bolt" : "Weld"} group, load line, centroid, instantaneous center and force vectors`}
        className="w-full rounded-lg border border-line bg-surface-2 text-muted"
      >
        <defs>
          <marker id={`${id}force`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
            <path d="M0,0 L5,2.5 L0,5" fill="currentColor" />
          </marker>
        </defs>
        <line x1="25" y1={y(0)} x2="495" y2={y(0)} stroke="currentColor" opacity=".15" />
        <line x1={x(0)} y1="20" x2={x(0)} y2="320" stroke="currentColor" opacity=".15" />
        {segments?.map((s, i) => (
          <line
            key={i}
            x1={x(s.x1 - analysis.centroid.x)}
            y1={y(s.y1 - analysis.centroid.y)}
            x2={x(s.x2 - analysis.centroid.x)}
            y2={y(s.y2 - analysis.centroid.y)}
            className="stroke-accent"
            strokeWidth="5"
            strokeLinecap="round"
          />
        ))}
        {local.map((p, i) =>
          bolts ? (
            <circle key={i} cx={x(p.x)} cy={y(p.y)} r="5" className="fill-surface stroke-ink" strokeWidth="1.5" />
          ) : null,
        )}
        <g className="text-accent" stroke="currentColor" strokeWidth="1.2">
          {vectors.map((p, i) => (
            <line
              key={i}
              x1={x(p.x)}
              y1={y(p.y)}
              x2={x(p.x) + (p.fx / maxForce) * 25}
              y2={y(p.y) - (p.fy / maxForce) * 25}
              markerEnd={`url(#${id}force)`}
            />
          ))}
        </g>
        <g className="text-ink" stroke="currentColor">
          <line
            x1={x(load.x - dir.x * span)}
            y1={y(load.y - dir.y * span)}
            x2={x(load.x + dir.x * span)}
            y2={y(load.y + dir.y * span)}
            strokeDasharray="5 4"
            opacity=".5"
          />
          <line
            x1={x(load.x - dir.x * span * 0.65)}
            y1={y(load.y - dir.y * span * 0.65)}
            x2={x(load.x)}
            y2={y(load.y)}
            strokeWidth="2"
            markerEnd={`url(#${id}force)`}
          />
        </g>
        <path d={`M${x(0) - 5},${y(0)}h10 M${x(0)},${y(0) - 5}v10`} className="stroke-ink" strokeWidth="2" />
        <text x={x(0) + 8} y={y(0) - 9} fill="currentColor" fontSize="11">
          Centroid
        </text>
        {showIC && analysis.ic && (
          <g className="text-warn">
            <circle
              cx={x(analysis.ic.x)}
              cy={y(analysis.ic.y)}
              r="5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <text x={x(analysis.ic.x) + 8} y={y(analysis.ic.y) - 8} fill="currentColor" fontSize="11">
              IC
            </text>
          </g>
        )}
        <text x="16" y="335" fill="currentColor" fontSize="11">
          e = {fmtQ(ex, "length", units)} · angle = {angle}° from vertical
        </text>
      </svg>
      <p className="mt-2 text-xs text-muted">
        Accent arrows show relative element forces.{" "}
        {analysis.ic
          ? `${showIC ? "" : "IC lies outside the plotted area. "}IC from centroid: (${fmtQ(analysis.ic.x, "length", units)}, ${fmtQ(analysis.ic.y, "length", units)}).`
          : analysis.method === "IC"
            ? "Pure translation: IC is at infinity."
            : "Elastic force distribution."}
      </p>
    </div>
  );
}
