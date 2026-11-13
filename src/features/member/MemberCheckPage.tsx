import { useEffect, useMemo, useRef } from "react";
import { useSettings } from "@/app/settings";
import { CalcReport, StepRow } from "@/components/CalcReport";
import { ShapePicker } from "@/components/ShapePicker";
import {
  Badge,
  Button,
  Card,
  Field,
  NumberInput,
  PageHeader,
  QuantityInput,
  RatioBar,
  Segmented,
  Select,
  SpecRef,
  Sym,
} from "@/components/ui";
import { materialById, materialsFor, preferredMaterial } from "@/data/materials";
import { displayLabel, familyOf, findShape, num, slugOf } from "@/data/shapes";
import { useQueryState, type Patch } from "@/features/column/url-state";
import { CrossSection } from "@/features/drawings/CrossSection";
import { fmt, fmtQ, type Quantity } from "@/lib/units";
import { LineChart } from "@/components/charts/LineChart";
import { InteractionDiagram } from "./InteractionDiagram";
import { checkMember, supportsH1, type MemberInput } from "./member-check";
import "./member-print.css";

const textInput =
  "h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none focus:border-accent";
const today = () => new Date().toLocaleDateString("en-CA");

export function MemberCheckPage() {
  const q = useQueryState();
  const { units, method } = useSettings();
  const root = useRef<HTMLDivElement>(null);
  const defaultDate = useRef(today());
  const setInput = (patch: Patch) =>
    q.set({
      ...patch,
      ...(Object.keys(patch).some((key) => !["project", "member", "engineer", "date", "h2confirmed"].includes(key)) &&
      patch.h2confirmed === undefined
        ? { h2confirmed: false }
        : {}),
    });
  useEffect(() => {
    if (!q.params.has("date")) q.set({ date: defaultDate.current });
  }, [q.params, q.set]);
  const shape = findShape(q.str("shape", "W14X90")) ?? findShape("W14X90")!;
  const family = familyOf(shape),
    materials = materialsFor(family);
  const proposedMaterial = materialById(q.str("mat"));
  const material =
    proposedMaterial && materials.includes(proposedMaterial) ? proposedMaterial : preferredMaterial(shape.type, family);
  const axial = q.str("axial") === "tension" ? "tension" : "compression";
  const ends = q.bool("ends"),
    amplify = q.bool("amplify"),
    sampledCb = q.bool("sampleCb");
  const h2 = q.str("interaction", supportsH1(shape) ? "H1" : "H2") === "H2";
  const nPoints = Math.max(1, Math.min(12, Math.floor(q.numOr("points", 2))));
  const Lcx = q.numOr("Lcx", 168),
    Lcy = q.numOr("Lcy", 168),
    Lcz = q.numOr("Lcz", Math.max(Lcx, Lcy));
  const input: MemberInput = {
    shape,
    material,
    method,
    axial,
    P: q.numOr("P", 300),
    Mx: q.numOr("Mx", 1200),
    My: q.numOr("My", 120),
    Vx: q.numOr("Vx", 5),
    Vy: q.numOr("Vy", 30),
    Lb: q.numOr("Lb", 120),
    Cb: q.numOr("Cb", 1),
    compression: {
      Lcx,
      Lcy,
      Lcz,
      ...(family === "double-angle"
        ? {
            connectorSpacing: q.numOr("spacing", 24),
            connectorType:
              q.str("connector") === "welded-pretensioned" ? ("welded-pretensioned" as const) : ("snug" as const),
          }
        : {}),
    },
    ...(q.bool("torsion")
      ? {
          torsion: {
            Tu: q.numOr("Tu", 0),
            L: q.numOr("Lt", 168),
            load: q.str("tload") === "uniform" ? ("uniform" as const) : ("midspan" as const),
            ends: q.str("tends") === "fixed" ? ("fixed" as const) : ("pinned" as const),
            FcrNormal: q.numOr("tFcr", 0),
            FcrShear: q.numOr("tFcrShear", 0),
          },
        }
      : {}),
    ...(ends
      ? {
          endMoments: {
            x1: q.numOr("x1", -600),
            x2: q.numOr("x2", 1200),
            y1: q.numOr("y1", -60),
            y2: q.numOr("y2", 120),
          },
        }
      : {}),
    ...(sampledCb
      ? {
          cbMoments: {
            max: q.numOr("Mmax", 1200),
            a: q.numOr("MA", 600),
            b: q.numOr("MB", 1200),
            c: q.numOr("MC", 600),
          },
        }
      : {}),
    ...(amplify && axial === "compression"
      ? {
          amplification: {
            cmX: q.numOr("cmX", 1),
            cmY: q.numOr("cmY", 1),
            stiffness: q.numOr("stiffness", 0.8),
            L1x: q.numOr("L1x", Lcx),
            L1y: q.numOr("L1y", Lcy),
          },
        }
      : {}),
    ...(axial === "tension" ? { tension: { An: q.numOr("An", num(shape, "A") ?? 1), U: q.numOr("U", 1) } } : {}),
    ...(h2
      ? {
          h2: {
            confirmed: q.bool("h2confirmed") && q.str("h2basis") === method,
            points: Array.from({ length: nPoints }, (_, i) => ({
              label: q.str(`h2_${i}_label`, `Critical point ${i + 1}`),
              fra: q.numOr(`h2_${i}_fra`, 0),
              Fca: q.numOr(`h2_${i}_Fca`, 0),
              frbw: q.numOr(`h2_${i}_frbw`, 0),
              Fcbw: q.numOr(`h2_${i}_Fcbw`, 0),
              frbz: q.numOr(`h2_${i}_frbz`, 0),
              Fcbz: q.numOr(`h2_${i}_Fcbz`, 0),
            })),
          },
        }
      : {}),
  };
  const inputKey = JSON.stringify(input);
  const report = useMemo(() => checkMember(input), [inputKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const metadata = {
    project: q.str("project"),
    member: q.str("member"),
    engineer: q.str("engineer"),
    date: q.str("date", defaultDate.current),
  };
  const field = (key: string, label: string, value: number | undefined, quantity: Quantity = "span") => (
    <QuantityInput
      key={key}
      label={<Sym s={label} />}
      quantity={quantity}
      value={value}
      onChange={(v) => setInput({ [key]: v ?? 0 })}
    />
  );
  const checkbox = (key: string, label: string, checked: boolean) => (
    <label className="flex items-start gap-2 text-xs text-muted">
      <input
        className="mt-0.5"
        type="checkbox"
        checked={checked}
        onChange={(e) =>
          setInput({
            [key]: e.target.checked,
            ...(key === "h2confirmed" && e.target.checked ? { h2basis: method } : {}),
          })
        }
      />
      {label}
    </label>
  );
  // Browsers omit closed <details> from a print job. Open them temporarily, including for Ctrl/Cmd+P.
  useEffect(() => {
    let closed: HTMLDetailsElement[] = [];
    const before = () => {
      closed = [...(root.current?.querySelectorAll<HTMLDetailsElement>("details:not([open])") ?? [])];
      closed.forEach((el) => {
        el.open = true;
      });
    };
    const after = () => {
      closed.forEach((el) => {
        el.open = false;
      });
      closed = [];
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  const p = report.checks.find((c) => c.id === "axial"),
    mx = report.checks.find((c) => c.id === "mx"),
    my = report.checks.find((c) => c.id === "my");
  const printMoment = (v: number) => (Number.isFinite(v) ? fmtQ(v, "moment", units) : "Unbounded");
  return (
    <div className="member-package space-y-4" ref={root}>
      <div className="no-print">
        <PageHeader
          eyebrow="Manual Parts 5–6 · ANSI/AISC 360-22"
          title="Member check"
          description="Axial force, biaxial flexure, shear and interaction on one consistent design basis."
          actions={<Button onClick={() => window.print()}>Print / Save PDF</Button>}
        />
      </div>
      <div className="member-layout grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4 no-print">
          <Card title="Calculation title block">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(metadata).map(([key, value]) => (
                <Field label={key.charAt(0).toUpperCase() + key.slice(1)} key={key}>
                  <input
                    aria-label={key}
                    className={textInput}
                    value={value}
                    type={key === "date" ? "date" : "text"}
                    onChange={(e) => setInput({ [key]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
          </Card>
          <Card title="Section & material">
            <div className="space-y-3">
              <ShapePicker
                value={shape}
                onChange={(s) =>
                  setInput({ shape: slugOf(s.label), mat: null, An: null, interaction: null, h2confirmed: false })
                }
              />
              <Select
                label="Material"
                value={material.id}
                onChange={(mat) => setInput({ mat })}
                options={materials.map((m) => ({ value: m.id, label: m.name }))}
              />
              <p className="text-xs text-muted">
                Fy = {fmtQ(material.Fy, "stress", units)} · Fu = {fmtQ(material.Fu, "stress", units)}{" "}
                <SpecRef>Manual Tables 2-4, 2-5</SpecRef>
              </p>
              <CrossSection shape={shape} maxHeight={200} />
            </div>
          </Card>
          <Card title="Required strengths" subtitle={<SpecRef>§B3 · Ch. C</SpecRef>}>
            <div className="space-y-3">
              <Segmented
                ariaLabel="Axial force sense"
                value={axial}
                onChange={(value) => setInput({ axial: value })}
                options={[
                  { value: "compression", label: "Compression" },
                  { value: "tension", label: "Tension" },
                ]}
              />
              {field("P", method === "LRFD" ? "P{u} (magnitude)" : "P{a} (magnitude)", input.P, "force")}
              {checkbox("ends", "Use end moments to obtain required moments and Cm", ends)}
              {ends && input.endMoments ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(input.endMoments).map(([key, value]) => field(key, `M{${key}}`, value, "moment"))}
                  </div>
                  <p className="text-xs text-muted">
                    Use signed end actions: M1/M2 positive for reverse curvature, negative for single curvature. No
                    transverse load between ends; otherwise enter the maximum moment directly and use Cm = 1 or
                    analysis. <SpecRef>Eq. A-8-4</SpecRef>
                  </p>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {field("Mx", "M{x} (major)", input.Mx, "moment")}
                  {field("My", "M{y} (minor)", input.My, "moment")}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {field("Vx", "V{x} (minor-axis shear)", input.Vx, "force")}
                {field("Vy", "V{y} (major-axis shear)", input.Vy, "force")}
              </div>
              <p className="text-xs text-muted">
                Direct {method} demands on the same load combination. Vx is minor-axis shear; Vy is major-axis web
                shear. Moments must include the applicable Chapter C second-order effects.
              </p>
            </div>
          </Card>
          <Card title="Torsion" subtitle={<SpecRef>§H3 · AISC Design Guide 9</SpecRef>}>
            <div className="space-y-3">
              {checkbox("torsion", "Include torsional demand", q.bool("torsion"))}
              {input.torsion && (
                <>
                  {field("Tu", method === "LRFD" ? "T{u}" : "T{a}", input.torsion.Tu, "moment")}
                  {field("Lt", "Torsion member length", input.torsion.L)}
                  {!["hss-rect", "hss-round", "pipe"].includes(family) && (
                    <>
                      <Select
                        label="Applied torque pattern"
                        value={input.torsion.load}
                        onChange={(tload) => setInput({ tload })}
                        options={[
                          { value: "midspan", label: "Concentrated at midspan" },
                          { value: "uniform", label: "Uniformly distributed (Tu = total torque)" },
                        ]}
                      />
                      <Select
                        label="Both torsional ends"
                        value={input.torsion.ends}
                        onChange={(tends) => setInput({ tends })}
                        options={[
                          { value: "pinned", label: "Twist restrained · warping free" },
                          { value: "fixed", label: "Twist and warping restrained" },
                        ]}
                      />
                      {field("tFcr", "Normal buckling stress from analysis", input.torsion.FcrNormal, "stress")}
                      {field("tFcrShear", "Shear buckling stress from analysis", input.torsion.FcrShear, "stress")}
                      <p className="text-xs text-muted">
                        Prismatic I-shapes/channels; elastic DG9 response. H3-9 buckling stresses require analysis.
                        Applied and warping stress maxima are added conservatively.
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          </Card>
          <Card title="Bracing & moment gradient">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {field("Lb", "L{b}", input.Lb)}
                {field("Lcx", "L{cx} = K{x}L{x}", Lcx)}
                {field("Lcy", "L{cy} = K{y}L{y}", Lcy)}
                {field("Lcz", "L{cz} (torsional)", Lcz)}
              </div>
              <p className="text-xs text-muted">
                Effective lengths are entered directly. For angles Lcx/Lcy refer to principal w/z axes.{" "}
                <SpecRef>§E2–E4</SpecRef>
              </p>
              {checkbox("sampleCb", "Calculate Cb from quarter-point moments", sampledCb)}
              {sampledCb && input.cbMoments ? (
                <div className="grid grid-cols-2 gap-2">
                  {field("Mmax", "M{max}", input.cbMoments.max, "moment")}
                  {field("MA", "M{A} (¼ point)", input.cbMoments.a, "moment")}
                  {field("MB", "M{B} (½ point)", input.cbMoments.b, "moment")}
                  {field("MC", "M{C} (¾ point)", input.cbMoments.c, "moment")}
                </div>
              ) : (
                <NumberInput label={<Sym s="C{b}" />} value={input.Cb} onChange={(Cb) => setInput({ Cb: Cb ?? 0 })} />
              )}
              <p className="text-xs text-muted">
                Quarter-point samples are for the same unbraced major-axis segment; Mmax must bound all samples and the
                required moment. <SpecRef>Eq. F1-1</SpecRef>
              </p>
              {family === "double-angle" && (
                <>
                  {field("spacing", "Intermediate connector spacing", input.compression.connectorSpacing)}
                  <Select
                    label="Connector type · §E6"
                    value={q.str("connector", "snug")}
                    onChange={(connector) => setInput({ connector })}
                    options={[
                      { value: "snug", label: "Snug-tight" },
                      { value: "welded-pretensioned", label: "Welded / pretensioned" },
                    ]}
                  />
                </>
              )}
            </div>
          </Card>
          {axial === "tension" && (
            <Card title="Tension connection inputs" subtitle={<SpecRef>§§B4.3, D2–D3</SpecRef>}>
              <div className="space-y-3">
                {field("An", "A{n}", input.tension?.An, "area")}
                <NumberInput
                  label="Shear lag factor U"
                  value={input.tension?.U}
                  onChange={(U) => setInput({ U: U ?? 0 })}
                />
                <p className="text-xs text-muted">
                  Defaults assume no holes and U = 1. Enter the controlling net area and shear lag for the connection.
                  Block shear, connection strength, pin-connected members and eyebars require separate checks.
                </p>
              </div>
            </Card>
          )}
          {axial === "compression" && (
            <Card title="Appendix 8 · member amplification" subtitle={<SpecRef>Eqs. A-8-3 to A-8-5</SpecRef>}>
              <div className="space-y-3">
                {checkbox("amplify", "Apply B1 to first-order nonsway moments", amplify)}
                {amplify && input.amplification && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {!ends && (
                        <>
                          <NumberInput
                            label="Cm,x"
                            value={input.amplification.cmX}
                            onChange={(cmX) => setInput({ cmX: cmX ?? 0 })}
                          />
                          <NumberInput
                            label="Cm,y"
                            value={input.amplification.cmY}
                            onChange={(cmY) => setInput({ cmY: cmY ?? 0 })}
                          />
                        </>
                      )}
                      {field("L1x", "L{c1x} (sway inhibited)", input.amplification.L1x)}
                      {field("L1y", "L{c1y} (sway inhibited)", input.amplification.L1y)}
                    </div>
                    <NumberInput
                      label="Analysis stiffness EI* / EI"
                      value={input.amplification.stiffness}
                      onChange={(stiffness) => setInput({ stiffness: stiffness ?? 0 })}
                    />
                    <p className="text-xs text-muted">
                      α = {method === "LRFD" ? "1.0" : "1.6"}. Pe1 uses the entered analysis stiffness and
                      sway-inhibited lengths. Include applicable τb and Chapter C reductions. B2 frame amplification and
                      sway moments require separate analysis; use direct moments for those cases.{" "}
                      <SpecRef>Appendix 8 · §C2.3</SpecRef>
                    </p>
                  </>
                )}
              </div>
            </Card>
          )}
          <Card title="Interaction method">
            <div className="space-y-3">
              <Select
                label="Chapter H equation"
                value={h2 ? "H2" : "H1"}
                onChange={(interaction) => setInput({ interaction, h2confirmed: false })}
                options={[
                  { value: "H1", label: "H1 · symmetric section force interaction" },
                  { value: "H2", label: "H2 · principal-axis point stresses" },
                ]}
              />
              <p className="text-xs text-muted">
                H1 is used for I-shapes, rectangular / round HSS and pipe. Angles, tees, channels and double angles use
                the general H2 stress check here. <SpecRef>§§H1–H2</SpecRef>
              </p>
              {h2 && (
                <>
                  <p className="text-xs text-muted">
                    Enter signed required stresses at each critical section point and the available stresses for the
                    local tension / compression sense. Include second-order effects. Units follow the global setting.
                  </p>
                  {input.h2?.points.map((point, i) => (
                    <div key={i} className="space-y-2 rounded-lg border border-line p-2">
                      <Field label={`Point ${i + 1}`}>
                        <input
                          aria-label={`Point ${i + 1} label`}
                          className={textInput}
                          value={point.label}
                          onChange={(e) => setInput({ [`h2_${i}_label`]: e.target.value, h2confirmed: false })}
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        {(["fra", "Fca", "frbw", "Fcbw", "frbz", "Fcbz"] as const).map((key) => (
                          <QuantityInput
                            key={key}
                            label={<Sym s={key.replace(/^(f|F)(.+)$/, "$1{$2}")} />}
                            quantity="stress"
                            value={point[key]}
                            onChange={(v) => setInput({ [`h2_${i}_${key}`]: v ?? 0, h2confirmed: false })}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button
                      disabled={nPoints >= 12}
                      onClick={() => setInput({ points: nPoints + 1, h2confirmed: false })}
                    >
                      Add point
                    </Button>
                    <Button
                      disabled={nPoints <= 1}
                      onClick={() => setInput({ points: nPoints - 1, h2confirmed: false })}
                    >
                      Remove last
                    </Button>
                  </div>
                  {checkbox(
                    "h2confirmed",
                    "I have evaluated every critical point with principal-axis stresses, correct local stress capacities on the selected design basis, and second-order effects.",
                    q.bool("h2confirmed") && q.str("h2basis") === method,
                  )}
                </>
              )}
            </div>
          </Card>
        </aside>
        <div className="min-w-0 space-y-4">
          <header className="print-title rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">Steel member calculation</h2>
              <span className="text-xs text-muted">
                Find a Beam · {method} · {units}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-4">
              {Object.entries(metadata).map(([key, value]) => (
                <div key={key}>
                  <dt className="capitalize text-muted">{key}</dt>
                  <dd className="mt-0.5 min-h-4 font-medium">{value || "—"}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
              {displayLabel(shape.label)} · {material.name} · Fy {fmtQ(material.Fy, "stress", units)} · Fu{" "}
              {fmtQ(material.Fu, "stress", units)} · AISC Shapes Database v16.0
              <br />
              ANSI/AISC 360-22 · Steel Construction Manual, 16th Edition <SpecRef>Manual Tables 2-4, 2-5</SpecRef>
            </p>
          </header>
          <section
            className={`print-summary rounded-xl border p-5 ${report.status === "PASS" ? "border-pass/40 bg-pass-soft" : report.status === "FAIL" ? "border-fail/40 bg-fail-soft" : "border-warn/40 bg-warn-soft"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted">Overall member check</div>
                <div
                  className={`mt-1 text-3xl font-semibold ${report.status === "PASS" ? "text-pass" : report.status === "FAIL" ? "text-fail" : "text-warn"}`}
                >
                  {report.status}
                </div>
              </div>
              <div className="text-right">
                <div className="num text-3xl font-semibold">
                  {report.ratio === Infinity ? "∞" : fmt(report.ratio, 4)}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {report.governing ? <Sym s={report.governing} /> : "Complete the required checks"}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">
              Member strength only. Chapter C frame stability, connection design and detailing are separate.{" "}
              {axial === "tension"
                ? "No tensile LTB enhancement under H1.2 is credited."
                : "Use required strengths including applicable second-order effects."}{" "}
              <SpecRef>§B3 · Ch. C · Ch. H</SpecRef>
            </p>
          </section>
          {report.errors.length > 0 && (
            <Card title="Checks requiring attention">
              <ul className="space-y-2 text-sm text-warn">
                {report.errors.map((e, i) => (
                  <li key={i}>
                    <strong>{e.check}:</strong> {e.message}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                Unavailable or invalid checks are skipped. An incomplete calculation cannot receive an overall PASS.
              </p>
            </Card>
          )}
          <Card title="Demand / available strength" subtitle={<SpecRef>Chapters D–H</SpecRef>}>
            <div className="space-y-4">
              {report.checks.map((c) => (
                <div className="space-y-1" key={c.id}>
                  <div className="flex flex-wrap justify-between gap-2 text-xs">
                    <span className="font-medium">
                      <Sym s={c.label} />
                    </span>
                    <span className="num text-muted">
                      {fmtQ(c.demand, c.result.quantity, units)} / {fmtQ(c.capacity, c.result.quantity, units)}{" "}
                      <SpecRef>{c.result.limitStates.find((ls) => ls.id === c.result.governing)?.ref ?? c.ref}</SpecRef>
                    </span>
                  </div>
                  <RatioBar ratio={c.ratio} />
                </div>
              ))}
              {report.torsion && (
                <div className="space-y-1">
                  <div className="text-xs font-medium">DG9 + H3.3 combined stress</div>
                  <RatioBar ratio={report.torsion.ratio} />
                </div>
              )}
              {report.interaction && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {report.interaction.equation === "H3-6"
                        ? "Axial + flexure + shear + torsion"
                        : "Axial + flexure interaction"}
                    </span>
                    <SpecRef>Eq. {report.interaction.equation}</SpecRef>
                  </div>
                  <RatioBar ratio={report.interaction.ratio} />
                </div>
              )}
            </div>
          </Card>
          {!h2 && p && mx && my && report.interaction && report.interaction.equation !== "H3-6" && (
            <Card title="H1 interaction diagram" subtitle="Design point includes both bending axes">
              <InteractionDiagram
                axial={input.P / p.capacity}
                moment={Math.abs(report.moments.x) / mx.capacity + Math.abs(report.moments.y) / my.capacity}
              />
            </Card>
          )}
          {report.torsion && (
            <Card title="Open-section torsion · DG9" subtitle={<SpecRef>§H3.3</SpecRef>}>
              <LineChart
                xLabel="x / L"
                yLabel="Twist (rad)"
                series={[
                  {
                    id: "twist",
                    label: "θ",
                    points: report.torsion.stations.map((s) => ({ x: s.x / input.torsion!.L, y: s.theta })),
                  },
                ]}
              />
              <div className="divide-y divide-line">
                {report.torsion.steps.map((step, i) => (
                  <StepRow key={i} step={step} />
                ))}
              </div>
            </Card>
          )}
          <Card title="Calculation basis & input schedule" subtitle={<SpecRef>§B3 · Ch. C</SpecRef>}>
            <div className="print-input-grid grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              {[
                ["Axial force", `${fmtQ(input.P, "force", units)} · ${axial}`],
                ["Required Mx", printMoment(report.moments.x)],
                ["Required My", printMoment(report.moments.y)],
                ["Vx / Vy", `${fmtQ(input.Vx, "force", units)} / ${fmtQ(input.Vy, "force", units)}`],
                ["Lb", fmtQ(input.Lb, "span", units)],
                ...(input.torsion
                  ? [
                      [
                        "Torsion",
                        `${fmtQ(input.torsion.Tu, "moment", units)} · ${input.torsion.load} · ${input.torsion.ends}`,
                      ],
                      ["Torsion length", fmtQ(input.torsion.L, "span", units)],
                    ]
                  : []),
                ["Lcx / Lcy / Lcz", [Lcx, Lcy, Lcz].map((v) => fmtQ(v, "span", units)).join(" / ")],
                ["Cb", fmt(report.Cb)],
                [
                  "B1,x / B1,y",
                  `${Number.isFinite(report.B1x) ? fmt(report.B1x) : "∞"} / ${Number.isFinite(report.B1y) ? fmt(report.B1y) : "∞"}`,
                ],
                [
                  "Design method",
                  `${method} · ${amplify && axial === "compression" ? "Appendix 8 nonsway moments" : "Direct required moments"}`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-muted">{label}</div>
                  <div className="num mt-1 font-medium">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 divide-y divide-line">
              {report.inputSteps.map((step, i) => (
                <StepRow step={step} key={i} />
              ))}
            </div>
          </Card>
          {report.amplification.length > 0 && (
            <details className="calc-detail rounded-xl border border-line bg-surface" open>
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                Appendix 8 · B1 moment amplification <SpecRef>Appendix 8</SpecRef>
              </summary>
              <div className="report-body divide-y divide-line px-4 pb-4">
                {report.amplification.map((step, i) => (
                  <StepRow step={step} key={i} />
                ))}
              </div>
            </details>
          )}
          {report.checks.map((c) => (
            <details key={c.id} className="calc-detail rounded-xl border border-line bg-surface">
              <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-semibold">
                <span>
                  <Sym s={c.label} /> · full calculation
                </span>
                <Badge tone={c.ratio <= 1 ? "pass" : "fail"}>D/C {fmt(c.ratio)}</Badge>
              </summary>
              <div className="report-body px-4 pb-4">
                <CalcReport result={c.result} demand={c.demand} />
              </div>
            </details>
          ))}
          {report.interaction && (
            <details className="calc-detail rounded-xl border border-line bg-surface" open>
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                Interaction · full calculation <SpecRef>Eq. {report.interaction.equation}</SpecRef>
              </summary>
              <div className="report-body divide-y divide-line px-4 pb-4">
                {input.h2?.points.map((pt, i) => (
                  <div key={i} className="py-2 text-xs">
                    <strong>{pt.label}</strong>
                    <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
                      {(["fra", "Fca", "frbw", "Fcbw", "frbz", "Fcbz"] as const).map((key) => (
                        <span key={key}>
                          <Sym s={key.replace(/^(f|F)(.+)$/, "$1{$2}")} /> = {fmtQ(pt[key], "stress", units)}
                        </span>
                      ))}
                    </div>
                    <SpecRef>§H2</SpecRef>
                  </div>
                ))}
                {report.interaction.steps.map((step, i) => (
                  <StepRow step={step} key={i} />
                ))}
              </div>
            </details>
          )}
          <p className="text-[11px] text-muted">
            Required strengths and available strengths use the selected {method} basis. Reported ratios retain full
            calculation precision; displayed values are rounded. <SpecRef>ANSI/AISC 360-22 §B3</SpecRef>
          </p>
        </div>
      </div>
    </div>
  );
}
