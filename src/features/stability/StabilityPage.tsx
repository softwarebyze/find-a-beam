import {
  alignmentReport,
  gFactor,
  tauB,
  storyAmplification,
  magnificationReport,
  columnBracing,
  beamLateralBracing,
  beamTorsionalBracing,
} from "@/aisc/stability";
import type { JointMember } from "@/aisc/stability/alignment";
import type { CalcStep } from "@/aisc/types";
import { E } from "@/data/materials";
import { findShape, req, slugOf } from "@/data/shapes";
import { useSettings } from "@/app/settings";
import { ShapePicker } from "@/components/ShapePicker";
import { StepRow } from "@/components/CalcReport";
import { Card, NumberInput, PageHeader, QuantityInput, Select, SpecRef, Stat } from "@/components/ui";
import { useQueryState } from "@/features/column/url-state";
import { fmt, fmtQ, toDisplay, unitLabel, type Quantity } from "@/lib/units";

function attempt<T>(fn: () => T): { value: T; error?: never } | { error: string; value?: never } {
  try {
    return { value: fn() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
function Steps({ steps }: { steps: CalcStep[] }) {
  return (
    <div className="divide-y divide-line">
      {steps.map((step, i) => (
        <StepRow key={i} step={step} />
      ))}
    </div>
  );
}
export function StabilityPage() {
  const q = useQueryState(),
    { units, method } = useSettings();
  const sway = q.bool("sway", true),
    members = q.str("gmode") === "members",
    inelastic = q.bool("inelastic");
  const number = (key: string, label: string, fallback: number) => (
    <NumberInput key={key} label={label} value={q.numOr(key, fallback)} onChange={(v) => q.set({ [key]: v ?? 0 })} />
  );
  const quantity = (key: string, label: string, fallback: number, quantity: Quantity = "span") => (
    <QuantityInput
      key={key}
      label={label}
      value={q.numOr(key, fallback)}
      quantity={quantity}
      onChange={(v) => q.set({ [key]: v ?? 0 })}
    />
  );
  const toggle = (key: string, label: string, defaultValue = false) => (
    <label className="flex items-center gap-2 text-xs text-muted">
      <input type="checkbox" checked={q.bool(key, defaultValue)} onChange={(e) => q.set({ [key]: e.target.checked })} />
      {label}
    </label>
  );
  const tau = inelastic ? tauB : undefined;
  const joint = (end: string): number => {
    if (!members) return q.numOr(`G${end}`, 1);
    const columns: JointMember[] = [],
      girders: JointMember[] = [];
    for (const id of ["c1", "c2", "g1", "g2"]) {
      const prefix = `${end}${id}`;
      if (!q.bool(`${prefix}on`, id.endsWith("1"))) continue;
      const shape = findShape(q.str(prefix, id.startsWith("c") ? "W14X90" : "W18X50"));
      if (!shape) throw new RangeError("Select a valid member");
      const I = req(shape, q.str(`${prefix}axis`) === "y" ? "Iy" : "Ix");
      const far = q.str(`${prefix}far`, "standard");
      const member: JointMember = {
        E,
        I,
        L: q.numOr(`${prefix}L`, id.startsWith("c") ? 144 : 240),
        tau: id.startsWith("c") && tau ? tau(q.numOr("PrPy", 0.6), 1, method) : 1,
        farEnd: far === "fixed" ? "fixed" : far === "pinned" ? "pinned" : "standard",
      };
      (id.startsWith("c") ? columns : girders).push(member);
    }
    return gFactor({ columns, girders, sway });
  };
  const alignment = attempt(() => alignmentReport({ GA: joint("A"), GB: joint("B"), sway }));
  const b1 = attempt(() =>
    magnificationReport(
      q.numOr("Pr", 200),
      E * q.numOr("I", 100) * q.numOr("ei", 0.8),
      q.numOr("Lc", 144),
      q.numOr("Cm", 1),
      method,
    ),
  );
  const b2 = attempt(() =>
    storyAmplification({
      Pstory: q.numOr("Pstory", 2000),
      Pmf: q.numOr("Pmf", 1000),
      H: q.numOr("H", 100),
      L: q.numOr("L", 144),
      drift: q.numOr("drift", 0.5),
      method,
    }),
  );
  const braceType = q.str("brace", "column-point"),
    torsional = braceType === "torsional";
  const bracing = attempt(() => {
    const Lbr = q.numOr("Lbr", 120),
      Mr = q.numOr("Mr", 2400),
      ho = q.numOr("ho", 18);
    if (torsional)
      return beamTorsionalBracing({
        Mr,
        ho,
        Lbr,
        L: q.numOr("beamL", 360),
        n: q.numOr("n", 2),
        Cb: q.numOr("Cb", 1),
        Iyeff: q.numOr("Iy", 100),
        tw: q.numOr("tw", 0.35),
        bs: q.numOr("bs", 6),
        tst: q.numOr("tst", 0.375),
        rigidWeb: q.bool("rigid"),
        method,
      });
    if (braceType.startsWith("beam"))
      return beamLateralBracing({
        Mr,
        ho,
        Lbr,
        Cd: q.bool("double") ? 2 : 1,
        type: braceType.endsWith("panel") ? "panel" : "point",
        method,
      });
    return columnBracing({
      Pr: q.numOr("braceP", 300),
      Lbr,
      type: braceType.endsWith("panel") ? "panel" : "point",
      method,
    });
  });
  const jointEditor = (end: string) => (
    <div key={end} className="space-y-3 rounded-lg border border-line p-3">
      <h3 className="text-xs font-semibold">Joint {end} · rigidly connected members</h3>
      {["c1", "c2", "g1", "g2"].map((id) => {
        const prefix = `${end}${id}`,
          column = id.startsWith("c");
        const shape = findShape(q.str(prefix, column ? "W14X90" : "W18X50"));
        return (
          <div key={id} className="space-y-2 border-t border-line pt-2">
            {toggle(`${prefix}on`, `${column ? "Column" : "Girder"} ${id.endsWith("1") ? "1" : "2"}`, id.endsWith("1"))}
            {q.bool(`${prefix}on`, id.endsWith("1")) && (
              <>
                <ShapePicker
                  label={`${end} ${column ? "column" : "girder"} ${id.slice(1)}`}
                  value={shape}
                  onChange={(s) => q.set({ [prefix]: slugOf(s.label) })}
                />
                <div className="grid grid-cols-2 gap-2">
                  {quantity(`${prefix}L`, "Member length", column ? 144 : 240)}
                  <Select
                    label="Bending inertia"
                    value={q.str(`${prefix}axis`, "x")}
                    onChange={(v) => q.set({ [`${prefix}axis`]: v })}
                    options={[
                      { value: "x", label: "Ix" },
                      { value: "y", label: "Iy" },
                    ]}
                  />
                </div>
                {!column && (
                  <Select
                    label="Girder far end"
                    value={q.str(`${prefix}far`, "standard")}
                    onChange={(v) => q.set({ [`${prefix}far`]: v })}
                    options={[
                      { value: "standard", label: "Standard chart condition" },
                      { value: "fixed", label: "Rotation prevented" },
                      { value: "pinned", label: "Pinned" },
                    ]}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="ANSI/AISC 360-22 · Appendices 6–8"
        title="Stability tools"
        description="Effective length, second-order amplification and member stability bracing. Inputs are saved in the URL."
      />
      <Card title="Alignment chart calculator" subtitle={<SpecRef>Commentary Eqs. C-A-7-1 to C-A-7-4</SpecRef>}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Select
              label="Joint stiffness input"
              value={members ? "members" : "G"}
              onChange={(gmode) => q.set({ gmode })}
              options={[
                { value: "G", label: "Enter GA and GB" },
                { value: "members", label: "Calculate from column and girder members" },
              ]}
            />
            <Select
              label="Sidesway condition"
              value={sway ? "sway" : "braced"}
              onChange={(v) => q.set({ sway: v === "sway" })}
              options={[
                { value: "sway", label: "Sidesway permitted" },
                { value: "braced", label: "Sidesway inhibited" },
              ]}
            />
            {members ? (
              <>
                {toggle("inelastic", "Use inelastic column stiffness τb")}
                {inelastic && number("PrPy", `${method} Pr / Py (α applied automatically)`, 0.6)}
                <div className="grid gap-3 sm:grid-cols-2">
                  {jointEditor("A")}
                  {jointEditor("B")}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {number("GA", "GA", 1)}
                {number("GB", "GB", 1)}
              </div>
            )}
            <p className="text-xs text-muted">
              G = Σ(EcIc/Lc) / Σ(EgIg/Lg). Steel E = {fmtQ(E, "stress", units)}. Theoretical K assumes rigid joints,
              prismatic members, simultaneous buckling and negligible girder axial forces. Typical foundation estimates:
              G = 1 fixed, G = 10 nominal pin; assess actual restraint. <SpecRef>Commentary §7.2</SpecRef>
            </p>
          </div>
          <div className="space-y-4">
            {alignment.value === undefined ? (
              <p role="alert" className="text-sm text-warn">
                {alignment.error}
              </p>
            ) : (
              <>
                <Stat
                  label="Theoretical K"
                  value={Number.isFinite(alignment.value.K) ? fmt(alignment.value.K, 4) : "∞"}
                />
                <svg
                  role="img"
                  aria-label="Joint stiffness and computed effective length schematic"
                  viewBox="0 0 440 270"
                  className="w-full text-muted"
                >
                  {[60, 220, 380].map((x) => (
                    <line key={x} x1={x} x2={x} y1={30} y2={230} stroke="var(--line-strong)" />
                  ))}
                  <text x={60} y={20} textAnchor="middle" fill="currentColor" fontSize={13}>
                    GA
                  </text>
                  <text x={220} y={20} textAnchor="middle" fill="currentColor" fontSize={13}>
                    K
                  </text>
                  <text x={380} y={20} textAnchor="middle" fill="currentColor" fontSize={13}>
                    GB
                  </text>
                  {[0, 0.5, 1, 2, 5, 10].map((g) => (
                    <g key={g}>
                      {[60, 380].map((x) => (
                        <g key={x}>
                          <line
                            x1={x - 5}
                            x2={x + 5}
                            y1={230 - (180 * Math.log1p(g)) / Math.log(11)}
                            y2={230 - (180 * Math.log1p(g)) / Math.log(11)}
                            stroke="var(--muted)"
                          />
                          <text
                            x={x + 9}
                            y={234 - (180 * Math.log1p(g)) / Math.log(11)}
                            fill="currentColor"
                            fontSize={11}
                          >
                            {g}
                          </text>
                        </g>
                      ))}
                    </g>
                  ))}
                  <polyline
                    points={`60,${230 - 180 * Math.min(1, Math.log1p(joint("A")) / Math.log(11))} 220,130 380,${230 - 180 * Math.min(1, Math.log1p(joint("B")) / Math.log(11))}`}
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fill="none"
                  />
                  <circle cx={220} cy={130} r={4} fill="var(--accent)" />
                  <text x={230} y={125} fill="var(--ink)" fontSize={15}>
                    {fmt(alignment.value.K, 4)}
                  </text>
                  <text x={220} y={258} textAnchor="middle" fill="currentColor" fontSize={11}>
                    Schematic connector · K solved from the chart equation
                  </text>
                </svg>
                <Steps steps={alignment.value.steps} />
              </>
            )}
          </div>
        </div>
      </Card>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title="B1 · member amplification" subtitle={<SpecRef>Eqs. A-8-3 to A-8-5</SpecRef>}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {quantity("Pr", "Required compression", 200, "force")}
              {quantity("I", "In-plane inertia", 100, "inertia")}
              {quantity("Lc", "Sway-inhibited Lc1", 144)}
              {number("Cm", "Cm", 1)}
              {number("ei", "EI* / EI", 0.8)}
            </div>
            {b1.value === undefined ? (
              <p role="alert" className="text-warn">
                {b1.error}
              </p>
            ) : (
              <>
                <Stat
                  label="B1"
                  value={Number.isFinite(b1.value.B1) ? fmt(b1.value.B1, 4) : "∞ · elastic instability"}
                />
                <Steps steps={b1.value.steps} />
              </>
            )}
          </div>
        </Card>
        <Card title="B2 · story amplification" subtitle={<SpecRef>Eqs. A-8-6 to A-8-8</SpecRef>}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {quantity("Pstory", "Total story gravity load", 2000, "force")}
              {quantity("Pmf", "Gravity load in moment-frame columns", 1000, "force")}
              {quantity("H", "Story shear H", 100, "force")}
              {quantity("L", "Story height", 144)}
              {quantity("drift", "First-order interstory drift", 0.5, "length")}
            </div>
            {b2.value === undefined ? (
              <p role="alert" className="text-warn">
                {b2.error}
              </p>
            ) : (
              <>
                <Stat
                  label="B2"
                  value={Number.isFinite(b2.value.B2) ? fmt(b2.value.B2, 4) : "∞ · elastic instability"}
                />
                <Steps steps={b2.value.steps} />
              </>
            )}
          </div>
        </Card>
      </div>
      <Card title="Stability bracing requirements" subtitle={<SpecRef>Appendix 6</SpecRef>}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Select
              label="Brace type"
              value={braceType}
              onChange={(brace) => q.set({ brace })}
              options={[
                { value: "column-point", label: "Column · point" },
                { value: "column-panel", label: "Column · panel" },
                { value: "beam-point", label: "Beam lateral · point" },
                { value: "beam-panel", label: "Beam lateral · panel" },
                { value: "torsional", label: "Beam torsional · point" },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              {quantity("Lbr", "Adjacent unbraced length", 120)}
              {braceType.startsWith("column") ? (
                quantity("braceP", "Required compression", 300, "force")
              ) : (
                <>
                  {quantity("Mr", "Required beam moment", 2400, "moment")}
                  {quantity("ho", "Distance between flange centroids", 18, "length")}
                </>
              )}
            </div>
            {braceType.startsWith("beam") &&
              toggle("double", "Brace nearest double-curvature inflection point (Cd = 2)")}
            {torsional && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {quantity("beamL", "Beam span", 360)}
                  {number("n", "Interior brace count n", 2)}
                  {number("Cb", "Cb", 1)}
                  {quantity("Iy", "Effective out-of-plane inertia", 100, "inertia")}
                  {quantity("tw", "Web thickness", 0.35, "length")}
                  {quantity("bs", "Total stiffener width bs", 6, "length")}
                  {quantity("tst", "Stiffener thickness", 0.375, "length")}
                </div>
                {toggle("rigid", "Full-depth diaphragm / cross-frame restraining both flanges")}
              </>
            )}
            <p className="text-xs text-muted">
              Use the larger adjacent demand / length combination. Include brace and connection flexibility. Beam
              provisions apply to I-shaped members with zero axial force; combine column and beam requirements for
              beam-columns. <SpecRef>§§6.1–6.4</SpecRef>
            </p>
          </div>
          <div className="space-y-3">
            {bracing.value === undefined ? (
              <p role="alert" className="text-warn">
                {bracing.error}
              </p>
            ) : (
              <>
                <Stat
                  label={torsional ? "Required brace moment" : "Required brace force"}
                  value={fmtQ(bracing.value.strength, torsional ? "moment" : "force", units)}
                />
                <Stat
                  label={torsional ? "Required stiffness per radian" : "Required lateral stiffness"}
                  value={
                    Number.isFinite(bracing.value.stiffness)
                      ? torsional
                        ? `${fmtQ(bracing.value.stiffness, "moment", units)} / rad`
                        : `${fmt(toDisplay(bracing.value.stiffness, "force", units) / toDisplay(1, "length", units), 4)} ${unitLabel("force", units)}/${unitLabel("length", units)}`
                      : "∞ · ineffective web restraint"
                  }
                />
                <Steps steps={bracing.value.steps} />
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
