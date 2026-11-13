import { useMemo, useState } from "react";
import {
  hangerPlate,
  lightestTeeFitting,
  tensionFitting,
  type HangerPlateAttachment,
} from "@/aisc/connections/hanger";
import type { BoltGroup, ThreadCondition } from "@/aisc/connections/types";
import { useSettings } from "@/app/settings";
import { ShapePicker } from "@/components/ShapePicker";
import { Button, Card, NumberInput, PageHeader, Segmented, Select, SpecRef, Stat } from "@/components/ui";
import { MATERIALS, materialById, materialsFor, preferredMaterial } from "@/data/materials";
import { familyOf, findShape, slugOf, type Shape } from "@/data/shapes";
import { fmtQ } from "@/lib/units";
import {
  CheckResults,
  ConnectionHero,
  ErrorCard,
  useConnectionFields,
} from "../concentrated/ConnectionWorkbench";

const TABS = [
  { value: "fitting", label: "Tee / angle fitting" },
  { value: "plate", label: "Hanger plate" },
] as const;

type Tab = (typeof TABS)[number]["value"];

const BOLT_D = [0.625, 0.75, 0.875, 1].map((d) => ({ value: String(d), label: `${d}"` }));

function pickFitting(raw: string): Shape {
  return findShape(raw) ?? findShape("WT6X25") ?? findShape("L4X4X3/8")!;
}

export function HangerPage() {
  const { q, field } = useConnectionFields();
  const { method, units } = useSettings();
  const [pickMessage, setPickMessage] = useState("");

  const tab = (TABS.some((t) => t.value === q.str("tab", "fitting")) ? q.str("tab", "fitting") : "fitting") as Tab;

  const fitting = pickFitting(q.str("fitting", "WT6X25"));
  const fittingFam = familyOf(fitting);
  const material =
    materialById(q.str("mat", preferredMaterial(fitting.type, fittingFam).id)) ?? MATERIALS.find((m) => m.id === "A36")!;

  const boltD = q.numOr("boltD", 0.75);
  const boltGroup = q.str("boltGroup", "A") as BoltGroup;
  const threads = q.str("threads", "N") as ThreadCondition;

  const fittingRun = useMemo(() => {
    if (tab !== "fitting") return undefined;
    try {
      return tensionFitting({
        method,
        P: q.numOr("P", 80),
        fitting,
        material: { Fy: material.Fy, Fu: material.Fu },
        bolt: { d: boltD, group: boltGroup, threads },
        rows: Math.max(1, Math.round(q.numOr("rows", 3))),
        gage: q.numOr("gage", 3.5),
        length: q.numOr("length", 9),
        angles: (Math.round(q.numOr("angles", 1)) >= 2 ? 2 : 1) as 1 | 2,
        boltedLeg: q.str("boltedLeg", "long") === "short" ? "short" : "long",
      });
    } catch (e) {
      return { error: e };
    }
  }, [tab, method, fitting, material, boltD, boltGroup, threads, q]);

  const plateAttach: HangerPlateAttachment =
    q.str("plateAttach", "bolted") === "welded"
      ? {
          kind: "welded",
          w: q.numOr("weld", 0.25),
          length: q.numOr("weldLen", 8),
          FEXX: q.numOr("FEXX", 70),
        }
      : {
          kind: "bolted",
          bolt: { d: boltD, group: boltGroup, threads },
          rows: Math.max(1, Math.round(q.numOr("plateRows", 2))),
          cols: Math.max(1, Math.round(q.numOr("plateCols", 2))),
          pitch: q.numOr("platePitch", 3),
          gage: q.numOr("plateGage", 3),
          endDistance: q.numOr("plateEnd", 1.5),
          planes: Math.round(q.numOr("planes", 1)) >= 2 ? 2 : 1,
        };

  const plateRun = useMemo(() => {
    if (tab !== "plate") return undefined;
    try {
      return hangerPlate({
        method,
        P: q.numOr("P", 80),
        width: q.numOr("width", 4),
        t: q.numOr("t", 0.5),
        Fy: q.numOr("Fy", 36),
        Fu: q.numOr("Fu", 58),
        attachment: plateAttach,
      });
    } catch (e) {
      return { error: e };
    }
  }, [tab, method, plateAttach, q]);

  const active = tab === "fitting" ? fittingRun : plateRun;
  const pass = active && !("error" in active) ? active.pass : false;
  const ratio = active && !("error" in active) ? active.ratio : 0;

  const findLightest = () => {
    const input = {
      method,
      P: q.numOr("P", 80),
      material: { Fy: material.Fy, Fu: material.Fu },
      bolt: { d: boltD, group: boltGroup, threads },
      rows: Math.max(1, Math.round(q.numOr("rows", 3))),
      gage: q.numOr("gage", 3.5),
      length: q.numOr("length", 9),
    };
    const hit = lightestTeeFitting(input, ["WT", "MT", "ST"]);
    if (hit) {
      q.set({ fitting: slugOf(hit.shape.label) });
      setPickMessage(`${hit.shape.label} is the lightest passing WT in the database for these bolts and geometry.`);
    } else setPickMessage("No passing WT found with the current bolts, gage and length. Increase length, reduce demand, or revise bolts.");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Connections · Manual Part 9"
        title="Hanger connections"
        description="Tee and angle tension fittings with prying action, and simple hanger plates in tension."
      />

      <Segmented value={tab} onChange={(v) => q.set({ tab: v })} options={[...TABS]} ariaLabel="Hanger connection type" />

      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Demand">
            {field("P", method === "LRFD" ? "Required tension Pu" : "Required tension Pa", 80, "force")}
          </Card>

          {tab === "fitting" ? (
            <>
              <Card title="Fitting shape">
                <div className="space-y-3">
                  <ShapePicker
                    types={["WT", "MT", "ST", "L"]}
                    value={fitting}
                    onChange={(s) => q.set({ fitting: slugOf(s.label) })}
                  />
                  <Select
                    label="Fitting material"
                    value={material.id}
                    onChange={(v) => q.set({ mat: v })}
                    options={materialsFor(fittingFam).map((m) => ({ value: m.id, label: m.name }))}
                  />
                  {fittingFam === "angle" && (
                    <>
                      <Select
                        label="Angles"
                        value={String(q.numOr("angles", 1))}
                        onChange={(v) => q.set({ angles: Number(v) })}
                        options={[
                          { value: "1", label: "Single angle" },
                          { value: "2", label: "Back-to-back pair" },
                        ]}
                      />
                      <Select
                        label="Bolted leg"
                        value={q.str("boltedLeg", "long")}
                        onChange={(v) => q.set({ boltedLeg: v })}
                        options={[
                          { value: "long", label: "Long leg to support" },
                          { value: "short", label: "Short leg to support" },
                        ]}
                      />
                    </>
                  )}
                  <Button onClick={findLightest}>Find lightest WT</Button>
                  {pickMessage && (
                    <p role="status" className="text-xs text-muted">
                      {pickMessage}
                    </p>
                  )}
                </div>
              </Card>
              <Card title="Bolt layout">
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput
                    label="Bolts per line"
                    value={Math.max(1, Math.round(q.numOr("rows", 3)))}
                    onChange={(v) => q.set({ rows: Math.max(1, Math.round(v ?? 1)) })}
                  />
                  {field("gage", fittingFam === "tee" ? "Gage across stem" : "Gage from heel", 3.5)}
                  {field("length", "Fitting length along bolts", 9)}
                </div>
              </Card>
            </>
          ) : (
            <>
              <Card title="Plate">
                <div className="grid grid-cols-2 gap-3">
                  {field("width", "Plate width", 4)}
                  {field("t", "Plate thickness", 0.5)}
                  {field("Fy", "Plate Fy", 36, "stress")}
                  {field("Fu", "Plate Fu", 58, "stress")}
                </div>
              </Card>
              <Card title="Attachment">
                <Select
                  label="Connection"
                  value={q.str("plateAttach", "bolted")}
                  onChange={(v) => q.set({ plateAttach: v })}
                  options={[
                    { value: "bolted", label: "Bolted" },
                    { value: "welded", label: "Longitudinal fillet welds" },
                  ]}
                />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {plateAttach.kind === "bolted" ? (
                    <>
                      <NumberInput
                        label="Rows along load"
                        value={Math.max(1, Math.round(q.numOr("plateRows", 2)))}
                        onChange={(v) => q.set({ plateRows: Math.max(1, Math.round(v ?? 1)) })}
                      />
                      <NumberInput
                        label="Columns across width"
                        value={Math.max(1, Math.round(q.numOr("plateCols", 2)))}
                        onChange={(v) => q.set({ plateCols: Math.max(1, Math.round(v ?? 1)) })}
                      />
                      {field("platePitch", "Pitch", 3)}
                      {field("plateGage", "Gage", 3)}
                      {field("plateEnd", "End distance", 1.5)}
                      <Select
                        label="Shear planes per bolt"
                        value={String(plateAttach.planes ?? 1)}
                        onChange={(v) => q.set({ planes: Number(v) })}
                        options={[
                          { value: "1", label: "Single shear" },
                          { value: "2", label: "Double shear" },
                        ]}
                      />
                    </>
                  ) : (
                    <>
                      {field("weld", "Fillet weld leg", 0.25)}
                      {field("weldLen", "Weld length (each line)", 8)}
                      {field("FEXX", "FEXX", 70, "stress")}
                    </>
                  )}
                </div>
              </Card>
            </>
          )}

          <Card title="Bolts">
            <div className="grid grid-cols-2 gap-3">
              <Select label="Diameter" value={String(boltD)} onChange={(v) => q.set({ boltD: Number(v) })} options={BOLT_D} />
              <Select
                label="Bolt group"
                value={boltGroup}
                onChange={(v) => q.set({ boltGroup: v })}
                options={[
                  { value: "A", label: "Group 120 · A325" },
                  { value: "B", label: "Group 150 · A490" },
                  { value: "C", label: "Group 200 · F3043" },
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
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          {active && "error" in active && <ErrorCard error={active.error} />}
          {active && !("error" in active) && (
            <>
              <ConnectionHero pass={pass} ratio={ratio}>
                {tab === "fitting" && fittingRun && !("error" in fittingRun) && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Stat label="Bolts in tension" value={String(fittingRun.n)} />
                    <Stat label="Tension per bolt" value={fmtQ(fittingRun.Tbolt, "force", units)} />
                    <Stat label="Prying δ" value={fmtQ(fittingRun.prying.delta, "ratio", units)} />
                  </div>
                )}
                {tab === "plate" && plateRun && !("error" in plateRun) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Stat label="Net area An" value={fmtQ(plateRun.An, "area", units)} />
                    <Stat label="Effective area Ae" value={fmtQ(plateRun.Ae, "area", units)} />
                  </div>
                )}
              </ConnectionHero>
              <CheckResults checks={active.checks} steps={active.steps} warnings={active.warnings} />
              <Card title="Scope">
                <p className="text-xs leading-relaxed text-muted">
                  {tab === "fitting"
                    ? "Prying assumes a flexible flange with two plastic hinges at the stem face. Verify the support flange is stiff enough for the intended mechanism."
                    : "Bearing and tearout are checked in the hanger plate only; verify the connected ply separately."}{" "}
                  <SpecRef>Manual Part 9</SpecRef> <SpecRef>§J3</SpecRef> <SpecRef>§J4</SpecRef>
                </p>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
