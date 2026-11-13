import { fmt } from "@/lib/units";
import { SpecRef } from "@/components/ui";
import { H1_ENVELOPE } from "./member-check";

export function InteractionDiagram({ axial, moment }: { axial: number; moment: number }) {
  const maxX = Math.max(1.1, moment * 1.1),
    maxY = Math.max(1.1, axial * 1.1);
  const x = (v: number) => 62 + (v / maxX) * 430,
    y = (v: number) => 284 - (v / maxY) * 252;
  return (
    <div>
      <svg
        viewBox="0 0 530 335"
        role="img"
        aria-label={`H1 interaction envelope. Design point axial ratio ${fmt(axial)}, combined bending ratio ${fmt(moment)}.`}
        className="mx-auto block w-full max-w-[560px]"
      >
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
          <g key={v}>
            <path d={`M62 ${y(v)}H492 M${x(v)} 32V284`} fill="none" stroke="var(--line)" />
            <text x={53} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {v}
            </text>
            <text x={x(v)} y={302} textAnchor="middle" fontSize="11" fill="var(--muted)">
              {v}
            </text>
          </g>
        ))}
        <path
          d={`M${x(0)} ${y(0)} ${H1_ENVELOPE.map((p) => `L${x(p.x)} ${y(p.y)}`).join(" ")}Z`}
          fill="var(--pass-soft)"
        />
        <polyline
          points={H1_ENVELOPE.map((p) => `${x(p.x)},${y(p.y)}`).join(" ")}
          stroke="var(--accent)"
          strokeWidth={2}
          fill="none"
        />
        <path d={`M62 32V284H492`} fill="none" stroke="var(--muted)" />
        <text x={x(0.35)} y={y(0.75)} fontSize="11" fill="var(--muted)">
          H1-1a
        </text>
        <text x={x(0.7)} y={y(0.08)} fontSize="11" fill="var(--muted)">
          H1-1b
        </text>
        <path d={`M62 ${y(axial)}H${x(moment)}V284`} stroke="var(--ink)" strokeDasharray="4 4" fill="none" />
        <circle cx={x(moment)} cy={y(axial)} r={5} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2} />
        <text
          x={x(moment) > 400 ? x(moment) - 8 : x(moment) + 8}
          y={Math.max(22, y(axial) - 9)}
          textAnchor={x(moment) > 400 ? "end" : "start"}
          fontSize="11"
          fill="var(--ink)"
        >
          Design ({fmt(moment)}, {fmt(axial)})
        </text>
        <text x={277} y={326} textAnchor="middle" fontSize="12" fill="var(--muted)">
          M
          <tspan fontSize="9" dy="3">
            rx
          </tspan>
          <tspan dy="-3">/M</tspan>
          <tspan fontSize="9" dy="3">
            cx
          </tspan>
          <tspan dy="-3"> + M</tspan>
          <tspan fontSize="9" dy="3">
            ry
          </tspan>
          <tspan dy="-3">/M</tspan>
          <tspan fontSize="9" dy="3">
            cy
          </tspan>
        </text>
        <text transform="translate(17 160) rotate(-90)" textAnchor="middle" fontSize="12" fill="var(--muted)">
          P
          <tspan fontSize="9" dy="3">
            r
          </tspan>
          <tspan dy="-3">/P</tspan>
          <tspan fontSize="9" dy="3">
            c
          </tspan>
        </text>
      </svg>
      <p className="text-xs text-muted">
        Shaded region satisfies the H1 envelope. Both moment components use the same LRFD / ASD basis.{" "}
        <SpecRef>Eqs. H1-1a, H1-1b</SpecRef>
      </p>
    </div>
  );
}
