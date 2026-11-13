import {
  equipmentVelocityCheck,
  floorVibration,
  OCCUPANCIES,
  rhythmicResponse,
  RHYTHMIC_ACTIVITIES,
  VELOCITY_CRITERIA,
  type Occupancy,
  type VibrationInput,
} from "@/analysis/vibration";
import { useSettings } from "@/app/settings";
import { LineChart, type Marker, type Series } from "@/components/charts/LineChart";
import { ShapePicker } from "@/components/ShapePicker";
import {
  Badge,
  Button,
  Card,
  NumberInput,
  PageHeader,
  QuantityInput,
  RatioBar,
  Select,
  SpecRef,
  Stat,
} from "@/components/ui";
import { findShape, slugOf } from "@/data/shapes";
import { fmt, fmtQ } from "@/lib/units";
import { calculate, InputError, Steps, Toggle, useWorkbenchQuery } from "@/features/fatigue/workbench";

const isOccupancy = (v: string): v is Occupancy => Object.prototype.hasOwnProperty.call(OCCUPANCIES, v);
const isCriterion = (v: string): v is keyof typeof VELOCITY_CRITERIA =>
  Object.prototype.hasOwnProperty.call(VELOCITY_CRITERIA, v);
const isActivity = (v: string): v is keyof typeof RHYTHMIC_ACTIVITIES =>
  Object.prototype.hasOwnProperty.call(RHYTHMIC_ACTIVITIES, v);

const PCF_TO_KGM3 = 16.0185;

export function VibrationPage() {
  const q = useWorkbenchQuery(),
    { units } = useSettings();

  const occRaw = q.str("occ", "electronic"),
    occupancy: Occupancy = isOccupancy(occRaw) ? occRaw : "electronic";
  const beam = findShape(q.str("beam", "W18X50")) ?? findShape("W18X50")!,
    girder = findShape(q.str("girder", "W21X50")) ?? findShape("W21X50")!;
  const beamSpan = q.num("Lb", 288),
    girderSpan = q.num("Lg", 288),
    spacing = q.num("s", 120),
    floorWidth = q.num("Bf", 720),
    floorLength = q.num("Lf", 720);
  const slabThickness = q.num("ts", 3.25),
    deckDepth = q.num("hd", 3),
    concreteStrength = q.num("fc", 4),
    concreteDensity = q.num("wc", 145);
  const superimposed = q.num("sd", 10 / 144000),
    liveLoad = q.num("ll", 11 / 144000),
    deckWeight = q.num("dw", 3 / 144000);
  const dampingMode = q.str("damping", "preset") === "custom" ? "custom" : "preset",
    damping = dampingMode === "custom" ? q.num("beta", 0.03) : undefined;

  const input: VibrationInput = {
    beam,
    girder,
    beamSpan,
    girderSpan,
    spacing,
    floorWidth,
    floorLength,
    slabThickness,
    deckDepth,
    concreteStrength,
    concreteDensity,
    superimposed,
    liveLoad,
    deckWeight,
    occupancy,
    damping,
    composite: q.bool("comp", true),
    edgeBeam: q.bool("edgeBeam"),
    edgeGirder: q.bool("edgeGirder"),
    beamContinuity: q.bool("beamCont"),
    girderContinuity: q.bool("girderCont"),
  };
  const check = calculate(() => floorVibration(input));
  const r = check.result;
  const tolerance = OCCUPANCIES[occupancy].tolerance;

  // Equal-bay span sweep. Errors are skipped so an invalid current bay does not blank the chart.
  const spans = Array.from({ length: 25 }, (_, i) => 18 + i);
  const accelerationPoints: { x: number; y: number }[] = [];
  for (const span of spans) {
    const swept = calculate(() =>
      floorVibration({
        ...input,
        beamSpan: span * 12,
        girderSpan: span * 12,
        floorWidth: Math.max(floorWidth, span * 12),
        floorLength: Math.max(floorLength, span * 12),
      }),
    );
    if (swept.result?.applicable) accelerationPoints.push({ x: span, y: swept.result.acceleration * 100 });
  }
  const accelerationSeries: Series[] =
    accelerationPoints.length > 1
      ? [
          { id: "acceleration", label: "Peak walking acceleration", points: accelerationPoints, color: "var(--accent)" },
          {
            id: "limit",
            label: `${fmt(tolerance * 100, 2)} %g limit`,
            points: spans.map((x) => ({ x, y: tolerance * 100 })),
            color: "var(--fail)",
            dashed: true,
          },
        ]
      : [];
  const currentSpan = (beamSpan + girderSpan) / 24;
  const accelerationMarkers: Marker[] =
    r && currentSpan >= 18 && currentSpan <= 42
      ? [{ x: currentSpan, y: r.acceleration * 100, label: "Current bay", color: "var(--ink)" }]
      : [];

  const activityRaw = q.str("activity", "dancing"),
    activity: keyof typeof RHYTHMIC_ACTIVITIES = isActivity(activityRaw) ? activityRaw : "dancing";
  const rhythmDamping = q.num("rbeta", 0.06),
    rhythmTolerance = q.num("rtol", 0.02),
    rhythm = calculate(() =>
      rhythmicResponse({
        frequency: r?.fn ?? 0,
        stepFrequency: q.num("fstep", 1.8),
        participantWeightRatio: q.num("wratio", 0.1),
        damping: rhythmDamping,
        activity,
        tolerance: rhythmTolerance,
      }),
    );
  const rr = rhythm.result;

  const vcRaw = q.str("vc", "VC-C"),
    criterion: keyof typeof VELOCITY_CRITERIA = isCriterion(vcRaw) ? vcRaw : "VC-C";
  const velocity = q.num("vcv", 100e-6),
    vcFrequency = q.num("vcf", 10);
  const equipment = calculate(() => equipmentVelocityCheck(velocity, vcFrequency, criterion));
  const eq = equipment.result;
  const vcSeries: Series[] = (Object.keys(VELOCITY_CRITERIA) as (keyof typeof VELOCITY_CRITERIA)[]).map((id) => {
    const minFrequency = id === "VC-A" || id === "VC-B" ? 8 : 1;
    return {
      id,
      label: `${id} · ${fmt(VELOCITY_CRITERIA[id])} µin./s`,
      points: [
        { x: Math.log10(minFrequency), y: VELOCITY_CRITERIA[id] },
        { x: Math.log10(80), y: VELOCITY_CRITERIA[id] },
      ],
      color: id === criterion ? "var(--accent)" : "var(--muted)",
      dashed: id !== criterion,
    };
  });
  const vcMarkers: Marker[] =
    eq && vcFrequency > 0
      ? [{ x: Math.log10(vcFrequency), y: velocity * 1e6, label: "Equipment", color: "var(--ink)" }]
      : [];

  const densityShown = units === "US" ? concreteDensity : concreteDensity * PCF_TO_KGM3;
  const toggle = (key: string, label: string, initial = false) => (
    <Toggle key={key} label={label} value={q.bool(key, initial)} onChange={(v) => q.set(key, v ? "1" : "0")} />
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="AISC Design Guide 11 · Floor vibrations"
        title="Floor vibration"
        description="Low-frequency walking response, rhythmic excitation, and sensitive-equipment velocity criteria for steel-framed floors. The floor is a simply supported uniform bay with W beams and girders."
        actions={<Button onClick={() => window.print()}>Print report</Button>}
      />
      <p className="text-xs text-muted">
        Walking acceleration follows DG 11 Eq. 4-1; effective panel widths and weights follow Eqs. 4-2 through 4-6.
        Rhythmic response uses Eqs. 5-1 and 5-2. Equipment criteria compare spectral RMS velocity with the DG 11
        Chapter 6 VC curves. <SpecRef>DG 11 §§3–6</SpecRef>
      </p>

      <div className="grid items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Occupancy and bay" subtitle={<SpecRef>DG 11 Table 4-1</SpecRef>}>
            <div className="space-y-3">
              <Select
                label="Occupancy preset"
                value={occupancy}
                onChange={(v) => q.set("occ", v)}
                options={(Object.keys(OCCUPANCIES) as Occupancy[]).map((id) => ({
                  value: id,
                  label: `${OCCUPANCIES[id].label} · β = ${fmt(OCCUPANCIES[id].damping, 2)}, a₀ = ${fmt(
                    OCCUPANCIES[id].tolerance * 100,
                    2,
                  )} %g`,
                }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <ShapePicker
                  label="Beam"
                  types={["W"]}
                  value={beam}
                  onChange={(s) => q.set("beam", slugOf(s.label))}
                />
                <ShapePicker
                  label="Girder"
                  types={["W"]}
                  value={girder}
                  onChange={(s) => q.set("girder", slugOf(s.label))}
                />
                <QuantityInput label="Beam span" quantity="span" value={beamSpan} onChange={(v) => q.set("Lb", v)} />
                <QuantityInput
                  label="Girder span"
                  quantity="span"
                  value={girderSpan}
                  onChange={(v) => q.set("Lg", v)}
                />
                <QuantityInput label="Beam spacing" quantity="span" value={spacing} onChange={(v) => q.set("s", v)} />
                <QuantityInput
                  label="Floor width"
                  quantity="span"
                  value={floorWidth}
                  onChange={(v) => q.set("Bf", v)}
                />
                <QuantityInput
                  label="Floor length"
                  quantity="span"
                  value={floorLength}
                  onChange={(v) => q.set("Lf", v)}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {toggle("comp", "Full dynamic composite action", true)}
                {toggle("edgeBeam", "Edge beam")}
                {toggle("edgeGirder", "Edge girder")}
                {toggle("beamCont", "Beam continuous over support")}
                {toggle("girderCont", "Girder continuous over support")}
              </div>
              <p className="text-xs text-muted">
                Use actual day-to-day loading, not the strength-design live load. Composite action requires slab contact
                and shear connection. <SpecRef>DG 11 §3.2</SpecRef> <SpecRef>DG 11 §3.3</SpecRef>
              </p>
            </div>
          </Card>

          <Card title="Slab, deck and supported mass" subtitle={<SpecRef>DG 11 §3.2–3.3</SpecRef>}>
            <div className="grid gap-3 sm:grid-cols-2">
              <QuantityInput
                label="Topping above deck"
                quantity="length"
                value={slabThickness}
                onChange={(v) => q.set("ts", v)}
              />
              <QuantityInput label="Deck rib depth" quantity="length" value={deckDepth} onChange={(v) => q.set("hd", v)} />
              <QuantityInput
                label="Concrete strength f′c"
                quantity="stress"
                value={concreteStrength}
                onChange={(v) => q.set("fc", v)}
              />
              <NumberInput
                label={`Concrete density (${units === "US" ? "lb/ft³" : "kg/m³"})`}
                value={densityShown}
                onChange={(v) =>
                  q.set("wc", v === undefined ? undefined : units === "US" ? v : v / PCF_TO_KGM3)
                }
              />
              <QuantityInput
                label="Superimposed dead load"
                quantity="areaLoad"
                value={superimposed}
                onChange={(v) => q.set("sd", v)}
              />
              <QuantityInput
                label="Day-to-day live load"
                quantity="areaLoad"
                value={liveLoad}
                onChange={(v) => q.set("ll", v)}
              />
              <QuantityInput
                label="Deck weight"
                quantity="areaLoad"
                value={deckWeight}
                onChange={(v) => q.set("dw", v)}
              />
            </div>
            <p className="mt-3 text-xs text-muted">
              Transformed inertia uses the dynamic concrete modulus, 1.35E<sub>c</sub>, and the solid topping over the
              effective panel width; deck ribs add weight but not longitudinal stiffness. <SpecRef>DG 11 Eq. 4-3c</SpecRef>
            </p>
          </Card>

          <Card title="Damping and continuity" subtitle={<SpecRef>DG 11 Table 4-2</SpecRef>}>
            <div className="space-y-3">
              <Select
                label="Damping ratio"
                value={dampingMode}
                onChange={(v) => q.set("damping", v)}
                options={[
                  { value: "preset", label: `Occupancy preset · β = ${fmt(OCCUPANCIES[occupancy].damping, 2)}` },
                  { value: "custom", label: "Custom" },
                ]}
              />
              {dampingMode === "custom" && (
                <NumberInput label="Custom damping ratio β" value={q.num("beta", 0.03)} onChange={(v) => q.set("beta", v)} />
              )}
              <p className="text-xs text-muted">
                Damping is the most uncertain input. DG 11 Table 4-2 values are for finished floors with normal
                furnishings; open ceilings, partitions and fit-out can change the effective value. Continuity multipliers
                apply only where the adjacent span is at least 0.7 of the span considered. <SpecRef>DG 11 §4.1.2</SpecRef>
              </p>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <InputError error={check.error} />
          {r && (
            <>
              <Card
                title="Walking criterion"
                subtitle={<SpecRef>DG 11 Eq. 4-1</SpecRef>}
                actions={
                  <Badge tone={!r.applicable ? "warn" : r.pass ? "pass" : "fail"}>
                    {!r.applicable ? "OUTSIDE 3–9 Hz" : r.pass ? "PASS" : "FAIL"}
                  </Badge>
                }
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Natural frequency" value={`${fmt(r.fn, 2)} Hz`} />
                  <Stat
                    label="Peak acceleration"
                    value={`${fmt(r.acceleration * 100, 3)} %g`}
                    tone={r.pass ? "pass" : "fail"}
                  />
                  <Stat label="Tolerance" value={`${fmt(r.tolerance * 100, 2)} %g`} />
                  <Stat label="Effective weight" value={fmtQ(r.W, "force", units)} />
                </div>
                <div className="mt-3">
                  <RatioBar ratio={r.ratio} label="a / a₀" />
                </div>
                <p className="mt-3 text-xs text-muted">
                  Beam mode f<sub>j</sub> = {fmt(r.fj, 2)} Hz · girder mode f<sub>g</sub> = {fmt(r.fg, 2)} Hz ·
                  combined damping β = {fmt(r.beta, 3)}. The separate beam-mode acceleration is{" "}
                  {fmt((r.acceleration / (r.ratio || 1)) * 100, 3)} %g of the combined value only when the beam span is
                  less than half the girder span. <SpecRef>DG 11 §4.1.2</SpecRef>
                </p>
                {!r.applicable && (
                  <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                    DG 11 Eq. 4-1 is a low-frequency floor criterion for 3–9 Hz. Outside that range the result is shown
                    for context but no walking PASS is issued. Use DG 11 Chapter 5 below 3 Hz, and Chapter 6 or 7 for
                    high-frequency response.
                  </p>
                )}
                {r.warnings.map((w) => (
                  <p key={w} className="mt-2 text-xs text-muted">
                    {w}
                  </p>
                ))}
              </Card>

              <Card
                title="Walking acceleration vs equal bay span"
                subtitle={<SpecRef>DG 11 Eq. 4-1</SpecRef>}
              >
                {accelerationSeries.length > 0 ? (
                  <>
                    <LineChart
                      series={accelerationSeries}
                      xLabel="Equal beam and girder span (ft)"
                      yLabel="Peak acceleration (%g)"
                      markers={accelerationMarkers}
                      yMin={0}
                      formatX={(v) => fmt(v, 3)}
                      formatY={(v) => fmt(v, 2)}
                    />
                    <p className="mt-2 text-xs text-muted">
                      Beam and girder spans are set equal to the plotted span; spacing, slab, mass and damping remain as
                      entered. Points outside the 3–9 Hz applicability range are omitted. The dashed line is the
                      occupancy tolerance a<sub>0</sub>.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted">
                    No applicable points in the 18–42 ft sweep for the current framing. Widen the bay or reduce the
                    supported mass and check the frequency range.
                  </p>
                )}
              </Card>
            </>
          )}

          <Card
            title="Rhythmic activity"
            subtitle={<SpecRef>DG 11 Eqs. 5-1, 5-2 · Table 5-1</SpecRef>}
            actions={
              rr && (
                <Badge tone={!rr.applicable ? "warn" : rr.pass ? "pass" : "fail"}>
                  {!rr.applicable ? "STEP FREQUENCY OUTSIDE TABLE" : rr.pass ? "PASS" : "FAIL"}
                </Badge>
              )
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Activity"
                value={activity}
                onChange={(v) => q.set("activity", v)}
                options={(Object.keys(RHYTHMIC_ACTIVITIES) as (keyof typeof RHYTHMIC_ACTIVITIES)[]).map((id) => ({
                  value: id,
                  label: RHYTHMIC_ACTIVITIES[id].label,
                }))}
              />
              <NumberInput
                label="Step frequency f_step (Hz)"
                value={q.num("fstep", 1.8)}
                onChange={(v) => q.set("fstep", v)}
                hint={`Table range ${fmt(RHYTHMIC_ACTIVITIES[activity].min, 2)}–${fmt(
                  RHYTHMIC_ACTIVITIES[activity].max,
                  2,
                )} Hz`}
              />
              <NumberInput
                label="Participant weight / floor weight"
                value={q.num("wratio", 0.1)}
                onChange={(v) => q.set("wratio", v)}
                hint="Distributed over the activity bay; 0 to 1"
              />
              <NumberInput
                label="Damping ratio β"
                value={rhythmDamping}
                onChange={(v) => q.set("rbeta", v)}
                hint="DG 11 §5.2 recommends about 0.06 for rhythmic crowd loading"
              />
              <NumberInput
                label="Tolerance a₀ (%g)"
                value={rhythmTolerance * 100}
                onChange={(v) => q.set("rtol", v === undefined ? undefined : v / 100)}
                hint="Affected occupancy: office/residential 0.5; dining 1.5–2.5; rhythmic only 4–7"
              />
              <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
                Floor frequency used: <span className="num text-ink">{r ? `${fmt(r.fn, 2)} Hz` : "—"}</span>
                <br />
                {r
                  ? "The check uses the natural frequency from the walking model above."
                  : "Complete the walking model to obtain f_n."}
              </div>
            </div>
            <InputError error={rhythm.error} />
            {rr && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Stat
                    label="Peak rhythmic acceleration"
                    value={`${fmt(rr.acceleration * 100, 3)} %g`}
                    tone={rr.pass ? "pass" : "fail"}
                  />
                  <Stat label="Tolerance" value={`${fmt(rhythmTolerance * 100, 2)} %g`} />
                </div>
                <RatioBar ratio={rr.acceleration / rhythmTolerance} label="a / a₀" />
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-faint">
                      <th className="py-1 font-medium">Harmonic</th>
                      <th className="py-1 text-right font-medium">a_p,i / g</th>
                      <th className="py-1 text-right font-medium">i f_step (Hz)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rr.harmonics.map((a, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="py-1.5">{i + 1}</td>
                        <td className="num py-1.5 text-right">{fmt(a, 4)}</td>
                        <td className="num py-1.5 text-right">{fmt((i + 1) * q.num("fstep", 1.8), 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Steps steps={rr.steps} />
                <p className="text-xs text-muted">
                  Table 5-1 limits are for the affected occupancy, not necessarily the activity itself. The 1.5-power
                  rule combines the harmonic responses. Damping is usually taken as about 0.06 for rhythmic crowd
                  loading. <SpecRef>DG 11 §5.2</SpecRef>
                </p>
              </div>
            )}
          </Card>

          <Card
            title="Sensitive equipment · VC curves"
            subtitle={<SpecRef>DG 11 Chapter 6 · Table 6-1</SpecRef>}
            actions={
              eq && (
                <Badge tone={!eq.applicable ? "warn" : eq.pass ? "pass" : "fail"}>
                  {!eq.applicable ? "OUTSIDE VC FREQUENCY RANGE" : eq.pass ? "PASS" : "FAIL"}
                </Badge>
              )
            }
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="Criterion"
                value={criterion}
                onChange={(v) => q.set("vc", v)}
                options={(Object.keys(VELOCITY_CRITERIA) as (keyof typeof VELOCITY_CRITERIA)[]).map((id) => ({
                  value: id,
                  label: `${id} · ${fmt(VELOCITY_CRITERIA[id])} µin./s`,
                }))}
              />
              <NumberInput
                label="Band frequency (Hz)"
                value={vcFrequency}
                onChange={(v) => q.set("vcf", v)}
                hint="VC-A and VC-B begin at 8 Hz; all curves end at 80 Hz"
              />
              <NumberInput
                label="Spectral RMS velocity (µin./s)"
                value={velocity * 1e6}
                onChange={(v) => q.set("vcv", v === undefined ? undefined : v / 1e6)}
                hint="One-third-octave RMS velocity, not a converted peak acceleration"
              />
            </div>
            <InputError error={equipment.error} />
            {eq && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Stat label="Criterion limit" value={`${fmt(eq.limit * 1e6)} µin./s`} />
                <Stat label="D / C" value={fmt(eq.ratio, 3)} tone={eq.pass ? "pass" : "fail"} />
              </div>
            )}
            <div className="mt-3">
              <LineChart
                series={vcSeries}
                xLabel="Band frequency (Hz, log scale)"
                yLabel="RMS velocity (µin./s)"
                markers={vcMarkers}
                yMin={0}
                xMin={0}
                formatX={(v) => fmt(10 ** v, 2)}
                formatY={(v) => fmt(v)}
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              This compares an input spectral velocity with the VC curve, as defined in DG 11 Chapter 6. Converting a
              walking peak acceleration to velocity is not a Chapter 6 analysis. VC-A through VC-E are available; VC-F
              and VC-G are not implemented. <SpecRef>DG 11 §6.1</SpecRef>
            </p>
          </Card>

          {r && <Steps steps={r.steps} />}

          <Card title="Applicability and limits">
            <p className="text-xs text-muted">
              DG 11 Eq. 4-1 applies to low-frequency floors with a fundamental frequency of 3–9 Hz, uniform simply
              supported bays, W beams and girders, and full composite action with the slab. The model assumes a uniform
              mass distribution, a single mode, and no interaction with columns, walls or adjacent bays. It does not
              address high-frequency floors, cantilevers, transfer structures, crowd synchronization, or equipment
              isolation. <SpecRef>DG 11 §4.1</SpecRef> <SpecRef>DG 11 §3.2</SpecRef>
            </p>
            <p className="mt-2 text-xs text-muted">
              Serviceability criteria do not use the LRFD/ASD resistance factors. The occupancy tolerance and damping
              selection govern the result. Verify the assumptions against the actual framing, deck and connection
              details before issuing a design.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
