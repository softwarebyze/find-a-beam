import { useMemo } from "react";
import { available } from "@/aisc/common";
import {
  limitStateRatios,
  momentConnection,
  plateToHss,
  trussConnection,
  type MomentConnectionInput,
  type PlateKind,
  type PlateToHssInput,
  type TrussConnectionInput,
  type TrussJoint,
} from "@/aisc/hss-connections";
import { useSettings } from "@/app/settings";
import { CalcReport, StepRow } from "@/components/CalcReport";
import { ShapePicker } from "@/components/ShapePicker";
import {
  Badge,
  Card,
  PageHeader,
  QuantityInput,
  RatioBar,
  Segmented,
  Select,
  SpecRef,
  Stat,
} from "@/components/ui";
import { materialById, materialsFor } from "@/data/materials";
import { familyOf, findShape, slugOf, type Shape, type ShapeFamily } from "@/data/shapes";
import { useQueryState } from "@/features/column/url-state";
import { fmt, fmtQ, type Quantity } from "@/lib/units";

type Tab = "plate" | "truss" | "moment";

const TABS: { value: Tab; label: string }[] = [
  { value: "plate", label: "Plate" },
  { value: "truss", label: "Truss" },
  { value: "moment", label: "Moment" },
];

const PLATE_KINDS: { value: PlateKind; label: string }[] = [
  { value: "transverse", label: "Transverse" },
  { value: "longitudinal", label: "Longitudinal" },
  { value: "through", label: "Through" },
];

const TRUSS_JOINTS: { value: TrussJoint; label: string }[] = [
  { value: "T", label: "T" },
  { value: "Y", label: "Y" },
  { value: "X", label: "Cross (X)" },
  { value: "K-gap", label: "K — gapped" },
  { value: "K-overlap", label: "K — overlapped" },
];

const MOMENT_JOINTS: { value: MomentConnectionInput["joint"]; label: string }[] = [
  { value: "T", label: "T" },
  { value: "Y", label: "Y" },
  { value: "X", label: "Cross (X)" },
];

function pickShape(raw: string, fallback: string): Shape {
  return findShape(raw) ?? findShape(fallback)!;
}

function defaultMaterialId(family: ShapeFamily): string {
  if (family === "hss-round") return "A500C-round";
  if (family === "pipe") return "A53B";
  return "A500C-rect";
}

function member(shape: Shape, matId: string) {
  const family = familyOf(shape);
  const material = materialById(matId) ?? materialById(defaultMaterialId(family))!;
  return { shape, material };
}

export function HssConnectionPage() {
  const q = useQueryState();
  const { method, units } = useSettings();

  const tab = (TABS.some((t) => t.value === q.str("tab", "plate")) ? q.str("tab", "plate") : "plate") as Tab;

  const chord = pickShape(q.str("chord", "HSS8X8X1/2"), "HSS8X8X1/2");
  const chordFamily = familyOf(chord);
  const chordMat =
    materialById(q.str("chordMat", defaultMaterialId(chordFamily))) ??
    materialById(defaultMaterialId(chordFamily))!;

  const branch = pickShape(q.str("branch", "HSS4X4X1/4"), "HSS4X4X1/4");
  const branchFamily = familyOf(branch);
  const branchMat =
    materialById(q.str("branchMat", defaultMaterialId(branchFamily))) ??
    materialById(defaultMaterialId(branchFamily))!;

  const otherBranch = pickShape(q.str("otherBranch", "HSS4X4X1/4"), "HSS4X4X1/4");
  const otherMat =
    materialById(q.str("otherMat", defaultMaterialId(familyOf(otherBranch)))) ??
    materialById(defaultMaterialId(familyOf(otherBranch)))!;

  const plateKind = (PLATE_KINDS.some((k) => k.value === q.str("kind", "transverse"))
    ? q.str("kind", "transverse")
    : "transverse") as PlateKind;

  const trussJoint = (TRUSS_JOINTS.some((j) => j.value === q.str("joint", "T"))
    ? q.str("joint", "T")
    : "T") as TrussJoint;

  const momentJoint = (MOMENT_JOINTS.some((j) => j.value === q.str("mJoint", "T"))
    ? q.str("mJoint", "T")
    : "T") as MomentConnectionInput["joint"];

  const plane = q.str("plane", "in-plane") === "out-of-plane" ? "out-of-plane" : "in-plane";

  const attempt = useMemo(() => {
    try {
      const chordLoads = {
        axial: q.numOpt("chordAxial"),
        moment: q.numOpt("chordMoment"),
      };
      const hasChordLoads = chordLoads.axial !== undefined || chordLoads.moment !== undefined;

      if (tab === "plate") {
        const input: PlateToHssInput = {
          chord: member(chord, chordMat.id),
          method,
          kind: plateKind,
          Bp: q.numOr("Bp", 4),
          lb: q.numOr("lb", 0.5),
          tp: q.numOr("tp", 0.375),
          theta: q.numOr("theta", 90),
          demand: q.numOpt("demand"),
          plateForce: q.str("plateForce", "tension") === "compression" ? "compression" : "tension",
          cross: q.bool("cross"),
          chordLoads: hasChordLoads ? chordLoads : undefined,
        };
        return { result: plateToHss(input), demand: input.demand, quantity: "force" as const };
      }

      if (tab === "truss") {
        const theta = q.numOr("branchTheta", 90);
        const force = q.numOr("branchForce", 50);
        const input: TrussConnectionInput = {
          chord: member(chord, chordMat.id),
          method,
          joint: trussJoint,
          branch: { ...member(branch, branchMat.id), theta, force },
          gap: trussJoint === "K-gap" ? q.numOr("gap", 1) : undefined,
          overlap: trussJoint === "K-overlap" ? q.numOr("overlap", 25) : undefined,
          otherBranch:
            trussJoint === "K-gap" || trussJoint === "K-overlap"
              ? {
                  ...member(otherBranch, otherMat.id),
                  theta: q.numOr("otherTheta", 45),
                  force: q.numOr("otherForce", -40),
                }
              : undefined,
          gapChordForce: q.numOpt("gapChordForce"),
          chordLoads: hasChordLoads ? chordLoads : undefined,
        };
        return { result: trussConnection(input), demand: Math.abs(force), quantity: "force" as const };
      }

      const demand = q.numOr("momentDemand", 120);
      const input: MomentConnectionInput = {
        chord: member(chord, chordMat.id),
        method,
        joint: momentJoint,
        plane,
        branch: { ...member(branch, branchMat.id), theta: q.numOr("branchTheta", 90) },
        demand,
        chordLoads: hasChordLoads ? chordLoads : undefined,
      };
      return { result: momentConnection(input), demand, quantity: "moment" as const };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [
    tab,
    method,
    chord,
    chordMat.id,
    branch,
    branchMat.id,
    otherBranch,
    otherMat.id,
    plateKind,
    trussJoint,
    momentJoint,
    plane,
    q,
  ]);

  const result = "result" in attempt ? attempt.result : undefined;
  const demand = "demand" in attempt ? attempt.demand : undefined;
  const quantity: Quantity = tab === "moment" ? "moment" : "force";

  const ratios = useMemo(
    () => (result ? limitStateRatios(result, method, demand) : []),
    [result, method, demand],
  );

  const maxRatio = ratios.reduce((m, r) => (r.ratio !== undefined && r.ratio > m ? r.ratio : m), 0);
  const pass = result ? result.applicable && (demand === undefined || maxRatio <= 1) : false;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Connections · Chapter K"
        title="HSS connections"
        description="Plate-to-HSS concentrated forces, HSS truss joints and moment connections per AISC 360-22 Chapter K, including limits of applicability."
        actions={<Badge tone={pass ? "pass" : "fail"}>{pass ? "PASS" : "FAIL"}</Badge>}
      />

      <Segmented value={tab} onChange={(v) => q.set({ tab: v })} options={TABS} />

      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Chord">
            <div className="space-y-3">
              <ShapePicker
                label="Chord HSS"
                value={chord}
                onChange={(s) => q.set({ chord: slugOf(s.label) })}
                types={["HSS", "PIPE"]}
              />
              <Select
                label="Chord material"
                value={chordMat.id}
                onChange={(v) => q.set({ chordMat: v })}
                options={materialsFor(chordFamily).map((m) => ({ value: m.id, label: m.name }))}
              />
              <QuantityInput
                label="Chord axial force (Qf)"
                quantity="force"
                value={q.numOr("chordAxial", 0)}
                onChange={(v) => q.set({ chordAxial: v ?? undefined })}
                hint="Optional signed chord axial, kip"
              />
              <QuantityInput
                label="Chord bending at joint (Qf)"
                quantity="moment"
                value={q.numOr("chordMoment", 0)}
                onChange={(v) => q.set({ chordMoment: v ?? undefined })}
                hint="Optional; + tension on connecting face"
              />
            </div>
          </Card>

          {tab === "plate" && (
            <Card title="Plate & demand">
              <div className="space-y-3">
                <Select
                  label="Plate orientation"
                  value={plateKind}
                  onChange={(kind) => q.set({ kind })}
                  options={PLATE_KINDS}
                />
                <QuantityInput label="Plate width Bp" quantity="length" value={q.numOr("Bp", 4)} onChange={(v) => q.set({ Bp: v ?? 0 })} />
                <QuantityInput
                  label="Bearing length lb"
                  quantity="length"
                  value={q.numOr("lb", 0.5)}
                  onChange={(v) => q.set({ lb: v ?? 0 })}
                  hint="Along chord axis; transverse plates often equal tp"
                />
                <QuantityInput label="Plate thickness tp" quantity="length" value={q.numOr("tp", 0.375)} onChange={(v) => q.set({ tp: v ?? 0 })} />
                <QuantityInput label="Angle θ" quantity="ratio" value={q.numOr("theta", 90)} onChange={(v) => q.set({ theta: v ?? 90 })} hint="Degrees from chord axis" />
                <Select
                  label="Plate force sense"
                  value={q.str("plateForce", "tension")}
                  onChange={(plateForce) => q.set({ plateForce })}
                  options={[
                    { value: "tension", label: "Tension" },
                    { value: "compression", label: "Compression" },
                  ]}
                />
                <QuantityInput
                  label={`Required plate force (${method})`}
                  quantity="force"
                  value={q.numOr("demand", 40)}
                  onChange={(v) => q.set({ demand: v ?? undefined })}
                />
                <label className="flex gap-2 text-xs text-muted">
                  <input type="checkbox" checked={q.bool("cross")} onChange={(e) => q.set({ cross: e.target.checked })} />
                  Cross-connection (plates on opposite faces)
                </label>
              </div>
            </Card>
          )}

          {tab === "truss" && (
            <>
              <Card title="Joint type">
                <Select label="Truss joint" value={trussJoint} onChange={(joint) => q.set({ joint })} options={TRUSS_JOINTS} />
              </Card>
              <Card title="Branch checked">
                <div className="space-y-3">
                  <ShapePicker
                    label="Branch HSS"
                    value={branch}
                    onChange={(s) => q.set({ branch: slugOf(s.label) })}
                    types={["HSS", "PIPE"]}
                  />
                  <Select
                    label="Branch material"
                    value={branchMat.id}
                    onChange={(v) => q.set({ branchMat: v })}
                    options={materialsFor(branchFamily).map((m) => ({ value: m.id, label: m.name }))}
                  />
                  <QuantityInput label="Branch angle θ" quantity="ratio" value={q.numOr("branchTheta", 90)} onChange={(v) => q.set({ branchTheta: v ?? 90 })} hint="Degrees" />
                  <QuantityInput
                    label={`Branch axial force (${method})`}
                    quantity="force"
                    value={q.numOr("branchForce", 50)}
                    onChange={(v) => q.set({ branchForce: v ?? 0 })}
                    hint="Signed: + tension"
                  />
                </div>
              </Card>
              {(trussJoint === "K-gap" || trussJoint === "K-overlap") && (
                <Card title="Second branch (K)">
                  <div className="space-y-3">
                    <ShapePicker
                      label="Other branch HSS"
                      value={otherBranch}
                      onChange={(s) => q.set({ otherBranch: slugOf(s.label) })}
                      types={["HSS", "PIPE"]}
                    />
                    <Select
                      label="Other branch material"
                      value={otherMat.id}
                      onChange={(v) => q.set({ otherMat: v })}
                      options={materialsFor(familyOf(otherBranch)).map((m) => ({ value: m.id, label: m.name }))}
                    />
                    <QuantityInput label="Other branch angle" quantity="ratio" value={q.numOr("otherTheta", 45)} onChange={(v) => q.set({ otherTheta: v ?? 45 })} />
                    <QuantityInput label="Other branch force" quantity="force" value={q.numOr("otherForce", -40)} onChange={(v) => q.set({ otherForce: v ?? 0 })} hint="Signed" />
                    {trussJoint === "K-gap" ? (
                      <QuantityInput label="Gap g along chord face" quantity="length" value={q.numOr("gap", 1)} onChange={(v) => q.set({ gap: v ?? 0 })} />
                    ) : (
                      <QuantityInput label="Overlap Ov (%)" quantity="ratio" value={q.numOr("overlap", 25)} onChange={(v) => q.set({ overlap: v ?? 0 })} hint="Percent of footprint" />
                    )}
                    <QuantityInput
                      label="Chord shear across gap"
                      quantity="force"
                      value={q.numOr("gapChordForce", 0)}
                      onChange={(v) => q.set({ gapChordForce: v ?? undefined })}
                      hint="Optional gapped-K chord check"
                    />
                  </div>
                </Card>
              )}
            </>
          )}

          {tab === "moment" && (
            <>
              <Card title="Joint & plane">
                <div className="space-y-3">
                  <Select label="Moment joint" value={momentJoint} onChange={(mJoint) => q.set({ mJoint })} options={MOMENT_JOINTS} />
                  <Select
                    label="Bending plane"
                    value={plane}
                    onChange={(plane) => q.set({ plane })}
                    options={[
                      { value: "in-plane", label: "In-plane" },
                      { value: "out-of-plane", label: "Out-of-plane" },
                    ]}
                  />
                </div>
              </Card>
              <Card title="Branch & demand">
                <div className="space-y-3">
                  <ShapePicker
                    label="Branch HSS"
                    value={branch}
                    onChange={(s) => q.set({ branch: slugOf(s.label) })}
                    types={["HSS", "PIPE"]}
                  />
                  <Select
                    label="Branch material"
                    value={branchMat.id}
                    onChange={(v) => q.set({ branchMat: v })}
                    options={materialsFor(branchFamily).map((m) => ({ value: m.id, label: m.name }))}
                  />
                  <QuantityInput label="Branch angle θ" quantity="ratio" value={q.numOr("branchTheta", 90)} onChange={(v) => q.set({ branchTheta: v ?? 90 })} />
                  <QuantityInput
                    label={`Required branch moment (${method})`}
                    quantity="moment"
                    value={q.numOr("momentDemand", 120)}
                    onChange={(v) => q.set({ momentDemand: v ?? 0 })}
                  />
                </div>
              </Card>
            </>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {"error" in attempt && attempt.error && (
            <div role="alert" className="rounded-lg border border-line bg-warn-soft p-3 text-sm text-warn">
              {attempt.error}
            </div>
          )}

          {result && (
            <>
              <Card title="Design summary" subtitle={<SpecRef>{result.section}</SpecRef>}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Method" value={method} />
                  <Stat label="Governing" value={result.governing} />
                  <Stat
                    label="Available strength"
                    value={fmtQ(available(result, method), quantity, units)}
                  />
                  <Stat
                    label="Applicability"
                    value={result.applicable ? "Within tables" : "Outside range"}
                  />
                </div>
                {demand !== undefined && (
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs text-muted">
                      <span>Controlling D/C</span>
                      <span className="num">{fmt(maxRatio, 3)}</span>
                    </div>
                    <RatioBar ratio={maxRatio} label="Demand / capacity" />
                  </div>
                )}
              </Card>

              {result.applicability.length > 0 && (
                <Card title="Limits of applicability" subtitle="Chapter K applicability limits — all must pass">
                  <div className="space-y-2">
                    {result.applicability.map((a) => (
                      <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span>
                          {a.label}
                          {a.symbol ? (
                            <span className="text-muted">
                              {" "}
                              ({a.symbol} = {fmt(a.value, 3)}, {a.limit})
                            </span>
                          ) : null}{" "}
                          <SpecRef>{a.ref}</SpecRef>
                        </span>
                        <Badge tone={a.ok ? "pass" : "fail"}>{a.ok ? "OK" : "FAIL"}</Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {result.params.length > 0 && (
                <Card title="Joint parameters">
                  <div className="divide-y divide-line">
                    {result.params.map((s, i) => (
                      <StepRow key={i} step={s} />
                    ))}
                  </div>
                </Card>
              )}

              <Card title="Limit states">
                <div className="space-y-3">
                  {ratios.map((r) => (
                    <div key={r.id}>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span>
                          {r.name}
                          {r.governs ? <Badge tone="accent">governs</Badge> : null} <SpecRef>{r.ref}</SpecRef>
                        </span>
                        <span className="num text-muted">
                          {demand !== undefined && r.ratio !== undefined
                            ? `${fmtQ(demand, quantity, units)} / ${fmtQ(r.available, quantity, units)}`
                            : fmtQ(r.available, quantity, units)}
                        </span>
                      </div>
                      {r.ratio !== undefined ? <RatioBar ratio={r.ratio} /> : null}
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Calculation report">
                <CalcReport result={result} demand={demand} />
              </Card>

              {result.warnings.length > 0 && (
                <Card title="Warnings">
                  <ul className="space-y-2 text-xs text-warn">
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
