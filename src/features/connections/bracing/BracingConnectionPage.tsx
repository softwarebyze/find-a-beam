import { useMemo } from "react";
import {
  braceConnectionChecks,
  braceGeometry,
  braceKindOf,
  type BraceAttachment,
} from "@/aisc/connections/bracing/brace";
import { uniformForceMethod, UFM_CASES, type UfmCase } from "@/aisc/connections/bracing/ufm";
import type { BoltGroup, ThreadCondition } from "@/aisc/connections/types";
import { useSettings } from "@/app/settings";
import { ShapePicker } from "@/components/ShapePicker";
import { Badge, Card, NumberInput, PageHeader, QuantityInput, RatioBar, Segmented, Select, SpecRef, Stat } from "@/components/ui";
import { materialById, materialsFor, preferredMaterial } from "@/data/materials";
import { familyOf, findShape, slugOf, type Shape } from "@/data/shapes";
import { fmtQ } from "@/lib/units";
import {
  CheckResults,
  ConnectionHero,
  ErrorCard,
  useConnectionFields,
} from "../concentrated/ConnectionWorkbench";

const MODES = [
  { value: "ufm", label: "Uniform force method" },
  { value: "brace", label: "Brace-to-gusset" },
] as const;

type Mode = (typeof MODES)[number]["value"];

const BOLT_D = [0.625, 0.75, 0.875, 1].map((d) => ({ value: String(d), label: `${d}"` }));

function pickBrace(raw: string): Shape {
  return findShape(raw) ?? findShape("HSS6X6X1/2") ?? findShape("2L4X4X3/8X3/8")!;
}

export function BracingConnectionPage() {
  const { q, field } = useConnectionFields();
  const { method, units } = useSettings();

  const mode = (MODES.some((m) => m.value === q.str("mode", "ufm")) ? q.str("mode", "ufm") : "ufm") as Mode;

  const ufmCase = q.str("ufmCase", "general") as UfmCase;

  const ufm = useMemo(() => {
    if (mode !== "ufm") return undefined;
    try {
      return {
        result: uniformForceMethod({
          P: q.numOr("P", 120),
          theta: q.numOr("theta", 45),
          eb: q.numOr("eb", 6),
          ec: q.numOr("ec", 7),
          alphaBar: q.numOr("alphaBar", 10),
          betaBar: q.numOr("betaBar", 9),
          case: ufmCase,
          keep: q.str("ufmKeep", "beta") === "alpha" ? "alpha" : "beta",
          R: q.numOr("R", 0) || undefined,
          A: q.numOr("A", 0) || undefined,
          dVb: ufmCase === "sc2" && q.params.get("dVb") !== null ? q.numOr("dVb", 0) : undefined,
        }),
      };
    } catch (e) {
      return { error: e };
    }
  }, [mode, ufmCase, q.numOr, q.str, q.params]);

  const braceShape = pickBrace(q.str("shape", "HSS6X6X1/2"));
  const kind = braceKindOf(braceShape);
  const braceMat =
    materialById(q.str("braceMat", preferredMaterial(braceShape.type, familyOf(braceShape)).id)) ??
    preferredMaterial(braceShape.type, familyOf(braceShape));

  const attachKind =
    kind?.startsWith("hss") ? "welded" : kind === "W" ? "bolted" : q.str("attach", "bolted") === "welded" ? "welded" : "bolted";

  const boltD = q.numOr("boltD", 0.75);
  const boltGroup = q.str("boltGroup", "A") as BoltGroup;
  const threads = q.str("threads", "N") as ThreadCondition;

  const attachment: BraceAttachment =
    attachKind === "bolted"
      ? {
          kind: "bolted",
          bolt: { d: boltD, group: boltGroup, threads },
          rows: Math.max(2, Math.round(q.numOr("rows", 4))),
          lines: Math.max(kind === "WT" ? 2 : kind === "W" ? 2 : 1, Math.round(q.numOr("lines", kind === "WT" ? 2 : 2))),
          pitch: q.numOr("pitch", 3),
          lineGage: q.numOr("lineGage", 3),
          heelGage: q.params.get("heelGage") !== null ? q.numOr("heelGage", 3) : undefined,
          braceEnd: q.numOr("braceEnd", 1.5),
        }
      : {
          kind: "welded",
          w: q.numOr("weld", 0.25),
          length: q.numOr("weldLen", 12),
          FEXX: q.numOr("FEXX", 70),
          slotClearance: q.params.get("slotClr") !== null ? q.numOr("slotClr", 0.125) : undefined,
        };

  const braceRun = useMemo(() => {
    if (mode !== "brace") return undefined;
    try {
      const geo = braceGeometry(braceShape, attachment);
      const out = braceConnectionChecks(
        {
          method,
          brace: braceShape,
          braceMat,
          gussetT: q.numOr("gussetT", 0.5),
          gussetFy: q.numOr("gussetFy", 50),
          gussetFu: q.numOr("gussetFu", 65),
          attachment,
          Pt: q.numOr("Pt", 120),
          Pc: q.numOr("Pc", 0),
          gussetEdge: q.params.get("gussetEdge") !== null ? q.numOr("gussetEdge", 6) : undefined,
        },
        geo,
      );
      const ratio = Math.max(0, ...out.checks.map((c) => c.ratio));
      return { ...out, ratio, pass: ratio <= 1 + 1e-9, geo };
    } catch (e) {
      return { error: e };
    }
  }, [mode, method, braceShape, braceMat, attachment, q]);

  const ufmCaseMeta = UFM_CASES.find((c) => c.value === ufmCase);
  const ufmResult = ufm && "result" in ufm ? ufm.result : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Connections · Manual Part 13"
        title="Bracing connections"
        description="Uniform force method interface forces at a concentric brace gusset, and brace-to-gusset limit states for HSS, double angle, WT and W braces."
        actions={
          mode === "brace" && braceRun && !("error" in braceRun) ? (
            <Badge tone={braceRun.pass ? "pass" : "fail"}>{braceRun.pass ? "PASS" : "FAIL"}</Badge>
          ) : undefined
        }
      />

      <Segmented value={mode} onChange={(v) => q.set({ mode: v })} options={[...MODES]} ariaLabel="Bracing calculator mode" />

      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          {mode === "ufm" ? (
            <>
              <Card title="Brace force & geometry">
                <div className="grid grid-cols-2 gap-3">
                  {field("P", method === "LRFD" ? "Brace tension Pu" : "Brace tension Pa", 120, "force")}
                  <QuantityInput
                    label="Brace angle θ from vertical"
                    quantity="ratio"
                    value={q.numOr("theta", 45)}
                    onChange={(v) => q.set({ theta: v ?? 0 })}
                  />
                  {field("eb", "Half beam depth eb", 6)}
                  {field("ec", "Column eccentricity ec", 7)}
                  {field("alphaBar", "Gusset-to-beam centroid ᾱ", 10)}
                  {field("betaBar", "Gusset-to-column centroid β̄", 9)}
                </div>
              </Card>
              <Card title="UFM case">
                <div className="space-y-3">
                  <Select
                    label="Connection layout"
                    value={ufmCase}
                    onChange={(v) => q.set({ ufmCase: v })}
                    options={UFM_CASES.map((c) => ({ value: c.value, label: c.label }))}
                  />
                  {(ufmCase === "general" || ufmCase === "sc2") && (
                    <Select
                      label="Hold actual centroid"
                      value={q.str("ufmKeep", "beta")}
                      onChange={(v) => q.set({ ufmKeep: v })}
                      options={[
                        { value: "beta", label: "β = β̄ (solve for α)" },
                        { value: "alpha", label: "α = ᾱ (solve for β)" },
                      ]}
                    />
                  )}
                  {field("R", "Required beam reaction R (envelope)", 0, "force")}
                  {field("A", "Required transfer force A (envelope)", 0, "force")}
                  {ufmCase === "sc2" && field("dVb", "ΔVb moved to column interface", 0, "force")}
                </div>
              </Card>
            </>
          ) : (
            <>
              <Card title="Brace member & demand">
                <div className="space-y-3">
                  <ShapePicker
                    types={["W", "HSS", "PIPE", "2L", "WT"]}
                    value={braceShape}
                    onChange={(s) => q.set({ shape: slugOf(s.label) })}
                  />
                  <Select
                    label="Brace material"
                    value={braceMat.id}
                    onChange={(v) => q.set({ braceMat: v })}
                    options={materialsFor(familyOf(braceShape)).map((m) => ({ value: m.id, label: m.name }))}
                  />
                  {field("Pt", method === "LRFD" ? "Required tension Pt" : "Required tension Pt", 120, "force")}
                  {field("Pc", "Required compression Pc", 0, "force")}
                </div>
              </Card>
              <Card title="Gusset plate">
                <div className="grid grid-cols-2 gap-3">
                  {field("gussetT", "Gusset thickness", 0.5)}
                  {field("gussetFy", "Gusset Fy", 50, "stress")}
                  {field("gussetFu", "Gusset Fu", 65, "stress")}
                  {attachKind === "bolted" && field("gussetEdge", "Distance to gusset free edge", 6)}
                </div>
              </Card>
              <Card title="Brace attachment">
                {kind && !kind.startsWith("hss") && kind !== "W" && (
                  <Select
                    label="Attachment"
                    value={attachKind}
                    onChange={(v) => q.set({ attach: v })}
                    options={[
                      { value: "bolted", label: "Bolted" },
                      { value: "welded", label: "Welded fillets" },
                    ]}
                  />
                )}
                {kind?.startsWith("hss") && (
                  <p className="mb-3 text-xs text-muted">HSS braces are modeled as slotted with longitudinal fillet welds.</p>
                )}
                {kind === "W" && <p className="mb-3 text-xs text-muted">W-shape braces are web-bolted to the gusset in this module.</p>}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {attachKind === "bolted" ? (
                    <>
                      <NumberInput
                        label="Bolts per line"
                        value={Math.max(2, Math.round(q.numOr("rows", 4)))}
                        onChange={(v) => q.set({ rows: Math.max(2, Math.round(v ?? 2)) })}
                      />
                      <NumberInput
                        label="Bolt lines"
                        value={Math.max(kind === "WT" ? 2 : 1, Math.round(q.numOr("lines", 2)))}
                        onChange={(v) => q.set({ lines: Math.max(1, Math.round(v ?? 1)) })}
                      />
                      {field("pitch", "Pitch along brace", 3)}
                      {field("lineGage", "Gage between lines", 3)}
                      {field("braceEnd", "End distance on brace", 1.5)}
                      {kind === "2L" && field("heelGage", "Heel gage (2L)", 3)}
                      <Select label="Bolt diameter" value={String(boltD)} onChange={(v) => q.set({ boltD: Number(v) })} options={BOLT_D} />
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
                    </>
                  ) : (
                    <>
                      {field("weld", "Fillet weld leg", 0.25)}
                      {field("weldLen", "Longitudinal weld length", 12)}
                      {field("FEXX", "FEXX", 70, "stress")}
                      {kind?.startsWith("hss") && field("slotClr", "Slot clearance beyond gusset", 0.125)}
                    </>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {mode === "ufm" && ufm && "error" in ufm && <ErrorCard error={ufm.error} />}
          {mode === "ufm" && ufmResult && (
            <>
              <Card title="Interface forces" subtitle={<SpecRef>{ufmCaseMeta?.ref ?? "Manual Part 13"}</SpecRef>}>
                <p className="mb-3 text-xs text-muted">
                  {method} · forces delivered from the gusset to the beam and column interfaces. Residual equilibrium: [
                  {ufmResult.residual.map((r) => fmtQ(r, "force", units)).join(", ")}].
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat label="Gusset-to-beam shear Hb" value={fmtQ(ufmResult.beam.shear, "force", units)} />
                  <Stat label="Gusset-to-beam normal Vb" value={fmtQ(ufmResult.beam.normal, "force", units)} />
                  <Stat label="Gusset-to-column shear Vc" value={fmtQ(ufmResult.column.shear, "force", units)} />
                  <Stat label="Gusset-to-column normal Hc" value={fmtQ(ufmResult.column.normal, "force", units)} />
                  <Stat label="Gusset-to-beam moment" value={fmtQ(ufmResult.beam.moment, "moment", units)} />
                  <Stat label="Gusset-to-column moment" value={fmtQ(ufmResult.column.moment, "moment", units)} />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Stat label="Beam-to-column shear (envelope)" value={fmtQ(ufmResult.beamToColumn.shear, "force", units)} />
                  <Stat label="Beam-to-column axial (envelope)" value={fmtQ(ufmResult.beamToColumn.axial, "force", units)} />
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-ink">UFM geometry</p>
                  <RatioBar ratio={ufmResult.alpha / Math.max(ufmResult.beta, 1e-9)} label="α / β ratio" />
                  <div className="flex justify-between text-[11px] text-muted">
                    <span>α = {fmtQ(ufmResult.alpha, "length", units)}</span>
                    <span>β = {fmtQ(ufmResult.beta, "length", units)} · r = {fmtQ(ufmResult.r, "length", units)}</span>
                  </div>
                </div>
              </Card>
              <Card title="Calculation basis">
                <div className="divide-y divide-line">
                  {ufmResult.steps.map((s, i) => (
                    <div key={i} className="flex justify-between gap-3 py-2 text-xs">
                      <span>
                        {s.symbol ? `${s.symbol} · ` : ""}
                        {s.label}
                      </span>
                      <span className="num text-muted">
                        {s.quantity === "ratio" && s.note === "degrees"
                          ? `${s.value}°`
                          : fmtQ(s.value, s.quantity ?? "force", units)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
              {ufmResult.warnings.length > 0 && (
                <Card title="Scope & detailing">
                  {ufmResult.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-warn">
                      {w}
                    </p>
                  ))}
                </Card>
              )}
              <Card title="Scope">
                <p className="text-xs leading-relaxed text-muted">
                  The uniform force method distributes brace force to the gusset interfaces assuming uniform stress along
                  each connection line. Member and connection capacity checks use the delivered interface forces.{" "}
                  <SpecRef>Manual Part 13</SpecRef> <SpecRef>§B3.4</SpecRef>
                </p>
              </Card>
            </>
          )}

          {mode === "brace" && braceRun && "error" in braceRun && <ErrorCard error={braceRun.error} />}
          {mode === "brace" && braceRun && !("error" in braceRun) && (
            <>
              <ConnectionHero pass={braceRun.pass} ratio={braceRun.ratio}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat label="Shear lag U" value={fmtQ(braceRun.U, "ratio", units)} />
                  <Stat label="Net area An" value={fmtQ(braceRun.An, "area", units)} />
                  <Stat label="Effective area Ae" value={fmtQ(braceRun.Ae, "area", units)} />
                </div>
              </ConnectionHero>
              <CheckResults checks={braceRun.checks} steps={braceRun.steps} warnings={braceRun.warnings} />
              <Card title="Scope">
                <p className="text-xs leading-relaxed text-muted">
                  Brace compression member strength (Chapter E), gusset block shear outside the connection band, and
                  seismic prequalification are not evaluated here. <SpecRef>Manual Part 13</SpecRef> <SpecRef>§D3</SpecRef>
                </p>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
