import {
  boltBearing,
  boltShear,
  elementShearRupture,
  elementShearYielding,
  minEdgeDistance,
  minSpacing,
  nominalHoleDiameter,
  type BoltGroup,
  type BoltSpec,
  type HoleType,
  type ThreadCondition,
} from "@/aisc/connections";
import { analyzeBoltGroup, analyzeWeldGroup, type GroupAnalysis } from "@/aisc/connections/groups";
import { available } from "@/aisc/common";
import { useSettings } from "@/app/settings";
import { Badge, Card, NumberInput, PageHeader, QuantityInput, RatioBar, Select, SpecRef, Stat } from "@/components/ui";
import { StepRow } from "@/components/CalcReport";
import { useQueryState } from "@/features/column/url-state";
import { fmt, fmtQ } from "@/lib/units";

const ANGLE_OPTIONS = [0, 15, 30, 45, 60, 75, 90].map((a) => ({ value: String(a), label: `${a}°` }));

function boltGrid(rows: number, cols: number, pitch: number, gage: number) {
  const bolts: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      bolts.push({ x: (c - (cols - 1) / 2) * gage, y: (r - (rows - 1) / 2) * pitch });
  return bolts;
}

function weldSegments(height: number, width: number) {
  const h = height / 2,
    w = width / 2;
  return [
    { x1: -w, y1: -h, x2: -w, y2: h },
    { x1: -w, y1: -h, x2: w, y2: -h },
    { x1: w, y1: -h, x2: w, y2: h },
  ];
}

function Detail({
  rows,
  cols,
  pitch,
  gage,
  height,
  width,
  thickness,
  eccentricity,
  angle,
  load,
}: {
  rows: number;
  cols: number;
  pitch: number;
  gage: number;
  height: number;
  width: number;
  thickness: number;
  eccentricity: number;
  angle: number;
  load: number;
}) {
  const scale = Math.min(250 / Math.max(height, 24), 300 / Math.max(width + Math.abs(eccentricity), 24), 24);
  const x0 = 90,
    y0 = 40,
    w = Math.max(18, width * scale),
    h = Math.max(60, height * scale);
  const cx = x0 + w / 2,
    cy = y0 + h / 2;
  const grid = boltGrid(rows, cols, pitch, gage);
  const loadDir = (angle * Math.PI) / 180;
  const ax = cx + Math.sin(loadDir) * eccentricity * scale,
    ay = cy - Math.cos(loadDir) * eccentricity * scale;
  const arrow = 34;
  const tipX = ax - Math.sin(loadDir) * arrow,
    tipY = ay + Math.cos(loadDir) * arrow;
  return (
    <svg viewBox="0 0 440 360" role="img" aria-label="Bracket plate elevation with bolt group, welds and eccentric load" className="w-full max-h-96 text-ink">
      <rect x={x0} y={y0} width={w} height={h} fill="var(--surface-2)" stroke="var(--steel)" strokeWidth="1.5" />
      <rect x={x0 - 18} y={y0 - 14} width={10} height={h + 28} fill="var(--steel-fill)" stroke="var(--steel)" />
      <g fill="var(--surface)" stroke="var(--steel)" strokeWidth="1.4">
        {grid.map((b, i) => (
          <circle key={i} cx={cx + b.x * scale} cy={cy - b.y * scale} r={Math.max(3.4, 0.45 * scale * (0.75 / 1))} />
        ))}
      </g>
      <g stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round">
        <line x1={x0 + 1} y1={y0 + 6} x2={x0 + 1} y2={y0 + h - 6} />
        <line x1={x0 + 6} y1={y0 + h} x2={x0 + w - 6} y2={y0 + h} />
        <line x1={x0 + w - 1} y1={y0 + 6} x2={x0 + w - 1} y2={y0 + h - 6} />
      </g>
      <g stroke="var(--ink)" strokeWidth="1.6" fill="none">
        <line x1={ax} y1={ay} x2={tipX} y2={tipY} />
        <path d={`M${tipX - 5} ${tipY + 9} L${tipX} ${tipY} L${tipX + 5} ${tipY + 9}`} fill="var(--ink)" />
      </g>
      <g fill="var(--muted)" fontSize="10" fontFamily="var(--font-mono, monospace)">
        <text x={ax + 6} y={ay - 6}>P = {fmt(load)} kip</text>
        <text x={cx - 22} y={y0 + h + 44}>e = {fmt(eccentricity, 2)} in</text>
        <line x1={cx} y1={y0 + h + 26} x2={ax} y2={y0 + h + 26} stroke="var(--line-strong)" strokeDasharray="3 3" />
        <text x={x0 + w / 2 - 18} y={y0 + h + 66}>H = {fmt(height, 2)} in</text>
        <text x={x0 + w / 2 - 18} y={y0 - 18}>B = {fmt(width, 2)} in</text>
        <text x={x0 + w + 8} y={y0 + h / 2}>t = {fmt(thickness, 2)} in</text>
      </g>
    </svg>
  );
}

export function BracketPage() {
  const q = useQueryState(),
    { method, units } = useSettings();

  const rows = Math.max(1, Math.round(q.numOr("rows", 3))),
    cols = Math.max(1, Math.round(q.numOr("cols", 2))),
    pitch = q.numOr("pitch", 3),
    gage = q.numOr("gage", 3),
    plateHeight = q.numOr("H", 12),
    plateWidth = q.numOr("B", 8),
    plateThickness = q.numOr("t", 0.5),
    edge = q.numOr("edge", 1.5),
    eccentricity = q.numOr("e", 8),
    angle = q.numOr("angle", 0),
    load = q.numOr("P", 20),
    weldSize = q.numOr("weld", 0.25),
    FEXX = q.numOr("FEXX", 70),
    boltD = q.numOr("boltD", 0.75),
    boltGroup = q.str("boltGroup", "A") as BoltGroup,
    threads = q.str("threads", "N") as ThreadCondition,
    hole = q.str("hole", "STD") as HoleType,
    Fy = q.numOr("Fy", 50),
    Fu = q.numOr("Fu", 65),
    groupMethod = q.str("groupMethod", "IC") === "elastic" ? "elastic" : "IC",
    includeWeld = q.bool("weldCheck", true);

  const bolt: BoltSpec = { d: boltD, group: boltGroup, threads };
  const bolts = boltGrid(rows, cols, pitch, gage);
  const dh = nominalHoleDiameter(boltD, hole);
  const clearAtEdge = Math.max(0, edge - dh / 2);
  const clearAtPitch = Math.max(0, Math.min(pitch, gage) - dh);

  const checks: { id: string; label: string; ratio: number; capacity: number; ref: string; ok: boolean }[] = [];
  const steps: { label: string; symbol?: string; value: number; quantity?: string; expr?: string; ref?: string }[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  let boltAnalysis: GroupAnalysis | undefined;
  let weldAnalysis: GroupAnalysis | undefined;

  try {
    boltAnalysis = analyzeBoltGroup({ bolts, ex: eccentricity, angle, method: groupMethod });
    const single = boltShear({ bolt, planes: 1 });
    const perBolt = available(single, method);
    const capacity = Math.max(1e-9, boltAnalysis.C * perBolt);
    checks.push({
      id: "bolt-group",
      label: "Bolt group — eccentric shear",
      ratio: load / capacity,
      capacity,
      ref: "Manual Part 7 · Eq. J3-1",
      ok: load <= capacity + 1e-9,
    });
    steps.push({
      label: "Bolt group coefficient C",
      symbol: "C",
      value: boltAnalysis.C,
      quantity: "",
      expr: `${groupMethod} method · ${rows}×${cols} pattern · e = ${fmt(eccentricity, 2)} in at ${angle}°`,
      ref: "Manual Part 7",
    });
    steps.push({
      label: "Available strength per bolt",
      symbol: "φR{n}",
      value: perBolt,
      quantity: "force",
      expr: `single shear on A{b}, threads ${threads === "N" ? "included" : "excluded"}`,
      ref: "Eq. J3-1",
    });

    const bearing = boltBearing({ d: boltD, t: plateThickness, Fu, lc: Math.min(clearAtEdge, clearAtPitch), holeType: hole });
    const perBoltBearing = available(bearing, method);
    const bearingCapacity = perBoltBearing * bolts.length;
    checks.push({
      id: "bearing",
      label: "Bearing and tearout at bolt holes",
      ratio: load / Math.max(1e-9, bearingCapacity),
      capacity: bearingCapacity,
      ref: "Eq. J3-6a",
      ok: load <= bearingCapacity + 1e-9,
    });
    steps.push({
      label: "Clear distance at critical hole",
      symbol: "l{c}",
      value: Math.min(clearAtEdge, clearAtPitch),
      quantity: "length",
      expr: `min(${fmt(clearAtEdge, 2)}, ${fmt(clearAtPitch, 2)}) in`,
      ref: "§J3.11",
    });

    const shearY = elementShearYielding({ Fy, Fu, Agv: 2 * plateHeight * plateThickness });
    const capY = available(shearY, method);
    checks.push({
      id: "plate-yield",
      label: "Plate shear yielding at the support weld line",
      ratio: load / Math.max(1e-9, capY),
      capacity: capY,
      ref: "Eq. J4-3",
      ok: load <= capY + 1e-9,
    });
    const shearR = elementShearRupture({ Fy, Fu, Agv: 2 * plateHeight * plateThickness, Anv: 2 * plateHeight * plateThickness });
    const capR = available(shearR, method);
    checks.push({
      id: "plate-rupture",
      label: "Plate shear rupture at the support weld line",
      ratio: load / Math.max(1e-9, capR),
      capacity: capR,
      ref: "Eq. J4-4",
      ok: load <= capR + 1e-9,
    });

    if (includeWeld) {
      weldAnalysis = analyzeWeldGroup({ segments: weldSegments(plateHeight, plateWidth), ex: eccentricity, angle, FEXX, method: groupMethod });
      const l = weldAnalysis.referenceLength ?? Math.max(plateHeight, plateWidth);
      const nominal = weldAnalysis.C * (FEXX / 70) * (weldSize * 16) * l;
      const phi = 0.75,
        omega = 2;
      const capacity = method === "LRFD" ? phi * nominal : nominal / omega;
      checks.push({
        id: "weld-group",
        label: "Weld group — eccentric shear",
        ratio: load / Math.max(1e-9, capacity),
        capacity,
        ref: "Manual Part 8 · Eq. J2-4",
        ok: load <= capacity + 1e-9,
      });
      steps.push({
        label: "Equivalent weld coefficient C",
        symbol: "C",
        value: weldAnalysis.C,
        quantity: "",
        expr: `Rn = C (F{EXX}/70) D l · D = ${fmt(weldSize * 16, 2)} sixteenths · l = ${fmt(l, 2)} in`,
        ref: "Manual Part 8",
      });
    }

    if (edge < minEdgeDistance(boltD))
      warnings.push(`Edge distance ${fmt(edge, 2)} in is below the ${fmt(minEdgeDistance(boltD), 2)} in minimum for a ${fmt(boltD, 2)} in bolt (§J3.4).`);
    if (pitch < minSpacing(boltD).min)
      warnings.push(`Pitch ${fmt(pitch, 2)} in is below the ${fmt(minSpacing(boltD).min, 2)} in minimum spacing (§J3.3).`);
    if (weldSize < 0.1875) warnings.push("The entered weld leg is below 3/16 in; confirm the minimum size for the thicker part joined (Table J2.4).");
    if (eccentricity < 2) notes.push("Small eccentricity: the elastic and instantaneous-center solutions converge. Verify the load path physically clears the support.");
    if (groupMethod === "elastic") notes.push("Elastic group analysis is conservative relative to the instantaneous-center method for compact patterns.");
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
  }

  const governing = checks.length ? checks.reduce((a, b) => (b.ratio > a.ratio ? b : a)) : undefined;
  const pass = checks.length > 0 && checks.every((c) => c.ok);
  const methodLabel = method;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Connections · Manual Part 15"
        title="Bracket plates"
        description="Eccentrically loaded bolted and welded bracket plates, composed from the Manual Parts 7–8 group solutions and the §J4 element checks."
        actions={<Badge tone={pass ? "pass" : "fail"}>{pass ? "PASS" : "FAIL"}</Badge>}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Plate & demand">
            <div className="grid grid-cols-2 gap-3">
              <QuantityInput label="Plate height H" quantity="span" value={plateHeight} onChange={(v) => q.set({ H: v ?? 0 })} />
              <QuantityInput label="Plate width B" quantity="span" value={plateWidth} onChange={(v) => q.set({ B: v ?? 0 })} />
              <QuantityInput label="Plate thickness t" quantity="length" value={plateThickness} onChange={(v) => q.set({ t: v ?? 0 })} />
              <QuantityInput label="Design load P" quantity="force" value={load} onChange={(v) => q.set({ P: v ?? 0 })} />
              <QuantityInput label="Eccentricity e from group centroid" quantity="span" value={eccentricity} onChange={(v) => q.set({ e: v ?? 0 })} />
              <Select label="Load angle from vertical" value={String(angle)} onChange={(v) => q.set({ angle: Number(v) })} options={ANGLE_OPTIONS} />
              <QuantityInput label="Plate F{y}" quantity="stress" value={Fy} onChange={(v) => q.set({ Fy: v ?? 0 })} />
              <QuantityInput label="Plate F{u}" quantity="stress" value={Fu} onChange={(v) => q.set({ Fu: v ?? 0 })} />
            </div>
          </Card>

          <Card title="Bolt group">
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Rows" value={rows} onChange={(v) => q.set({ rows: Math.max(1, Math.round(v ?? 1)) })} />
              <NumberInput label="Columns" value={cols} onChange={(v) => q.set({ cols: Math.max(1, Math.round(v ?? 1)) })} />
              <QuantityInput label="Pitch s" quantity="length" value={pitch} onChange={(v) => q.set({ pitch: v ?? 0 })} />
              <QuantityInput label="Gage g" quantity="length" value={gage} onChange={(v) => q.set({ gage: v ?? 0 })} />
              <QuantityInput label="Edge distance" quantity="length" value={edge} onChange={(v) => q.set({ edge: v ?? 0 })} />
              <QuantityInput label="Bolt diameter" quantity="length" value={boltD} onChange={(v) => q.set({ boltD: v ?? 0 })} />
              <Select
                label="Bolt group"
                value={boltGroup}
                onChange={(v) => q.set({ boltGroup: v })}
                options={[
                  { value: "A", label: "Group 120 · A325/F1852" },
                  { value: "B", label: "Group 150 · A490/F2280" },
                  { value: "C", label: "Group 200 · F3043/F3111" },
                  { value: "A307", label: "A307" },
                ]}
              />
              <Select
                label="Threads"
                value={threads}
                onChange={(v) => q.set({ threads: v })}
                options={[
                  { value: "N", label: "Included in shear plane" },
                  { value: "X", label: "Excluded from shear plane" },
                ]}
              />
              <Select
                label="Hole"
                value={hole}
                onChange={(v) => q.set({ hole: v })}
                options={[
                  { value: "STD", label: "Standard" },
                  { value: "OVS", label: "Oversized" },
                  { value: "SSL", label: "Short-slotted" },
                  { value: "LSL", label: "Long-slotted" },
                ]}
              />
              <Select
                label="Group method"
                value={groupMethod}
                onChange={(v) => q.set({ groupMethod: v })}
                options={[
                  { value: "IC", label: "Instantaneous center" },
                  { value: "elastic", label: "Elastic vector" },
                ]}
              />
            </div>
          </Card>

          <Card title="Weld group">
            <div className="grid grid-cols-2 gap-3">
              <QuantityInput label="Fillet weld leg w" quantity="length" value={weldSize} onChange={(v) => q.set({ weld: v ?? 0 })} />
              <QuantityInput label="F{EXX}" quantity="stress" value={FEXX} onChange={(v) => q.set({ FEXX: v ?? 0 })} />
              <label className="col-span-2 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={includeWeld} onChange={(e) => q.set({ weldCheck: e.target.checked })} />
                Check the three-sided support weld (two vertical legs + bottom)
              </label>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card title="Bracket detail" subtitle={<>Plan-view load at {angle}° · group centroid, not the support face, is the eccentricity datum</>}>
            <Detail
              rows={rows}
              cols={cols}
              pitch={pitch}
              gage={gage}
              height={plateHeight}
              width={plateWidth}
              thickness={plateThickness}
              eccentricity={eccentricity}
              angle={angle}
              load={load}
            />
          </Card>

          {checks.length > 0 && (
            <Card title="Design summary" subtitle={`${methodLabel} · applied load ${fmtQ(load, "force", units)}`}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Controlling D/C" value={fmt(governing?.ratio ?? 0, 3)} tone={governing?.ok ? "pass" : "fail"} />
                <Stat label="Controlling limit state" value={governing?.label ?? "—"} />
                <Stat label="Bolt group C" value={boltAnalysis ? fmt(boltAnalysis.C, 3) : "—"} sub={groupMethod === "IC" ? "Instantaneous center" : "Elastic"} />
              </div>
              <div className="mt-4 space-y-3">
                {checks.map((c) => (
                  <div key={c.id}>
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                      <span className="font-medium text-ink">{c.label}</span>
                      <span className="font-mono text-[10.5px] text-faint">{c.ref}</span>
                    </div>
                    <RatioBar ratio={c.ratio} />
                    <div className="mt-0.5 flex justify-between text-[11px] text-muted">
                      <span>Demand {fmtQ(load, "force", units)}</span>
                      <span>Capacity {fmtQ(c.capacity, "force", units)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {(warnings.length > 0 || notes.length > 0) && (
            <Card title="Review items">
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
                {warnings.map((w, i) => (
                  <li key={`w${i}`} className="text-fail">{w}</li>
                ))}
                {notes.map((n, i) => (
                  <li key={`n${i}`}>{n}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Calculation steps">
            <div className="divide-y divide-line">
              {steps.map((s, i) => (
                <StepRow key={i} step={{ label: s.label, symbol: s.symbol ?? "", value: s.value, quantity: (s.quantity as "force" | "length" | "area" | undefined) ?? "force", expr: s.expr, ref: s.ref }} />
              ))}
              {weldAnalysis && (
                <StepRow
                  step={{
                    label: "Weld group analysis",
                    symbol: "C",
                    value: weldAnalysis.C,
                    quantity: "force",
                    expr: `${weldAnalysis.method} method · equilibrium error ${fmt(weldAnalysis.equilibriumError ?? 0, 4)}`,
                    ref: "Manual Part 8",
                  }}
                />
              )}
            </div>
          </Card>

          <Card title="Scope & classification">
            <div className="space-y-2 text-xs leading-relaxed text-muted">
              <p>
                This page checks the bolt group, the support weld group, bolt bearing and the plate shear planes at the weld line. It does not
                check plate bending between the weld line and the bolt group, stiffeners, column-side limit states, prying, fatigue or seismic
                prequalification. Add a stiffener or gusset where the load line is remote from the bolt group. <SpecRef>Manual Part 15</SpecRef>
              </p>
              <p>
                Manual Part 15 classifies connections by rotational stiffness. A bracket like this is a <strong className="text-ink">simple (PR)</strong>{" "}
                connection: it transfers shear and moment from the eccentric load, but its rotational stiffness is not modeled and it must not be
                relied on for frame stability. Use an FR moment connection where frame action is assumed. <SpecRef>§B3.4</SpecRef>{" "}
                <SpecRef>§C2.1</SpecRef>
              </p>
              <p className="flex flex-wrap gap-1">
                <SpecRef>Eq. J3-1</SpecRef> <SpecRef>Eq. J3-6a</SpecRef> <SpecRef>Eq. J4-3</SpecRef> <SpecRef>Eq. J4-4</SpecRef>{" "}
                <SpecRef>Manual Part 7</SpecRef> <SpecRef>Manual Part 8</SpecRef>
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
