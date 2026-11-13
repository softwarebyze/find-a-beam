import clsx from "clsx";
import { useEffect, useId, useMemo, useState } from "react";
import {
  checkComposite,
  compositeMaterial,
  slabWeight,
  sweepComposite,
  table319,
  validateComposite,
  type CompositeDesign,
  type CompositeDesignInput,
} from "@/aisc/composite";
import { available } from "@/aisc/common";
import { useSettings } from "@/app/settings";
import { CalcReport, StepRow } from "@/components/CalcReport";
import { ShapePicker } from "@/components/ShapePicker";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  NumberInput,
  PageHeader,
  QuantityInput,
  RatioBar,
  Segmented,
  Select,
  SpecRef,
  Stat,
  Sym,
  table,
} from "@/components/ui";
import { materialsFor } from "@/data/materials";
import { displayLabel, findShape, req, SHAPES, slugOf, type Shape } from "@/data/shapes";
import { useBeamUrl } from "@/features/beam/url";
import { fmt, fmtQ, toDisplay, unitLabel, type Quantity } from "@/lib/units";
import { CompositeSection } from "./CompositeSection";
import { CONCRETE_PRESETS, DECK_PRESETS, readCompositeInput, SLAB_KINDS, STUD_DIAMETERS } from "./state";

const W_SHAPES = SHAPES.filter((s) => s.type === "W");
const nominalDepth = (s: Shape) => Number(/^W([\d.]+)/.exec(s.label)?.[1] ?? req(s, "d"));
const PCF_TO_KGM3 = 16.0185;

export function CompositeBeamPage() {
  const url = useBeamUrl(),
    { units, method } = useSettings();
  const mode = url.text("mode", "check") === "select" ? "select" : "check";
  const { input, deck, ct } = readCompositeInput(url, method);
  const linked = findShape(url.text("shape", ""));
  const linkedW = linked?.type === "W" ? linked : undefined;
  const checkShape = linkedW ?? findShape("W21X50")!;
  const maxDepth = url.number("maxd", 0),
    studEq = url.number("steq", 10),
    sort = url.text("sort", "weight") === "equiv" ? "equiv" : "weight",
    showFailing = url.text("failing", "0") === "1";
  const error = validateComposite(input) ?? (maxDepth < 0 ? "Maximum depth cannot be negative." : undefined);
  const key = JSON.stringify(input);
  const material = compositeMaterial(input.materialId);

  const single = useMemo(() => {
    if (error || mode !== "check") return undefined;
    try {
      return { design: checkComposite(checkShape, input) };
    } catch (e) {
      return { failure: e instanceof Error ? e.message : String(e) };
    }
  }, [key, checkShape, error, mode]);

  const pool = useMemo(() => W_SHAPES.filter((s) => !maxDepth || nominalDepth(s) <= maxDepth), [maxDepth]);
  const sweep = useMemo(
    () => (error || mode !== "select" ? undefined : sweepComposite(pool, input)),
    [key, pool, error, mode],
  );
  const equiv = (c: CompositeDesign) => (req(c.shape, "W") * input.L) / 12 + studEq * c.studs.total;
  const ranked = useMemo(() => {
    if (!sweep) return [];
    const list = [...sweep.candidates];
    if (sort === "equiv") list.sort((a, b) => equiv(a) - equiv(b));
    return list;
  }, [sweep, sort, studEq, input.L]);
  const passing = ranked.filter((c) => c.pass);
  const selected =
    mode === "check" ? single?.design : (ranked.find((c) => c.shape === linkedW) ?? passing[0] ?? ranked[0]);
  const visible = ranked.filter((c) => showFailing || c.pass);

  const slabPsf = slabWeight(input.slab, input.concrete);
  const isDeck = input.slab.kind !== "solid";

  return (
    <>
      <PageHeader
        eyebrow="Manual Part 3 · AISC 360-22 Chapter I"
        title="Composite beam design"
        description="Simply supported W-shape acting compositely with a concrete slab through steel headed stud anchors. Construction stage on the bare steel, composite strength by the plastic stress distribution, and service deflection with the lower-bound moment of inertia."
        actions={<Button onClick={() => window.print()}>Print calculation</Button>}
      />
      <div className="grid items-start gap-4 md:grid-cols-[290px_minmax(0,1fr)] print:block">
        <aside className="space-y-4 no-print">
          <Card title="Design mode">
            <div className="space-y-3">
              <Segmented
                ariaLabel="Design mode"
                value={mode}
                onChange={(v) => url.set("mode", v)}
                options={[
                  { value: "check", label: "Check section" },
                  { value: "select", label: "Select lightest" },
                ]}
              />
              {mode === "check" ? (
                <ShapePicker
                  label="W-shape"
                  types={["W"]}
                  value={checkShape}
                  onChange={(s) => url.set("shape", slugOf(s.label))}
                />
              ) : (
                <>
                  <QuantityInput
                    label="Maximum nominal depth (optional)"
                    quantity="length"
                    value={maxDepth || undefined}
                    onChange={(v) => url.set("maxd", v)}
                  />
                  <Select
                    label="Rank by"
                    value={sort}
                    onChange={(v) => url.set("sort", v)}
                    options={[
                      { value: "weight", label: "Beam weight, then fewest anchors" },
                      { value: "equiv", label: "Equivalent steel weight incl. anchors" },
                    ]}
                  />
                  {sort === "equiv" && (
                    <NumberInput
                      label="Steel weight equivalent per anchor (lb)"
                      value={studEq}
                      onChange={(v) => url.set("steq", v)}
                    />
                  )}
                </>
              )}
              <Select
                label="Steel"
                value={material.id}
                onChange={(v) => url.set("mat", v)}
                options={materialsFor("i-shape").map((m) => ({
                  value: m.id,
                  label: `${m.name} · Fy ${fmtQ(m.Fy, "stress", units)}`,
                }))}
              />
            </div>
          </Card>

          <Card title="Framing" subtitle={<SpecRef>§I3.1a</SpecRef>}>
            <div className="space-y-3">
              <QuantityInput label="Span L" quantity="span" value={input.L} onChange={(v) => url.set("L", v)} />
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Beam location"
                  value={input.position}
                  onChange={(v) => url.set("pos", v)}
                  options={[
                    { value: "interior", label: "Interior" },
                    { value: "edge", label: "Edge" },
                  ]}
                />
                <QuantityInput
                  label="Beam spacing"
                  quantity="span"
                  value={input.spacing}
                  onChange={(v) => url.set("s", v)}
                />
              </div>
              {input.position === "edge" && (
                <QuantityInput
                  label="Beam centerline to slab edge"
                  quantity="length"
                  value={input.edge}
                  onChange={(v) => url.set("edge", v)}
                />
              )}
            </div>
          </Card>

          <Card title="Slab" subtitle={<SpecRef>§I3.2c</SpecRef>}>
            <div className="space-y-3">
              <Select
                label="Slab system"
                value={input.slab.kind}
                onChange={(v) => url.update({ slab: v, br: undefined, sl: undefined, tc: undefined })}
                options={SLAB_KINDS}
              />
              {isDeck && (
                <Select
                  label="Deck profile"
                  value={deck}
                  onChange={(v) => url.update({ deck: v, sl: undefined })}
                  options={[
                    ...DECK_PRESETS.map((p) => ({ value: p.id, label: p.label })),
                    { value: "custom", label: "Custom profile" },
                  ]}
                />
              )}
              {isDeck && deck === "custom" && (
                <div className="grid grid-cols-3 gap-2">
                  <QuantityInput
                    label={<Sym s="h{r}" />}
                    quantity="length"
                    value={input.slab.hr}
                    onChange={(v) => url.set("hr", v)}
                  />
                  <QuantityInput
                    label={<Sym s="w{r}" />}
                    quantity="length"
                    value={input.slab.wr}
                    onChange={(v) => url.set("wr", v)}
                  />
                  <QuantityInput
                    label="Pitch"
                    quantity="length"
                    value={input.slab.pitch}
                    onChange={(v) => url.set("pitch", v)}
                  />
                </div>
              )}
              <QuantityInput
                label={isDeck ? "Concrete above deck tc" : "Slab thickness t"}
                quantity="length"
                value={input.slab.tc}
                onChange={(v) => url.set("tc", v)}
                hint={
                  isDeck
                    ? `Total depth ${fmtQ(input.slab.hr + input.slab.tc, "length", units)} · wr average rib width`
                    : undefined
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <QuantityInput
                  label="f′c"
                  quantity="stress"
                  value={input.concrete.fc}
                  onChange={(v) => url.set("fc", v)}
                />
                <Select
                  label="Concrete"
                  value={ct}
                  onChange={(v) => url.set("ct", v)}
                  options={[
                    ...CONCRETE_PRESETS.map((c) => ({ value: c.id, label: c.id === "nw" ? "Normal" : "Lightweight" })),
                    { value: "custom", label: "Custom" },
                  ]}
                />
              </div>
              {ct === "custom" && <DensityInput value={input.concrete.wc} onChange={(v) => url.set("wc", v)} />}
              <p className="text-xs text-faint">
                Slab weight {fmtQ(slabPsf, "areaLoad", units)} at w<sub>c</sub> ={" "}
                {units === "US" ? `${fmt(input.concrete.wc)} lb/ft³` : `${fmt(input.concrete.wc * PCF_TO_KGM3)} kg/m³`}
                {isDeck ? ", ribs filled at wr" : ""}.
              </p>
            </div>
          </Card>

          <Card title="Steel headed stud anchors" subtitle={<SpecRef>§I8.2a · Manual Table 3-21</SpecRef>}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Diameter dsa"
                  value={String(input.stud.d)}
                  onChange={(v) => url.set("sd", v)}
                  options={STUD_DIAMETERS.map((o) => ({ value: o.value, label: units === "US" ? o.us : o.si }))}
                />
                <QuantityInput
                  label="Installed length"
                  quantity="length"
                  value={input.stud.length}
                  onChange={(v) => url.set("sl", v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label={input.slab.kind === "deck-perpendicular" ? "Studs per rib" : "Studs per row"}
                  value={String(input.stud.perGroup)}
                  onChange={(v) => url.set("sg", v)}
                  options={[
                    { value: "1", label: "1" },
                    { value: "2", label: "2" },
                    { value: "3", label: "3" },
                  ]}
                />
                <QuantityInput label="Fu" quantity="stress" value={input.stud.Fu} onChange={(v) => url.set("fu", v)} />
              </div>
              {input.slab.kind === "deck-perpendicular" && (
                <Select
                  label="Stud position in rib"
                  value={input.stud.position}
                  onChange={(v) => url.set("spos", v)}
                  hint="Weak: emid-ht < 2 in.; strong: emid-ht ≥ 2 in. Use weak when position is not controlled."
                  options={[
                    { value: "weak", label: "Weak (Rp = 0.6)" },
                    { value: "strong", label: "Strong (Rp = 0.75)" },
                  ]}
                />
              )}
              {mode === "check" && (
                <NumberInput
                  label="Anchors each side of midspan"
                  value={input.studsPerHalf}
                  onChange={(v) => url.set("n", v === undefined ? undefined : Math.max(0, Math.round(v)))}
                  hint="Blank = minimum that satisfies every check"
                />
              )}
            </div>
          </Card>

          <Card title="Loads" subtitle="Unfactored area loads × tributary width">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <QuantityInput
                  label="Deck + misc. (D)"
                  quantity="areaLoad"
                  value={input.loads.deckMisc}
                  onChange={(v) => url.set("dm", v)}
                />
                <QuantityInput
                  label="Construction live"
                  quantity="areaLoad"
                  value={input.loads.constructionLive}
                  onChange={(v) => url.set("cl", v)}
                />
                <QuantityInput
                  label="Superimposed dead"
                  quantity="areaLoad"
                  value={input.loads.superDead}
                  onChange={(v) => url.set("sdl", v)}
                />
                <QuantityInput
                  label="Live"
                  quantity="areaLoad"
                  value={input.loads.live}
                  onChange={(v) => url.set("ll", v)}
                />
              </div>
              <p className="text-xs text-faint">
                Slab and beam self-weight are added automatically. Superimposed dead and live loads act on the composite
                section. <SpecRef>ASCE 7-22 {method === "LRFD" ? "§2.3.1" : "§2.4.1"}</SpecRef>
              </p>
            </div>
          </Card>

          <Card title="Construction" subtitle={<SpecRef>§I3.1b · Chapter F</SpecRef>}>
            <div className="space-y-3">
              <Select
                label="Construction method"
                value={input.shored ? "1" : "0"}
                onChange={(v) => url.set("shored", v)}
                options={[
                  { value: "0", label: "Unshored" },
                  { value: "1", label: "Shored" },
                ]}
              />
              {!input.shored && (
                <Select
                  label="Top-flange bracing during the pour"
                  value={input.bracing}
                  onChange={(v) => url.set("br", v)}
                  options={[
                    ...(isDeck ? [{ value: "deck" as const, label: "Braced by attached deck (Lb = 0)" }] : []),
                    { value: "unbraced" as const, label: "Unbraced over the span" },
                    { value: "custom" as const, label: "Braces at spacing Lb" },
                  ]}
                />
              )}
              {!input.shored && input.bracing === "custom" && (
                <QuantityInput
                  label="Brace spacing Lb"
                  quantity="span"
                  value={input.Lb}
                  onChange={(v) => url.set("Lb", v)}
                />
              )}
            </div>
          </Card>

          <Card title="Serviceability" subtitle={<SpecRef>§L3 · Commentary §I3.2</SpecRef>}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <NumberInput label="Live limit L /" value={input.liveLimit} onChange={(v) => url.set("lim", v)} />
                <NumberInput label="Total limit L /" value={input.totalLimit} onChange={(v) => url.set("tlim", v)} />
              </div>
              <Select
                label="Moment of inertia for deflection"
                value={input.deflectionBasis}
                onChange={(v) => url.set("defl", v)}
                options={[
                  { value: "ILB", label: "Lower bound ILB (Manual Table 3-20)" },
                  { value: "Ieff", label: "Effective Ieff (Commentary Eq. C-I3-4)" },
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  label="Camber, % of Δwet"
                  value={Math.round(input.camberFraction * 100)}
                  onChange={(v) => url.set("camber", v)}
                />
                <NumberInput
                  label="Min. composite, %"
                  value={Math.round(input.minComposite * 100)}
                  onChange={(v) => url.set("minc", v)}
                />
              </div>
              <p className="text-xs text-faint">
                Camber is rounded down to 1/4 in. and omitted below 3/4 in. Total deflection is measured from the
                cambered position. A minimum of 25 % composite action is recommended.
              </p>
            </div>
          </Card>
        </aside>

        <div className="min-w-0 space-y-4">
          {error && (
            <div role="alert" className="rounded-lg bg-fail-soft p-4 text-sm text-fail">
              {error}
            </div>
          )}
          {single?.failure && (
            <div role="alert" className="rounded-lg bg-fail-soft p-4 text-sm text-fail">
              {single.failure}
            </div>
          )}
          {linked && linked.type !== "W" && (
            <div role="alert" className="rounded-lg bg-warn-soft p-4 text-sm text-warn">
              {displayLabel(linked.label)} is not a W-shape; composite design here covers W-shapes only.
            </div>
          )}
          {mode === "select" && sweep && (
            <Card
              className="no-print"
              title="Lightest W-shapes satisfying all checks"
              subtitle={
                <>
                  {passing.length} passing / {pool.length} searched · each with the minimum number of anchors ·{" "}
                  <SpecRef>Manual Table 3-19 selection</SpecRef>
                </>
              }
              actions={
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={showFailing}
                    onChange={(e) => url.set("failing", e.target.checked ? "1" : "0")}
                  />
                  Show failing
                </label>
              }
              bodyClassName="p-0"
            >
              {visible.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No W-shape satisfies every check">
                    Increase the depth limit, slab thickness or anchor capacity, or show failing sections.
                  </EmptyState>
                </div>
              ) : (
                <div className="max-h-[460px] overflow-auto">
                  <table className={table.table}>
                    <thead>
                      <tr>
                        {[
                          "Shape",
                          `W (${unitLabel("weight", units)})`,
                          "Anchors",
                          `ΣQn (${unitLabel("force", units)})`,
                          "Comp.",
                          `${method === "LRFD" ? "φMn" : "Mn/Ω"} (${unitLabel("moment", units)})`,
                          "M ratio",
                          `ΔLL (${unitLabel("length", units)})`,
                          `ΔTL (${unitLabel("length", units)})`,
                          `Camber (${unitLabel("length", units)})`,
                          ...(sort === "equiv" ? [`Equiv. (${units === "US" ? "lb" : "kg"})`] : []),
                          "Governing",
                        ].map((h) => (
                          <th key={h} className={table.th}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((c) => {
                        const isSel = selected?.shape === c.shape;
                        return (
                          <tr
                            key={c.shape.label}
                            onClick={() => url.set("shape", slugOf(c.shape.label))}
                            aria-selected={isSel}
                            className={clsx("cursor-pointer", table.tr, isSel && "bg-accent-soft")}
                          >
                            <td className={table.td}>
                              <button
                                className="font-mono text-accent underline-offset-2 hover:underline"
                                aria-pressed={isSel}
                              >
                                {displayLabel(c.shape.label)}
                              </button>
                            </td>
                            <td className={table.td}>{fmt(toDisplay(req(c.shape, "W"), "weight", units), 4)}</td>
                            <td className={table.td}>{c.studs.total}</td>
                            <td className={table.td}>{fmt(toDisplay(c.composite.flexure.sumQn, "force", units), 3)}</td>
                            <td className={table.td}>{Math.round(c.composite.flexure.ratio * 100)} %</td>
                            <td className={table.td}>{fmt(toDisplay(c.composite.capacity, "moment", units), 4)}</td>
                            <td className={clsx(table.td, c.composite.mRatio <= 1 ? "text-pass" : "text-fail")}>
                              {fmt(c.composite.mRatio, 3)}
                            </td>
                            <td className={table.td}>{fmt(toDisplay(c.deflection.live, "length", units), 3)}</td>
                            <td className={table.td}>{fmt(toDisplay(c.deflection.total, "length", units), 3)}</td>
                            <td className={table.td}>
                              {c.deflection.camber ? fmt(toDisplay(c.deflection.camber, "length", units), 3) : "—"}
                            </td>
                            {sort === "equiv" && (
                              <td className={table.td}>{fmt(units === "US" ? equiv(c) : equiv(c) * 0.45359237, 4)}</td>
                            )}
                            <td className={clsx(table.td, "text-xs")}>
                              <Badge tone={c.pass ? "pass" : "fail"}>
                                <Sym s={c.governing} />
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {sweep.skipped.length > 0 && (
                <p className="border-t border-line px-4 py-2 text-xs text-muted">
                  {sweep.skipped.length} shape(s) skipped: {sweep.skipped[0]!.reason}
                </p>
              )}
            </Card>
          )}
          {selected && <DesignReport r={selected} input={input} />}
        </div>
      </div>
    </>
  );
}

function DensityInput({ value, onChange }: { value: number; onChange: (v: number | undefined) => void }) {
  const { units } = useSettings();
  const id = useId();
  const factor = units === "US" ? 1 : PCF_TO_KGM3;
  const shown = String(Number((value * factor).toPrecision(4)));
  const [text, setText] = useState(shown);
  useEffect(() => setText((t) => (t !== "" && Number(t) === Number(shown) ? t : shown)), [shown]);
  return (
    <Field label="Unit weight wc" htmlFor={id} hint="90 to 155 lb/ft³ (1440 to 2480 kg/m³)">
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          className="num h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 pr-14 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            onChange(e.target.value.trim() === "" || !Number.isFinite(n) ? undefined : n / factor);
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-faint">
          {units === "US" ? "lb/ft³" : "kg/m³"}
        </span>
      </div>
    </Field>
  );
}

function CheckRow({ name, ratio, refText, detail }: { name: string; ratio: number; refText: string; detail?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-1.5">
      <div className="min-w-0 text-sm text-ink">
        <Sym s={name} />
        {detail && <span className="ml-2 text-xs text-muted">{detail}</span>}
      </div>
      <SpecRef>{refText}</SpecRef>
      <div className="col-span-2">
        <RatioBar ratio={Number.isFinite(ratio) ? ratio : 9.99} />
      </div>
    </div>
  );
}

function DesignReport({ r, input }: { r: CompositeDesign; input: CompositeDesignInput }) {
  const { units, method } = useSettings();
  const f = r.composite.flexure,
    p = f.plastic,
    st = r.studs;
  const q = (v: number | undefined, quantity: Quantity) => fmtQ(v, quantity, units);
  const req_ = method === "LRFD" ? "u" : "a";
  const capLabel = method === "LRFD" ? "φ{b}M{n}" : "M{n}/Ω{b}";
  const pnaText =
    p.pna === "slab"
      ? `in slab, ${q(f.a, "length")} below top of concrete`
      : `in steel ${p.pna}, Y1 = ${q(p.Y1, "length")} below top of steel`;
  return (
    <>
      <Card
        title={
          <>
            {displayLabel(r.shape.label)} · {st.total} anchors{" "}
            <span className="font-normal text-muted">
              ({st.nPerHalf} each side of midspan{st.auto ? ", minimum required" : ", specified"})
            </span>
          </>
        }
        subtitle={
          <>
            {r.material.name} · L = {q(input.L, "span")} · b = {q(r.width.b, "length")} ·{" "}
            {input.shored ? "shored" : "unshored"} · {method}
          </>
        }
        actions={
          <Badge tone={r.pass ? "pass" : "fail"}>
            {r.pass ? "All checks pass" : `Fails: ${r.governing.replace(/[{}]/g, "")}`}
          </Badge>
        }
      >
        <div className="grid gap-2 sm:grid-cols-3 2xl:grid-cols-6">
          <Stat
            label={
              <>
                Required M<sub>{req_}</sub>
              </>
            }
            value={q(r.composite.Mu.value, "moment")}
            sub={r.composite.Mu.combo.label}
          />
          <Stat
            label="Composite strength"
            value={q(r.composite.capacity, "moment")}
            tone={r.composite.mRatio <= 1 ? "pass" : "fail"}
            sub={
              <>
                <Sym s={capLabel} /> · ratio {fmt(r.composite.mRatio, 3)}
              </>
            }
          />
          <Stat
            label="ΣQn"
            value={q(f.sumQn, "force")}
            sub={`${Math.round(f.ratio * 100)} % composite · Qn ${q(st.strength.Qn, "force")}`}
          />
          <Stat
            label="Live deflection"
            value={q(r.deflection.live, "length")}
            sub={`limit ${q(r.deflection.liveAllow, "length")}`}
            tone={r.deflection.live <= r.deflection.liveAllow ? "pass" : "fail"}
          />
          <Stat
            label="Total deflection"
            value={q(r.deflection.total, "length")}
            sub={`limit ${q(r.deflection.totalAllow, "length")}`}
            tone={r.deflection.total <= r.deflection.totalAllow + 1e-9 ? "pass" : "fail"}
          />
          <Stat
            label="Camber"
            value={r.deflection.camber > 0 ? q(r.deflection.camber, "length") : "None"}
            sub={input.shored ? "shored" : `Δwet ${q(r.deflection.wet, "length")}`}
          />
        </div>
        <div className="mt-4 grid gap-x-8 lg:grid-cols-2">
          <div className="divide-y divide-line">
            {r.checks.map((c) => (
              <CheckRow
                key={c.id}
                name={c.name}
                ratio={c.ratio}
                refText={c.ref}
                detail={
                  c.id === "eta"
                    ? `${Math.round((c.demand ?? 0) * 100)} % ≥ ${Math.round((c.capacity ?? 0) * 100)} %`
                    : c.id === "fit"
                      ? `${c.demand} of ${c.capacity} positions`
                      : c.quantity
                        ? `${q(c.demand, c.quantity)} / ${q(c.capacity, c.quantity)}`
                        : undefined
                }
              />
            ))}
          </div>
          <div>
            <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted lg:mt-0">
              Anchor and deck detailing
            </div>
            <table className="w-full text-sm">
              <tbody>
                {r.detailing.map((d) => (
                  <tr key={d.id} className="border-t border-line">
                    <td className="py-1.5">
                      <Sym s={d.name} />
                    </td>
                    <td className="num py-1.5 text-right text-xs text-muted">
                      {q(d.value, "length")} {d.relation} {q(d.limit, "length")}
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      <Badge tone={d.ok ? "pass" : "fail"}>{d.ok ? "OK" : "NG"}</Badge>
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      <SpecRef>{d.ref}</SpecRef>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r.warnings.map((w, i) => (
              <div key={i} className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                <Sym s={w} />
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card
        title="Composite section"
        subtitle={
          <>
            To scale · PNA {pnaText} · <SpecRef>§I3.2a</SpecRef>
          </>
        }
      >
        <div className="[--cs-halo:var(--surface)]">
          <CompositeSection design={r} slab={input.slab} stud={input.stud} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          {(
            [
              ["a", q(f.a, "length")],
              ["Y{1}", p.pna === "slab" ? "slab" : q(p.Y1, "length")],
              ["Y{2}", q(p.Y2, "length")],
              ["C", q(p.C, "force")],
              ["I{s}", q(r.deflection.Is, "inertia")],
              ["I{LB}", q(r.composite.elastic.ILB, "inertia")],
              ["I{eff}", q(r.composite.elastic.Ieff, "inertia")],
              ["I{tr}", q(r.composite.elastic.Itr, "inertia")],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 border-b border-line py-1">
              <dt className="text-muted">
                <Sym s={k} />
              </dt>
              <dd className="num text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card
        title="Loads"
        subtitle={
          <>
            Tributary width {q(r.width.tributary, "span")} · uniform loads on a simple span ·{" "}
            <SpecRef>Manual Table 3-23</SpecRef>
          </>
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="py-1 font-medium">Load</th>
              <th className="py-1 text-right font-medium">Line load</th>
              <th className="py-1 text-right font-medium">Construction stage</th>
              <th className="py-1 text-right font-medium">Composite stage</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Concrete slab", r.loads.slab, "D", "D"],
                ["Deck and miscellaneous", r.loads.deckMisc, "D", "D"],
                ["Beam self-weight", r.loads.beam, "D", "D"],
                ["Construction live", r.loads.constructionLive, "L", "—"],
                ["Superimposed dead", r.loads.superDead, "—", "D"],
                ["Live", r.loads.live, "—", "L"],
              ] as const
            ).map(([name, w, cs, cp]) => (
              <tr key={name} className="border-t border-line">
                <td className="py-1.5">{name}</td>
                <td className="num py-1.5 text-right">{q(w, "lineLoad")}</td>
                <td className="py-1.5 text-right text-muted">{input.shored && cs !== "—" ? "shored" : cs}</td>
                <td className="py-1.5 text-right text-muted">{cp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {r.construction && (
        <Card
          title="Construction stage · steel section alone"
          subtitle={
            <>
              Wet concrete, deck, self-weight and construction live load · L<sub>b</sub> ={" "}
              {r.construction.Lb === 0 ? "0 (braced by deck)" : q(r.construction.Lb, "span")} · C<sub>b</sub> ={" "}
              {fmt(r.construction.Cb, 3)} · <SpecRef>§I3.1b</SpecRef>
            </>
          }
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Stat
              label={
                <>
                  M<sub>{req_}</sub> construction
                </>
              }
              value={q(r.construction.Mu.value, "moment")}
              sub={r.construction.Mu.combo.label}
            />
            <Stat
              label={
                <>
                  V<sub>{req_}</sub> construction
                </>
              }
              value={q(r.construction.Vu.value, "force")}
              sub={r.construction.Vu.combo.label}
            />
            <Stat
              label="Wet concrete deflection"
              value={q(r.deflection.wet, "length")}
              sub={`camber ${r.deflection.camber ? q(r.deflection.camber, "length") : "none"}`}
            />
          </div>
          <div className="mt-4 grid gap-6 xl:grid-cols-2">
            <CalcReport
              result={r.construction.flexure}
              demand={r.construction.segmentMoment}
              title="Flexure · Chapter F"
            />
            <CalcReport result={r.construction.shear} demand={r.construction.Vu.value} title="Shear · Chapter G" />
          </div>
        </Card>
      )}

      <Card title="Composite stage · flexure" subtitle={<SpecRef>AISC 360-22 §§I3.1, I3.2, I8.2</SpecRef>}>
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Effective width</h3>
              <div className="divide-y divide-line">
                {r.width.steps.map((s, i) => (
                  <StepRow key={i} step={s} />
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink">Steel headed stud anchor</h3>
              <div className="divide-y divide-line">
                {st.strength.steps.map((s, i) => (
                  <StepRow key={i} step={s} />
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink">Anchors between maximum and zero moment</h3>
              <div className="divide-y divide-line">
                <StepRow
                  step={{
                    label: "Anchors for full composite action",
                    symbol: "C{f}/Q{n}",
                    value: st.nFull,
                    ref: "Eq. I3-1c",
                  }}
                />
                <StepRow
                  step={{
                    label: "Anchors for the minimum composite ratio",
                    value: st.nMinComposite,
                    ref: "Commentary §I3.2",
                    note: `${Math.round(input.minComposite * 100)} % of C{f}`,
                  }}
                />
                <StepRow
                  step={{
                    label: "Anchors required for flexural strength",
                    value: st.nForStrength,
                    ref: "§I3.2a",
                    note: st.nForStrength === undefined ? "full composite action is insufficient" : undefined,
                  }}
                />
                <StepRow
                  step={{
                    label: "Anchors for maximum spacing",
                    value: st.layout.nSpacing,
                    ref: "§I8.2d",
                    note: `s{max} = min(8t, 36 in.) = ${q(st.layout.smax, "length")}`,
                  }}
                />
                <StepRow
                  step={{
                    label:
                      input.slab.kind === "deck-perpendicular" ? "Rib positions available" : "Row positions available",
                    value: st.layout.groupsAvailable,
                    ref: "§I8.2d",
                    note: `spacing ≥ ${q(st.layout.smin, "length")}`,
                  }}
                />
                <StepRow
                  step={{
                    label: "Anchors provided each side of midspan",
                    symbol: "n",
                    value: st.nPerHalf,
                    note: `${st.groups} ${input.slab.kind === "deck-perpendicular" ? "ribs" : "rows"} at ≈ ${q(st.spacing, "length")}; ${st.total} total`,
                  }}
                />
              </div>
            </div>
          </div>
          <CalcReport result={f} demand={r.composite.Mu.value} title="Plastic stress distribution" />
        </div>
      </Card>

      <Card
        title="Composite stage · shear and deflection"
        subtitle={<SpecRef>§I4.2 · Commentary §I3.2 · Manual Table 3-20</SpecRef>}
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <CalcReport
            result={r.composite.shear}
            demand={r.composite.Vu.value}
            title="Shear — steel web alone (§I4.2)"
          />
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Elastic section properties</h3>
              <div className="divide-y divide-line">
                {r.composite.elastic.steps.map((s, i) => (
                  <StepRow key={i} step={s} />
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink">Deflection</h3>
              <div className="divide-y divide-line">
                {r.deflection.steps.map((s, i) => (
                  <StepRow key={i} step={s} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <ManualTables r={r} />
    </>
  );
}

const Y2S = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7];

function ManualTables({ r }: { r: CompositeDesign }) {
  const { units, method } = useSettings();
  const [view, setView] = useState<"M" | "I">("M");
  const rows = useMemo(() => table319(r.shape, r.material.Fy, Y2S), [r.shape, r.material.Fy]);
  const f = r.composite.flexure;
  const factor = (Mn: number) => available({ nominal: Mn, phi: f.phi, omega: f.omega }, method);
  return (
    <Card
      title={`${displayLabel(r.shape.label)} · ${view === "M" ? "available flexural strength" : "lower-bound moment of inertia"}`}
      subtitle={
        <>
          F<sub>y</sub> = {fmtQ(r.material.Fy, "stress", units)} ·{" "}
          {view === "M"
            ? `${method === "LRFD" ? "φbMn" : "Mn/Ωb"}, ${unitLabel("moment", units)}`
            : `ILB, ${unitLabel("inertia", units)}`}{" "}
          · Y2 in {unitLabel("length", units)} · design: Y2 = {fmtQ(f.plastic.Y2, "length", units)}, ΣQn ={" "}
          {fmtQ(Math.min(f.sumQn, f.Cf), "force", units)} ·{" "}
          <SpecRef>{view === "M" ? "Manual Table 3-19" : "Manual Table 3-20"}</SpecRef>
        </>
      }
      actions={
        <Segmented
          size="sm"
          ariaLabel="Manual table"
          value={view}
          onChange={setView}
          options={[
            { value: "M", label: "Table 3-19" },
            { value: "I", label: "Table 3-20" },
          ]}
        />
      }
      bodyClassName="p-0"
    >
      <div className="overflow-x-auto">
        <table className={table.table}>
          <thead>
            <tr>
              <th className={table.th}>PNA</th>
              <th className={table.th}>Y1</th>
              <th className={table.th}>ΣQn</th>
              {Y2S.map((y) => (
                <th key={y} className={clsx(table.th, "text-right")}>
                  {fmt(toDisplay(y, "length", units), 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.point} className={table.tr}>
                <td className={clsx(table.td, "font-medium")}>{row.point}</td>
                <td className={table.td}>{fmt(toDisplay(row.Y1, "length", units), 3)}</td>
                <td className={table.td}>{fmt(toDisplay(row.sumQn, "force", units), 3)}</td>
                {(view === "M" ? row.Mn.map(factor) : row.ILB).map((v, i) => (
                  <td key={i} className={clsx(table.td, "text-right")}>
                    {fmt(toDisplay(v, view === "M" ? "moment" : "inertia", units), 4)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-xs text-muted">
        Y1 is measured down from the top of steel to the PNA; Y2 from the top of steel to the concrete compression
        resultant. Points TFL to BFL divide the flange in quarters; point 7 is ΣQn = 0.25F<sub>y</sub>A<sub>s</sub> and
        point 6 lies midway in force between BFL and 7. Flange idealized as b<sub>f</sub> × t<sub>f</sub>.
      </p>
    </Card>
  );
}
