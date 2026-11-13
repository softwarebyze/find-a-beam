import type { ReactNode } from "react";
import { Link } from "react-router";
import { available, type DesignMethod, type FlexureResult, type StrengthResult } from "@/aisc";
import { ClassificationTable } from "@/components/CalcReport";
import { LineChart } from "@/components/charts/LineChart";
import { Badge, Card, SpecRef } from "@/components/ui";
import { Sym } from "@/components/Sym";
import { slugOf, type Shape } from "@/data/shapes";
import { fmt, fmtQ, toDisplay, unitLabel, type UnitSystem } from "@/lib/units";
import { governingState, tensionYielding, type DesignSummary, type MomentCurve, type Outcome } from "./design";

const factor = (r: Pick<StrengthResult, "phi" | "omega">, m: DesignMethod) => (m === "LRFD" ? `φ = ${r.phi.toFixed(2)}` : `Ω = ${r.omega.toFixed(2)}`);
const sym = (base: string, sub: string, m: DesignMethod, f: string) => (m === "LRFD" ? `φ{${f}}${base}{${sub}}` : `${base}{${sub}}/Ω{${f}}`);

function Unsupported({ error }: { error: string }) {
  return <span className="text-xs text-faint" title={error}>Not covered by the engine for this shape</span>;
}

function Row({ label, symbol, children, refs, sub }: { label: ReactNode; symbol: string; children: ReactNode; refs?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-t border-line py-2 first:border-t-0">
      <div className="min-w-0">
        <div className="text-sm text-ink">{label}</div>
        {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <div className="num flex items-baseline gap-1.5 text-sm">
          <Sym s={symbol} className="text-muted" />
          <span className="text-muted">=</span>
          <span className="font-semibold text-ink">{children}</span>
        </div>
        {refs && <div className="flex flex-wrap justify-end gap-1">{refs}</div>}
      </div>
    </div>
  );
}

function StrengthRow<T extends StrengthResult>({ o, label, symbol, units, method, sub }: {
  o: Outcome<T>; label: ReactNode; symbol: string; units: UnitSystem; method: DesignMethod; sub?: (r: T) => ReactNode;
}) {
  if (!o.ok) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-t border-line py-2 first:border-t-0">
        <div className="text-sm text-ink">{label}</div>
        <Unsupported error={o.error} />
      </div>
    );
  }
  const r = o.value;
  const gov = governingState(r);
  return (
    <Row label={label} symbol={symbol} sub={sub?.(r)} refs={<>{gov && <SpecRef title={gov.name}>{gov.ref}</SpecRef>}<span className="text-[11px] text-faint">{factor(r, method)}</span></>}>
      {fmtQ(available(r, method), r.quantity, units, 3)}
    </Row>
  );
}

export function DesignStrengths({ shape, d, units, method }: { shape: Shape; d: DesignSummary; units: UnitSystem; method: DesignMethod }) {
  const m = d.material;
  const slug = slugOf(shape.label);
  const ty = d.tension.ok ? tensionYielding(d.tension.value, method) : undefined;
  const span = (v: number) => fmtQ(v, "span", units, 3);
  return (
    <Card
      title="Design strengths"
      subtitle={<>{m.name} (<Sym s="F{y}" /> = {fmtQ(m.Fy, "stress", units)}, <Sym s="F{u}" /> = {fmtQ(m.Fu, "stress", units)}) · {method} · preferred material per Manual Table 2-4/2-5</>}
      actions={<Badge tone="accent">{method}</Badge>}
      bodyClassName="px-4 py-1"
    >
      <StrengthRow
        o={d.flexX} units={units} method={method}
        label={<>Major-axis flexure, <Sym s="L{b}" /> = 0</>}
        symbol={sym("M", "nx", method, "b")}
        sub={(r) => r.Lp !== undefined && r.Lr !== undefined && Number.isFinite(r.Lr) ? <LimitingLengths r={r} span={span} /> : undefined}
      />
      <StrengthRow o={d.flexY} units={units} method={method} label="Minor-axis flexure" symbol={sym("M", "ny", method, "b")} />
      <StrengthRow o={d.shearX} units={units} method={method} label="Major-axis shear" symbol={sym("V", "nx", method, "v")} sub={(r) => r.section} />
      {d.compression.map(({ Lc, result }) => (
        <StrengthRow
          key={Lc} o={result} units={units} method={method}
          label={<>Axial compression, <Sym s="L{c}" /> = {Lc === 0 ? "0" : span(Lc)}</>}
          symbol={sym("P", "n", method, "c")}
          sub={(r) => (r.classification.overall === "slender" ? "Slender-element section (§E7)" : undefined)}
        />
      ))}
      {ty ? (
        <Row label="Tensile yielding, gross section" symbol={sym("P", "n", method, "t")} refs={<><SpecRef>Eq. D2-1</SpecRef><span className="text-[11px] text-faint">{factor({ phi: ty.state.phi!, omega: ty.state.omega! }, method)}</span></>}>
          {fmtQ(ty.value, "force", units, 3)}
        </Row>
      ) : !d.tension.ok ? (
        <div className="flex justify-between border-t border-line py-2 text-sm"><span>Tensile yielding</span><Unsupported error={d.tension.error} /></div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-xs text-muted">
        <span><Sym s="C{b}" /> = 1.0; <Sym s="L{cx}" /> = <Sym s="L{cy}" />; no holes. Full calculations:</span>
        <span className="flex gap-3">
          <Link className="font-medium text-accent hover:underline" to={`/beam?shape=${slug}`}>Beam</Link>
          <Link className="font-medium text-accent hover:underline" to={`/column?shape=${slug}`}>Column</Link>
          <Link className="font-medium text-accent hover:underline" to={`/member?shape=${slug}`}>Member</Link>
        </span>
      </div>
    </Card>
  );
}

function LimitingLengths({ r, span }: { r: FlexureResult; span: (v: number) => string }) {
  const refOf = (s: string) => r.steps.find((x) => x.symbol === s)?.ref;
  const lp = refOf("L{p}"), lr = refOf("L{r}");
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span><Sym s="L{p}" /> = {span(r.Lp!)}</span>{lp && <SpecRef>{lp}</SpecRef>}
      <span><Sym s="L{r}" /> = {span(r.Lr!)}</span>{lr && <SpecRef>{lr}</SpecRef>}
    </span>
  );
}

export function MomentChart({ curve, units, method }: { curve: Outcome<MomentCurve>; units: UnitSystem; method: DesignMethod }) {
  if (!curve.ok) return null;
  const c = curve.value;
  const x = (v: number) => toDisplay(v, "span", units);
  const y = (v: number) => toDisplay(v, "moment", units);
  const at = (Lb: number) => c.points.reduce((a, p) => (Math.abs(p.Lb - Lb) < Math.abs(a.Lb - Lb) ? p : a), c.points[0]!).Mc;
  const label = method === "LRFD" ? "φbMnx" : "Mnx/Ωb";
  return (
    <Card
      title={<>Available moment vs. unbraced length</>}
      subtitle={<><Sym s={method === "LRFD" ? "φ{b}M{nx}" : "M{nx}/Ω{b}"} /> with <Sym s="C{b}" /> = 1.0, all applicable limit states</>}
      actions={<SpecRef>Chapter F</SpecRef>}
    >
      <LineChart
        height={260}
        series={[{ id: "m", label, points: c.points.map((p) => ({ x: x(p.Lb), y: y(p.Mc) })) }]}
        markers={[
          { x: x(c.Lp), y: y(at(c.Lp)), label: "Lp" },
          { x: x(c.Lr), y: y(at(c.Lr)), label: "Lr" },
        ]}
        xMin={0}
        yMin={0}
        xLabel={`Unbraced length Lb (${unitLabel("span", units)})`}
        yLabel={`${label} (${unitLabel("moment", units)})`}
        formatX={(v) => fmt(v, 3)}
        formatY={(v) => fmt(v, 3)}
        legend={false}
      />
    </Card>
  );
}

export function Classification({ d, units }: { d: DesignSummary; units: UnitSystem }) {
  return (
    <Card title="Width-to-thickness classification" subtitle={<>{d.material.name}, <Sym s="F{y}" /> = {fmtQ(d.material.Fy, "stress", units)} · AISC 360-22 Table B4.1</>}>
      <div className="space-y-5">
        {d.classFlexure.ok ? (
          <div>
            <div className="mb-1 flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-muted">Flexure (major axis)</span><ClassBadge cls={d.classFlexure.value.overall} /></div>
            <ClassificationTable c={d.classFlexure.value} />
          </div>
        ) : <p className="text-xs text-faint">Flexural classification not available: {d.classFlexure.error}</p>}
        {d.classCompression.ok ? (
          <div>
            <div className="mb-1 flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-muted">Axial compression</span><ClassBadge cls={d.classCompression.value.overall} /></div>
            <ClassificationTable c={d.classCompression.value} />
          </div>
        ) : <p className="text-xs text-faint">Compression classification not available: {d.classCompression.error}</p>}
      </div>
    </Card>
  );
}

function ClassBadge({ cls }: { cls: string }) {
  return <Badge tone={cls === "compact" || cls === "nonslender" ? "pass" : cls === "noncompact" ? "warn" : "fail"}>{cls}</Badge>;
}
