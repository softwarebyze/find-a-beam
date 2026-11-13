import { useSettings } from "@/app/settings";
import { momentConnection, type MomentConnectionInput } from "@/aisc/connections/moment";
import type { BoltGroup, ThreadCondition } from "@/aisc/connections";
import { ShapePicker } from "@/components/ShapePicker";
import { Card, PageHeader, Select, Stat, SpecRef } from "@/components/ui";
import { StepRow } from "@/components/CalcReport";
import { findShape, slugOf } from "@/data/shapes";
import { materialById, materialsFor } from "@/data/materials";
import { fmtQ } from "@/lib/units";
import { CheckResults, ConnectionHero, ErrorCard, useConnectionFields } from "../concentrated/ConnectionWorkbench";
export function MomentConnectionPage() {
  const { q, field } = useConnectionFields(),
    { method, units } = useSettings();
  const beam = findShape(q.str("beam", "W18X35")) ?? findShape("W18X35")!,
    column = findShape(q.str("column", "W14X90")) ?? findShape("W14X90")!;
  const material = materialById(q.str("mat", "A992")) ?? materialById("A992")!,
    columnMaterial = materialById(q.str("colMat", "A992")) ?? materialById("A992")!;
  const type = q.str("type", "bolted-flange-plate") === "welded-flange" ? "welded-flange" : "bolted-flange-plate";
  const input: MomentConnectionInput = {
    M: q.numOr("M", 1800),
    V: q.numOr("V", 30),
    type,
    method,
    plateWidth: q.numOr("bp", 6),
    plateThickness: q.numOr("tp", 0.75),
    plateLength: q.numOr("Lp", 16),
    plateFy: q.numOr("Fy", 50),
    plateFu: q.numOr("Fu", 65),
    bolt: {
      d: q.numOr("boltD", 0.75),
      group: q.str("boltGroup", "A") as BoltGroup,
      threads: q.str("threads", "N") as ThreadCondition,
    },
    rows: q.numOr("rows", 4),
    spacing: q.numOr("pitch", 3),
    endDistance: q.numOr("edge", 1.5),
    gage: q.numOr("gage", 3),
    setback: q.numOr("setback", 0.5),
    weldSize: q.numOr("weld", 0.3125),
    FEXX: q.numOr("FEXX", 70),
    tabThickness: q.numOr("tabT", 0.375),
    tabHeight: q.numOr("tabH", 12),
    tabBolts: q.numOr("tabBolts", 4),
    tabWeldSize: q.numOr("tabWeld", 0.25),
    columnAxial: q.numOr("Pr", 200),
    storyShear: q.numOr("storyV", 0),
    columnEndDistance: q.numOr("colEnd", 60),
    frameStabilityConsidered: q.bool("stability"),
  };
  let result: ReturnType<typeof momentConnection> | undefined, error: unknown;
  try {
    result = momentConnection(beam, column, material, columnMaterial, input);
  } catch (e) {
    error = e;
  }
  return (
    <div>
      <PageHeader
        eyebrow="Connections · Manual Part 12"
        title="Moment connection"
        description="Flange-force strength checks for bolted flange plates or directly welded CJP flanges, with a web shear tab and column-side J10 checks. FR stiffness and seismic qualification require separate verification."
      />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Members & demand">
            <div className="space-y-3">
              <ShapePicker
                label="Beam"
                types={["W", "M", "S", "HP"]}
                value={beam}
                onChange={(s) => q.set({ beam: slugOf(s.label) })}
              />
              <ShapePicker
                label="Column"
                types={["W", "M", "S", "HP"]}
                value={column}
                onChange={(s) => q.set({ column: slugOf(s.label) })}
              />
              <Select
                label="Beam material"
                value={material.id}
                onChange={(mat) => q.set({ mat })}
                options={materialsFor("i-shape").map((m) => ({ value: m.id, label: m.name }))}
              />
              <Select
                label="Column material"
                value={columnMaterial.id}
                onChange={(colMat) => q.set({ colMat })}
                options={materialsFor("i-shape").map((m) => ({ value: m.id, label: m.name }))}
              />
              <Select
                label="Connection type"
                value={type}
                onChange={(type) => q.set({ type })}
                options={[
                  { value: "bolted-flange-plate", label: "Bolted flange plate" },
                  { value: "welded-flange", label: "Directly welded CJP flanges" },
                ]}
              />
              {field("M", `Required moment (${method})`, 1800, "moment")}
              {field("V", "Required web shear", 30, "force")}
            </div>
          </Card>
          <Card title="Bolts & flange plates">
            <div className="space-y-3">
              <Select
                label="Bolt grade"
                value={input.bolt.group}
                onChange={(boltGroup) => q.set({ boltGroup })}
                options={[
                  { value: "A", label: "F3125 Gr. A325 (Group A)" },
                  { value: "B", label: "F3125 Gr. A490 (Group B)" },
                  { value: "C", label: "Group C" },
                ]}
              />
              <Select
                label="Threads in shear plane"
                value={input.bolt.threads}
                onChange={(threads) => q.set({ threads })}
                options={[
                  { value: "N", label: "Included (N)" },
                  { value: "X", label: "Excluded (X)" },
                ]}
              />
              {field("boltD", "Bolt diameter", 0.75)}
              {field("pitch", "Bolt pitch", 3)}
              {field("edge", "Bolt end distance", 1.5)}
              {type === "bolted-flange-plate" && (
                <>
                  {field("rows", "Flange bolt rows (two bolts/row)", 4, "ratio")}
                  {field("gage", "Flange bolt gage", 3)}
                  {field("bp", "Flange plate width", 6)}
                  {field("tp", "Flange plate thickness", 0.75)}
                  {field("Lp", "Flange plate length", 16)}
                  {field("setback", "Beam-end setback from column face", 0.5)}
                  {field("weld", "Plate-to-column double fillet weld size", 0.3125)}
                </>
              )}
              {field("Fy", "Plate / tab Fy", 50, "stress")}
              {field("Fu", "Plate / tab Fu", 65, "stress")}
              {field("FEXX", "Filler metal classification FEXX", 70, "stress")}
            </div>
          </Card>
          <Card title="Web shear tab">
            <div className="space-y-3">
              {field("tabT", "Tab thickness", 0.375)}
              {field("tabH", "Tab height", 12)}
              {field("tabBolts", "Tab bolt count", 4, "ratio")}
              {field("tabWeld", "Double fillet weld size", 0.25)}
            </div>
          </Card>
          <Card title="Column panel zone">
            <div className="space-y-3">
              {field("Pr", "Column axial compression", 200, "force")}
              {field("storyV", "Column story shear (reduces panel demand)", 0, "force")}
              {field("colEnd", "Load to column end distance", 60)}
              <label className="flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={input.frameStabilityConsidered}
                  onChange={(e) => q.set({ stability: e.target.checked })}
                />
                Inelastic panel deformation considered in frame stability
              </label>
            </div>
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          {error !== undefined && <ErrorCard error={error} />}
          <Card title="Connection elevation" subtitle={<SpecRef>Manual Part 12 · schematic</SpecRef>}>
            <svg
              viewBox="0 0 560 260"
              role="img"
              aria-label="Moment connection elevation showing flange load paths and web shear tab"
              className="max-h-80 w-full text-ink"
            >
              <path d="M90 20V240M125 20V240M95 20V240M120 20V240" stroke="var(--steel)" strokeWidth="3" />
              <path d="M126 65H510M126 195H510M126 73H510M126 187H510" stroke="var(--steel)" strokeWidth="3" />
              <path d="M126 73H510V187H126Z" fill="var(--steel-fill)" fillOpacity="0.4" />
              {type === "bolted-flange-plate" ? (
                <>
                  <path d="M125 58H350V65H125ZM125 195H350V202H125Z" fill="var(--accent-soft)" stroke="var(--accent)" />
                  {Array.from({ length: Math.min(12, input.rows) }, (_, i) => (
                    <g key={i} stroke="var(--accent)">
                      <path d={`M${165 + i * 35} 53V79M${165 + i * 35} 182V208`} />
                    </g>
                  ))}
                </>
              ) : (
                <path d="M125 55L140 65H125ZM125 205L140 195H125Z" fill="var(--accent)" />
              )}
              <rect x="128" y="88" width="55" height="84" fill="var(--surface-2)" stroke="var(--steel)" />
              {Array.from({ length: Math.min(8, input.tabBolts) }, (_, i) => (
                <circle
                  key={i}
                  cx="168"
                  cy={99 + (i * 62) / Math.max(1, input.tabBolts - 1)}
                  r="4"
                  fill="var(--surface)"
                  stroke="var(--steel)"
                />
              ))}
              <path
                d="M390 40H470L460 35M470 40L460 45M470 222H390L400 217M390 222L400 227"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
              />
              <text x="270" y="24" fill="currentColor" fontSize="12">
                {beam.label} → {column.label}
              </text>
              <text x="290" y="251" fill="var(--muted)" fontSize="11">
                Flange couple + web shear · one-sided joint
              </text>
            </svg>
          </Card>
          {result && (
            <>
              <ConnectionHero pass={result.pass} ratio={result.ratio}>
                <Stat label="Required flange force |M| / d" value={fmtQ(result.flangeForce, "force", units)} />
              </ConnectionHero>
              <CheckResults checks={result.checks} steps={result.steps} warnings={result.warnings} />
              <Card title="Column stiffeners & doubler">
                <div className="space-y-2">
                  <Stat
                    label="Transverse stiffener pair"
                    value={
                      result.column.stiffener.required
                        ? `${fmtQ(result.column.stiffener.width, "length", units)} × ${fmtQ(result.column.stiffener.thickness, "length", units)}`
                        : "Not required by listed checks"
                    }
                  />
                  <Stat
                    label="Required panel doubler thickness"
                    value={
                      result.column.doubler.required
                        ? fmtQ(result.column.doubler.thickness, "length", units)
                        : "Not required by listed checks"
                    }
                  />
                  {result.column.stiffener.required &&
                    result.column.stiffener.steps.map((s, i) => <StepRow key={i} step={s} />)}
                  {result.column.doubler.required &&
                    result.column.doubler.steps.map((s, i) => <StepRow key={i} step={s} />)}
                </div>
              </Card>
              <CheckResults
                checks={result.column.checks}
                warnings={[...result.column.warnings, ...result.column.omitted]}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
