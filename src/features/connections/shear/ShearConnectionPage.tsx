import { useMemo } from "react";
import {
  designShearConnection,
  suggestBoltRows,
  type CopeKind,
  type ShearConnectionType,
  type SupportKind,
} from "@/aisc/connections/shear";
import type { BoltGroup, HoleType, ThreadCondition } from "@/aisc/connections/types";
import { useSettings } from "@/app/settings";
import { ShapePicker } from "@/components/ShapePicker";
import {
  Badge,
  Button,
  Card,
  NumberInput,
  PageHeader,
  QuantityInput,
  RatioBar,
  Segmented,
  Select,
  SpecRef,
  Stat,
} from "@/components/ui";
import { MATERIALS, materialById, materialsFor } from "@/data/materials";
import { familyOf, findShape, slugOf, type Shape } from "@/data/shapes";
import { useQueryState } from "@/features/column/url-state";
import { fmt, fmtQ } from "@/lib/units";

const TYPES: { value: ShearConnectionType; label: string }[] = [
  { value: "single-plate", label: "Single plate" },
  { value: "double-angle", label: "Double angle" },
  { value: "seated", label: "Seated" },
  { value: "end-plate", label: "End plate" },
];

const BOLT_D = [0.625, 0.75, 0.875, 1, 1.125].map((d) => ({ value: String(d), label: `${d}"` }));

function pickShape(raw: string, fallback: string): Shape {
  return findShape(raw) ?? findShape(fallback)!;
}

export function ShearConnectionPage() {
  const q = useQueryState();
  const { method, units } = useSettings();

  const type = (TYPES.some((t) => t.value === q.str("type", "single-plate"))
    ? q.str("type", "single-plate")
    : "single-plate") as ShearConnectionType;
  const beam = pickShape(q.str("beam", "W18X50"), "W18X50");
  const beamMat = materialById(q.str("beamMat", "A992")) ?? MATERIALS[0]!;
  const supportShape = findShape(q.str("support", "W14X90"));
  const supportMat = materialById(q.str("supportMat", "A992")) ?? MATERIALS[0]!;
  const angle = findShape(q.str("angle", "L4X4X3/8")) ?? findShape("L3X3X3/8");

  const R = q.numOr("R", 40);
  const n = Math.max(2, Math.round(q.numOr("n", 4)));
  const s = q.numOr("s", 3);
  const top = q.numOr("top", 3);
  const boltD = q.numOr("boltD", 0.75);
  const boltGroup = q.str("boltGroup", "A") as BoltGroup;
  const threads = q.str("threads", "N") as ThreadCondition;
  const hole = q.str("hole", "STD") as HoleType;
  const setback = q.numOr("setback", 0.5);
  const LehBeam = q.numOr("LehBeam", 1.5);
  const weldW = q.numOr("weld", 0.25);
  const FEXX = q.numOr("FEXX", 70);
  const tp = q.numOr("tp", 0.375);
  const Lev = q.numOr("Lev", 1.25);
  const Leh = q.numOr("Leh", 1.25);
  const cols = (q.numOr("cols", 1) >= 2 ? 2 : 1) as 1 | 2;
  const gCols = q.numOr("gCols", 3);
  const config = q.str("config", "auto") as "auto" | "conventional" | "extended";
  const copeKind = q.str("cope", "none") as CopeKind;
  const copeC = q.numOr("copeC", 2.5);
  const copeDct = q.numOr("copeDct", 1.5);
  const copeDcb = q.numOr("copeDcb", 1.5);
  const supportKind = q.str("supportKind", "column-flange") as SupportKind;
  const gOSL = q.numOr("gOSL", 2.5);
  const beamSide = q.str("beamSide", "bolted") as "bolted" | "welded";
  const seatedRows = (q.numOr("seatRows", 1) >= 2 ? 2 : 1) as 1 | 2;
  const La = q.numOr("La", 6);
  const plateWidth = q.numOr("plateW", 6.5);
  const gage = q.numOr("gage", 3.5);
  const legOnBeam = q.str("legOnBeam", "long") as "long" | "short";
  const horizLeg = q.str("horizLeg", "long") as "long" | "short";
  const seatAttach = q.str("seatAttach", "bolted") as "bolted" | "welded";
  const g1 = q.numOr("g1", 1.25);
  const gw = q.numOr("gw", 2.5);

  const plateMat = materialById(q.str("plateMat", "A36")) ?? MATERIALS.find((m) => m.id === "A36")!;

  const attempt = useMemo(() => {
    try {
      const input = {
        type,
        method,
        R,
        beam,
        beamMaterial: beamMat,
        cope: { kind: copeKind, c: copeC, dct: copeDct, dcb: copeDcb },
        support: { kind: supportKind, shape: supportShape, material: supportMat },
        bolts: { bolt: { d: boltD, group: boltGroup, threads }, hole, n, s, top },
        setback,
        LehBeam,
        weld: { w: weldW, FEXX },
        singlePlate:
          type === "single-plate" ? { tp, material: plateMat, Lev, Leh, cols, gCols, config } : undefined,
        doubleAngle:
          type === "double-angle" && angle
            ? { angle, material: plateMat, legOnBeam, Lev, beamSide, gOSL }
            : undefined,
        seated:
          type === "seated" && angle
            ? { angle, material: plateMat, horizontalLeg: horizLeg, La, attach: seatAttach, rows: seatedRows, g1, gw }
            : undefined,
        endPlate: type === "end-plate" ? { tp, material: plateMat, width: plateWidth, gage, Lev } : undefined,
      };
      return { report: designShearConnection(input), suggestion: suggestBoltRows(input) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [
    type,
    method,
    R,
    beam,
    beamMat,
    copeKind,
    copeC,
    copeDct,
    copeDcb,
    supportKind,
    supportShape,
    supportMat,
    boltD,
    boltGroup,
    threads,
    hole,
    n,
    s,
    top,
    setback,
    LehBeam,
    weldW,
    FEXX,
    tp,
    plateMat,
    Lev,
    Leh,
    cols,
    gCols,
    config,
    angle,
    beamSide,
    gOSL,
    La,
    seatedRows,
    plateWidth,
    gage,
    legOnBeam,
    horizLeg,
    seatAttach,
    g1,
    gw,
  ]);

  const report = "report" in attempt ? attempt.report : undefined;
  const groups = report
    ? (["Bolts", "Welds", "Connecting element", "Supported beam", "Support"] as const).map((group) => ({
        group,
        checks: report.checks.filter((c) => c.group === group),
      }))
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Connections · Manual Parts 9–10"
        title="Shear connections"
        description="Single-plate, double-angle, seated and end-plate shear connections with coped-beam checks."
        actions={<Badge tone={report?.pass ? "pass" : "fail"}>{report?.pass ? "PASS" : "FAIL"}</Badge>}
      />

      <Segmented value={type} onChange={(v) => q.set({ type: v })} options={TYPES} />

      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Beam & demand">
            <div className="space-y-3">
              <ShapePicker
                value={beam}
                onChange={(s) => q.set({ beam: slugOf(s.label) })}
                types={["W", "M", "S", "HP"]}
              />
              <Select
                label="Beam material"
                value={beamMat.id}
                onChange={(v) => q.set({ beamMat: v })}
                options={materialsFor(familyOf(beam)).map((m) => ({ value: m.id, label: m.name }))}
              />
              <QuantityInput label="Required reaction R" quantity="force" value={R} onChange={(v) => q.set({ R: v ?? 0 })} />
              <Select
                label="Cope"
                value={copeKind}
                onChange={(v) => q.set({ cope: v })}
                options={[
                  { value: "none", label: "None" },
                  { value: "top", label: "Top cope" },
                  { value: "both", label: "Top and bottom" },
                ]}
              />
              {copeKind !== "none" && (
                <div className="grid grid-cols-2 gap-3">
                  <QuantityInput label="Cope length c" quantity="length" value={copeC} onChange={(v) => q.set({ copeC: v ?? 0 })} />
                  <QuantityInput label="Top depth dct" quantity="length" value={copeDct} onChange={(v) => q.set({ copeDct: v ?? 0 })} />
                  {copeKind === "both" && (
                    <QuantityInput label="Bottom depth dcb" quantity="length" value={copeDcb} onChange={(v) => q.set({ copeDcb: v ?? 0 })} />
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card title="Bolts & weld">
            <div className="grid grid-cols-2 gap-3">
              <Select label="Bolt diameter" value={String(boltD)} onChange={(v) => q.set({ boltD: Number(v) })} options={BOLT_D} />
              <Select
                label="Bolt group"
                value={boltGroup}
                onChange={(v) => q.set({ boltGroup: v })}
                options={[
                  { value: "A", label: "Group 120" },
                  { value: "B", label: "Group 150" },
                  { value: "C", label: "Group 200" },
                ]}
              />
              <Select
                label="Threads"
                value={threads}
                onChange={(v) => q.set({ threads: v })}
                options={[
                  { value: "N", label: "N · included" },
                  { value: "X", label: "X · excluded" },
                ]}
              />
              <Select
                label="Hole"
                value={hole}
                onChange={(v) => q.set({ hole: v })}
                options={[
                  { value: "STD", label: "STD" },
                  { value: "OVS", label: "OVS" },
                  { value: "SSL", label: "SSL" },
                ]}
              />
              <NumberInput label="Bolt rows n" value={n} onChange={(v) => q.set({ n: Math.max(2, Math.round(v ?? 2)) })} />
              <QuantityInput label="Pitch s" quantity="length" value={s} onChange={(v) => q.set({ s: v ?? 0 })} />
              <QuantityInput label="Top distance" quantity="length" value={top} onChange={(v) => q.set({ top: v ?? 0 })} />
              <QuantityInput label="Setback" quantity="length" value={setback} onChange={(v) => q.set({ setback: v ?? 0 })} />
              <QuantityInput label="Beam edge Leh" quantity="length" value={LehBeam} onChange={(v) => q.set({ LehBeam: v ?? 0 })} />
              <QuantityInput label="Fillet weld w" quantity="length" value={weldW} onChange={(v) => q.set({ weld: v ?? 0 })} />
              <QuantityInput label="FEXX" quantity="stress" value={FEXX} onChange={(v) => q.set({ FEXX: v ?? 0 })} />
            </div>
            {"suggestion" in attempt && attempt.suggestion && (
              <div className="mt-3">
                <Button onClick={() => q.set({ n: attempt.suggestion!.n })}>
                  Use {attempt.suggestion.n} rows (lightest passing)
                </Button>
              </div>
            )}
          </Card>

          {(type === "single-plate" || type === "end-plate") && (
            <Card title={type === "single-plate" ? "Single plate" : "End plate"}>
              <div className="grid grid-cols-2 gap-3">
                <QuantityInput label="Plate thickness" quantity="length" value={tp} onChange={(v) => q.set({ tp: v ?? 0 })} />
                <Select
                  label="Plate material"
                  value={plateMat.id}
                  onChange={(v) => q.set({ plateMat: v })}
                  options={MATERIALS.filter((m) => m.id === "A36" || m.appliesTo.includes("i-shape")).map((m) => ({
                    value: m.id,
                    label: m.name,
                  }))}
                />
                <QuantityInput label="Vertical edge Lev" quantity="length" value={Lev} onChange={(v) => q.set({ Lev: v ?? 0 })} />
                {type === "single-plate" ? (
                  <>
                    <QuantityInput label="Horizontal edge Leh" quantity="length" value={Leh} onChange={(v) => q.set({ Leh: v ?? 0 })} />
                    <NumberInput label="Bolt columns" value={cols} onChange={(v) => q.set({ cols: v && v >= 2 ? 2 : 1 })} />
                    <QuantityInput label="Column gage" quantity="length" value={gCols} onChange={(v) => q.set({ gCols: v ?? 0 })} />
                    <Select
                      label="Configuration"
                      value={config}
                      onChange={(v) => q.set({ config: v })}
                      options={[
                        { value: "auto", label: "Auto" },
                        { value: "conventional", label: "Conventional" },
                        { value: "extended", label: "Extended" },
                      ]}
                    />
                  </>
                ) : (
                  <>
                    <QuantityInput label="Plate width" quantity="length" value={plateWidth} onChange={(v) => q.set({ plateW: v ?? 0 })} />
                    <QuantityInput label="Bolt gage" quantity="length" value={gage} onChange={(v) => q.set({ gage: v ?? 0 })} />
                  </>
                )}
              </div>
            </Card>
          )}

          {(type === "double-angle" || type === "seated") && (
            <Card title={type === "double-angle" ? "Double angles" : "Seat angle"}>
              <div className="space-y-3">
                <ShapePicker
                  label="Angle"
                  value={angle}
                  onChange={(s) => q.set({ angle: slugOf(s.label) })}
                  types={["L"]}
                />
                {type === "double-angle" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="Beam-side attachment"
                      value={beamSide}
                      onChange={(v) => q.set({ beamSide: v })}
                      options={[
                        { value: "bolted", label: "Bolted" },
                        { value: "welded", label: "Welded" },
                      ]}
                    />
                    <Select
                      label="Leg on beam"
                      value={legOnBeam}
                      onChange={(v) => q.set({ legOnBeam: v })}
                      options={[
                        { value: "long", label: "Long" },
                        { value: "short", label: "Short" },
                      ]}
                    />
                    <QuantityInput label="Outstanding gage" quantity="length" value={gOSL} onChange={(v) => q.set({ gOSL: v ?? 0 })} />
                    <QuantityInput label="Vertical edge Lev" quantity="length" value={Lev} onChange={(v) => q.set({ Lev: v ?? 0 })} />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <QuantityInput label="Angle length La" quantity="length" value={La} onChange={(v) => q.set({ La: v ?? 0 })} />
                    <NumberInput label="Vertical rows" value={seatedRows} onChange={(v) => q.set({ seatRows: v && v >= 2 ? 2 : 1 })} />
                    <Select
                      label="Horizontal leg"
                      value={horizLeg}
                      onChange={(v) => q.set({ horizLeg: v })}
                      options={[
                        { value: "long", label: "Long" },
                        { value: "short", label: "Short" },
                      ]}
                    />
                    <Select
                      label="Attachment"
                      value={seatAttach}
                      onChange={(v) => q.set({ seatAttach: v })}
                      options={[
                        { value: "bolted", label: "Bolted" },
                        { value: "welded", label: "Welded" },
                      ]}
                    />
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card title="Support">
            <div className="space-y-3">
              <Select
                label="Support type"
                value={supportKind}
                onChange={(v) => q.set({ supportKind: v })}
                options={[
                  { value: "column-flange", label: "Column flange" },
                  { value: "column-web", label: "Column web" },
                  { value: "girder-web", label: "Girder web" },
                ]}
              />
              <ShapePicker
                label="Support shape"
                value={supportShape}
                onChange={(s) => q.set({ support: slugOf(s.label) })}
                types={["W", "M", "S", "HP"]}
              />
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          {"error" in attempt && attempt.error && (
            <div role="alert" className="rounded-lg border border-line bg-warn-soft p-3 text-sm text-warn">
              {attempt.error}
            </div>
          )}

          {report && (
            <>
              <Card title="Design summary" subtitle={report.procedure}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Controlling D/C" value={fmt(report.maxRatio, 3)} />
                  <Stat label="Governing" value={report.governing?.title ?? "—"} />
                  <Stat label="Method" value={method} />
                  <Stat label="Reaction" value={fmtQ(R, "force", units)} />
                </div>
                <div className="mt-3">
                  <RatioBar ratio={report.maxRatio} label="Max ratio" />
                </div>
              </Card>

              {groups.map(
                ({ group, checks }) =>
                  checks.length > 0 && (
                    <Card key={group} title={group}>
                      <div className="space-y-3">
                        {checks.map((c) => (
                          <div key={c.id}>
                            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span>
                                {c.title} <SpecRef>{c.result.section}</SpecRef>
                              </span>
                              <span className="num text-muted">
                                {fmtQ(c.demand, "force", units)} / {fmtQ(c.available, "force", units)}
                              </span>
                            </div>
                            <RatioBar ratio={c.ratio} />
                          </div>
                        ))}
                      </div>
                    </Card>
                  ),
              )}

              {report.detailing.length > 0 && (
                <Card title="Detailing">
                  <div className="space-y-2">
                    {report.detailing.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 text-xs">
                        <span>
                          {d.label} <SpecRef>{d.ref}</SpecRef>
                          {d.note ? <span className="text-muted"> — {d.note}</span> : null}
                        </span>
                        <Badge tone={d.pass ? "pass" : d.advisory ? "warn" : "fail"}>
                          {d.pass ? "OK" : d.advisory ? "NOTE" : "REVISE"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {report.warnings.length > 0 && (
                <Card title="Warnings">
                  <ul className="space-y-2 text-xs text-warn">
                    {report.warnings.map((w, i) => (
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
