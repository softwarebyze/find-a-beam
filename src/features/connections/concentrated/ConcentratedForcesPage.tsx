import { useSettings } from "@/app/settings";
import { concentratedForces, type ConcentratedForceInput } from "@/aisc/connections/concentrated-forces";
import { ShapePicker } from "@/components/ShapePicker";
import { Card, PageHeader, Select, SpecRef, Stat } from "@/components/ui";
import { findShape, slugOf } from "@/data/shapes";
import { materialById, materialsFor } from "@/data/materials";
import { CrossSection } from "@/features/drawings/CrossSection";
import { fmtQ } from "@/lib/units";
import { CheckResults, ConnectionHero, ErrorCard, useConnectionFields } from "./ConnectionWorkbench";
import { StepRow } from "@/components/CalcReport";
export function ConcentratedForcesPage() {
  const { q, field } = useConnectionFields(),
    { method, units } = useSettings();
  const shape = findShape(q.str("shape", "W24X55")) ?? findShape("W24X55")!,
    material = materialById(q.str("mat", "A992")) ?? materialById("A992")!;
  const loading = q.str("loading", "compression") as ConcentratedForceInput["loading"];
  const input: ConcentratedForceInput = {
    force: q.numOr("P", 100),
    bearingLength: q.numOr("lb", 4),
    endDistance: q.numOr("end", 36),
    method,
    loading,
    Lb: q.numOr("Lb", 240),
    Mr: q.numOr("M", 3600),
    loadedWidth: q.numOr("width", 7),
    flangeRotationRestrained: q.bool("rotation", true),
    lateralMovementRestrained: q.bool("lateral"),
    oppositeCompression: q.bool("opposed"),
    panelShear: q.bool("panel") ? q.numOr("Vpanel", 100) : undefined,
    axialForce: q.numOr("Pr", 0),
    beamDepth: q.numOr("db", 24),
    frameStabilityConsidered: q.bool("stability"),
    unframedEnd: q.bool("unframed"),
    endRotationRestrained: q.bool("endRestraint"),
    deliveringThickness: q.numOr("loadT", 0.5),
    deliveringWidth: q.numOr("width", 7),
  };
  let result: ReturnType<typeof concentratedForces> | undefined, error: unknown;
  try {
    result = concentratedForces(shape, material, input);
  } catch (e) {
    error = e;
  }
  const toggle = (key: string, label: string, fallback = false) => (
    <label key={key} className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={q.bool(key, fallback)} onChange={(e) => q.set({ [key]: e.target.checked })} />
      {label}
    </label>
  );
  return (
    <div>
      <PageHeader
        eyebrow="Connections · ANSI/AISC 360-22"
        title="Concentrated forces"
        description="Flange and web checks with explicit load, end-distance and restraint conditions. Forces and lengths are stored in the shareable URL."
      />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Member & load">
            <div className="space-y-3">
              <ShapePicker
                types={["W", "M", "S", "HP"]}
                value={shape}
                onChange={(s) => q.set({ shape: slugOf(s.label) })}
              />
              <Select
                label="Material"
                value={material.id}
                onChange={(mat) => q.set({ mat })}
                options={materialsFor("i-shape").map((m) => ({ value: m.id, label: m.name }))}
              />
              <Select
                label="Concentrated load pattern"
                value={loading ?? "compression"}
                onChange={(loading) => q.set({ loading })}
                options={[
                  { value: "compression", label: "Single compression" },
                  { value: "tension", label: "Single tension" },
                  { value: "couple", label: "Tension/compression couple" },
                ]}
              />
              {field("P", method === "LRFD" ? "Required force Pu" : "Required force Pa", 100, "force")}
              {field("lb", "Bearing length lb", 4)}
              {field("end", "Distance from force to member end", 36)}
              {field("width", "Load width across flange", 7)}
              {field("loadT", "Delivering plate / flange thickness", 0.5)}
            </div>
          </Card>
          <Card title="Restraint & buckling">
            <div className="space-y-3">
              {toggle("lateral", "Relative lateral movement of flanges restrained")}
              {toggle("rotation", "Loaded flange rotation restrained", true)}
              {toggle("opposed", "Opposed compression at both flanges (J10.5)")}
              {field("Lb", "Largest flange unbraced length Lb", 240, "span")}
              {field("M", "Member moment at concentrated load", 3600, "moment")}
              {toggle("unframed", "Unframed member end (J10.7)")}
              {toggle("endRestraint", "End restrained against longitudinal rotation")}
            </div>
          </Card>
          <Card title="Panel zone">
            <div className="space-y-3">
              {toggle("panel", "Evaluate panel-zone shear")}
              {q.bool("panel") && (
                <>
                  {field("Vpanel", "Panel shear demand", 100, "force")}
                  {field("Pr", "Column axial compression Pr", 0, "force")}
                  {field("db", "Framing beam depth db", 24)}
                  {toggle("stability", "Inelastic panel deformation considered in frame stability")}
                </>
              )}
            </div>
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          {error !== undefined && <ErrorCard error={error} />}
          <Card title={shape.label} subtitle={<SpecRef>§J10.1–J10.9</SpecRef>}>
            <div className="grid items-center gap-4 md:grid-cols-2">
              <CrossSection shape={shape} maxHeight={240} />
              <svg
                viewBox="0 0 360 190"
                role="img"
                aria-label="Elevation showing concentrated force and bearing length"
                className="w-full text-ink"
              >
                <path d="M25 65H335M25 125H335M25 71H335M25 119H335" stroke="var(--steel)" strokeWidth="3" />
                <path d="M170 15V54L163 43M170 54L177 43" fill="none" stroke="var(--accent)" strokeWidth="2" />
                <rect x="148" y="56" width="44" height="9" fill="var(--steel-fill)" stroke="var(--steel)" />
                <text x="184" y="30" fill="currentColor" fontSize="12">
                  {fmtQ(input.force, "force", units)}
                </text>
                <text x="122" y="158" fill="currentColor" fontSize="11">
                  lb = {fmtQ(input.bearingLength, "length", units)}
                </text>
                <text x="30" y="181" fill="var(--muted)" fontSize="10">
                  Elevation schematic · not to scale
                </text>
              </svg>
            </div>
          </Card>
          {result && (
            <>
              <ConnectionHero pass={result.pass} ratio={result.ratio} />
              <Card title="Transverse stiffeners & doubler">
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Stat
                      label={result.stiffener.required ? "Stiffener pair required" : "Stiffener pair not required"}
                      value={
                        result.stiffener.required
                          ? `${fmtQ(result.stiffener.width, "length", units)} × ${fmtQ(result.stiffener.thickness, "length", units)}`
                          : "—"
                      }
                    />
                    <Stat
                      label="Required panel doubler thickness"
                      value={result.doubler.required ? fmtQ(result.doubler.thickness, "length", units) : "Not required"}
                    />
                  </div>
                  {result.stiffener.required && result.stiffener.steps.map((s, i) => <StepRow key={i} step={s} />)}
                  {result.doubler.required && result.doubler.steps.map((s, i) => <StepRow key={i} step={s} />)}
                  <p className="text-xs text-muted">
                    Full-depth pair shown. Attachments and additional limit states require final detailing.
                  </p>
                </div>
              </Card>
              <CheckResults checks={result.checks} warnings={[...result.warnings, ...result.omitted]} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
