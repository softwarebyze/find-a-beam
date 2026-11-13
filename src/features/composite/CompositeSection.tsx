/**
 * To-scale composite section: effective slab width, deck, steel W-shape, anchors, plastic neutral axis,
 * concrete compression block, and the plastic stress distribution (§I3.2a) drawn beside it.
 * Very wide slabs are drawn broken (true width is dimensioned).
 */
import { useMemo } from "react";
import { useSettings } from "@/app/settings";
import type { CompositeDesign, SlabGeometry, StudSpec } from "@/aisc/composite";
import { req } from "@/data/shapes";
import { sectionGeometry, sectionPath } from "@/features/drawings/geometry";
import { fmtQ } from "@/lib/units";

const VW = 760;
const FONT = 10.5;

export function CompositeSection({
  design,
  slab,
  stud,
}: {
  design: CompositeDesign;
  slab: SlabGeometry;
  stud: StudSpec;
}) {
  const { units } = useSettings();
  const shape = design.shape;
  const g = useMemo(() => sectionGeometry(shape), [shape]);
  const d = req(shape, "d"),
    bf = req(shape, "bf");
  const flex = design.composite.flexure,
    p = flex.plastic;
  const b = design.width.b,
    Ycon = design.Ycon,
    H = Ycon + d;
  const shown = Math.min(b, Math.max(3.2 * H, 4 * bf));
  const broken = shown < b - 1e-6;
  const ml = 64,
    mt = 34,
    stressW = 280;
  const k = Math.min((VW - ml - 24 - stressW) / shown, 300 / H);
  const cx = ml + (shown * k) / 2,
    x0 = cx - (shown * k) / 2,
    x1 = cx + (shown * k) / 2;
  const y0 = mt,
    yTop = y0 + Ycon * k,
    yBot = yTop + d * k,
    yTc = y0 + slab.tc * k;
  const yPna = p.pna === "slab" ? y0 + flex.a * k : yTop + p.Y1 * k;
  const VH = yBot + 30;
  const xs = x1 + 86; // stress diagram axis
  const blockW = 46;

  // Deck profile for ribs parallel (ribs centered on the beam).
  const ribs: string[] = [];
  if (slab.kind === "deck-parallel") {
    const top = slab.wr * 1.15,
      bot = slab.wr * 0.85;
    const nSide = Math.ceil(shown / 2 / slab.pitch) + 1;
    for (let j = -nSide; j <= nSide; j++) {
      const c = cx + j * slab.pitch * k;
      const pts = [
        [c - (top * k) / 2, yTc],
        [c - (bot * k) / 2, yTop],
        [c + (bot * k) / 2, yTop],
        [c + (top * k) / 2, yTc],
      ];
      ribs.push(`M${pts.map(([x, y]) => `${x!.toFixed(2)} ${y!.toFixed(2)}`).join("L")}Z`);
    }
  }

  const per = Math.max(1, Math.round(stud.perGroup));
  const studXs = Array.from({ length: per }, (_, i) => cx + (i - (per - 1) / 2) * 4 * stud.d * k);
  const zig = (x: number) => {
    const h = yTop - y0,
      s = 4;
    return `M${x} ${y0 - 6}L${x} ${y0 + h * 0.3}L${x - s} ${y0 + h * 0.42}L${x + s} ${y0 + h * 0.58}L${x} ${y0 + h * 0.7}L${x} ${yTop + 6}`;
  };
  const text = { fontSize: FONT, fill: "var(--muted)", fontFamily: "var(--font-sans)" } as const;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Composite section: ${shape.label} with ${fmtQ(b, "length", units)} effective slab width`}
    >
      <defs>
        <clipPath id="cmp-slab">
          <rect x={x0} y={y0 - 1} width={x1 - x0} height={yTop - y0 + 2} />
        </clipPath>
        <pattern id="cmp-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.55" />
        </pattern>
      </defs>
      {/* Slab */}
      <g clipPath="url(#cmp-slab)">
        <rect x={x0} y={y0} width={x1 - x0} height={slab.tc * k} fill="var(--surface-2)" stroke="var(--line-strong)" />
        {slab.kind === "deck-perpendicular" && (
          <>
            <rect x={x0} y={yTc} width={x1 - x0} height={yTop - yTc} fill="var(--surface-2)" opacity={0.45} />
            <line x1={x0} x2={x1} y1={yTc} y2={yTc} stroke="var(--steel)" strokeDasharray="5 3" />
            <line x1={x0} x2={x1} y1={yTop} y2={yTop} stroke="var(--steel)" strokeDasharray="5 3" />
          </>
        )}
        {slab.kind === "deck-parallel" &&
          ribs.map((r, i) => <path key={i} d={r} fill="var(--surface-2)" stroke="var(--steel)" strokeWidth={1} />)}
        {/* Concrete compression block a */}
        <rect
          x={x0}
          y={y0}
          width={x1 - x0}
          height={flex.a * k}
          fill="url(#cmp-hatch)"
          stroke="var(--accent)"
          strokeWidth={0.8}
        />
      </g>
      {broken && (
        <g fill="none" stroke="var(--muted)" strokeWidth={1}>
          <path d={zig(x0)} />
          <path d={zig(x1)} />
        </g>
      )}
      {/* Steel section */}
      <path
        d={sectionPath(g, { k, dx: cx - (g.width * k) / 2, dy: yTop })}
        fillRule="evenodd"
        fill="var(--steel-fill)"
        stroke="var(--steel)"
        strokeWidth={1}
      />
      {/* Anchors */}
      {studXs.map((x, i) => (
        <g key={i} fill="var(--steel)">
          <rect x={x - (stud.d * k) / 2} y={yTop - stud.length * k} width={stud.d * k} height={stud.length * k} />
          <rect
            x={x - (stud.d * 1.6 * k) / 2}
            y={yTop - stud.length * k}
            width={stud.d * 1.6 * k}
            height={Math.max(1.5, 0.375 * k)}
          />
        </g>
      ))}
      {/* PNA */}
      <line
        x1={x0 - 8}
        x2={xs + (p.Cs > 0 ? blockW + 4 : 0)}
        y1={yPna}
        y2={yPna}
        stroke="var(--accent)"
        strokeWidth={1.2}
        strokeDasharray="7 3 2 3"
      />
      <text x={x1 + 8} y={yPna - 4} {...text} fill="var(--accent)" fontWeight={600}>
        PNA
      </text>
      {/* Width dimension */}
      <g stroke="var(--dim)" strokeWidth={0.8}>
        <line x1={x0} x2={x1} y1={y0 - 14} y2={y0 - 14} />
        <line x1={x0} x2={x0} y1={y0 - 19} y2={y0 - 3} />
        <line x1={x1} x2={x1} y1={y0 - 19} y2={y0 - 3} />
      </g>
      <text x={cx} y={y0 - 18} textAnchor="middle" {...text} fill="var(--dim)">
        b = {fmtQ(b, "length", units)}
        {broken ? " (slab shown broken)" : ""}
      </text>
      {/* Left dimensions: slab depth and steel depth */}
      <VDim x={x0 - 22} ya={y0} yb={yTop} label={fmtQ(Ycon, "length", units)} />
      <VDim x={x0 - 22} ya={yTop} yb={yBot} label={`d = ${fmtQ(d, "length", units)}`} />
      {/* Stress distribution */}
      <line x1={xs} x2={xs} y1={y0} y2={yBot} stroke="var(--ink)" strokeWidth={1} />
      <line
        x1={xs - blockW - 6}
        x2={xs + blockW + 6}
        y1={yTop}
        y2={yTop}
        stroke="var(--line-strong)"
        strokeDasharray="2 2"
      />
      <rect x={xs - blockW} y={y0} width={blockW} height={flex.a * k} fill="url(#cmp-hatch)" stroke="var(--accent)" />
      <text x={xs + blockW + 6} y={y0 + Math.max(flex.a * k, 9) / 2 + 3.5} {...text}>
        0.85f′c · C = {fmtQ(p.C, "force", units)}
      </text>
      {p.Cs > 0 && (
        <>
          <rect
            x={xs - blockW}
            y={yTop}
            width={blockW}
            height={yPna - yTop}
            fill="var(--accent)"
            fillOpacity={0.35}
            stroke="var(--accent)"
          />
          <text x={xs + blockW + 6} y={yTop + Math.max(yPna - yTop, 9) / 2 + 3.5} {...text}>
            Fy · Cs = {fmtQ(p.Cs, "force", units)}
          </text>
        </>
      )}
      <rect
        x={xs}
        y={Math.max(yPna, yTop)}
        width={blockW}
        height={yBot - Math.max(yPna, yTop)}
        fill="var(--warn)"
        fillOpacity={0.25}
        stroke="var(--warn)"
      />
      <text x={xs + blockW + 6} y={(Math.max(yPna, yTop) + yBot) / 2 + 3.5} {...text}>
        Fy · T = {fmtQ(p.T, "force", units)}
      </text>
      <text x={xs} y={VH - 8} textAnchor="middle" {...text}>
        Plastic stress distribution
      </text>
    </svg>
  );
}

function VDim({ x, ya, yb, label }: { x: number; ya: number; yb: number; label: string }) {
  return (
    <g>
      <g stroke="var(--dim)" strokeWidth={0.8}>
        <line x1={x} x2={x} y1={ya} y2={yb} />
        <line x1={x - 4} x2={x + 4} y1={ya} y2={ya} />
        <line x1={x - 4} x2={x + 4} y1={yb} y2={yb} />
      </g>
      <text
        x={x - 5}
        y={(ya + yb) / 2}
        textAnchor="middle"
        transform={`rotate(-90 ${x - 5} ${(ya + yb) / 2})`}
        fontSize={FONT}
        fill="var(--dim)"
        fontFamily="var(--font-sans)"
      >
        {label}
      </text>
    </g>
  );
}
