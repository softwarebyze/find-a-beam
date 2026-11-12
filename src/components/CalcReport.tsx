/**
 * Renders an engine StrengthResult as a cited calculation report:
 * classification → preliminary steps → each limit state → governing available strength.
 */
import clsx from "clsx";
import { useSettings } from "@/app/settings";
import { available } from "@/aisc/common";
import type { CalcStep, SectionClassification, StrengthResult } from "@/aisc/types";
import { fmt, fmtQ } from "@/lib/units";
import { Badge, SpecRef, Sym } from "./ui";

export function StepRow({ step }: { step: CalcStep }) {
  const { units } = useSettings();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 py-1.5">
      <div className="min-w-0 text-sm text-ink">
        {step.label}
        {step.note && <span className="ml-1.5 text-xs text-muted"><Sym s={step.note} /></span>}
      </div>
      <div className="flex items-baseline justify-end gap-2">
        {step.value !== undefined && (
          <span className="num text-sm font-medium text-ink">
            {step.symbol && <><Sym s={step.symbol} className="font-normal text-muted" /> = </>}
            {step.quantity ? fmtQ(step.value, step.quantity, units, 4) : fmt(step.value, 4)}
          </span>
        )}
        {step.ref && <SpecRef>{step.ref}</SpecRef>}
      </div>
      {step.expr && <div className="col-span-2 font-mono text-xs text-faint"><Sym s={step.expr} /></div>}
    </div>
  );
}

export function ClassificationTable({ c, title }: { c: SectionClassification<string>; title?: string }) {
  return (
    <div>
      {title && <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-faint">
            <th className="py-1 font-medium">Element</th><th className="py-1 font-medium">λ</th><th className="py-1 font-medium">λ<sub>p</sub></th><th className="py-1 font-medium">λ<sub>r</sub></th><th className="py-1 font-medium">Class</th><th />
          </tr>
        </thead>
        <tbody>
          {c.elements.map((e) => (
            <tr key={e.element} className="border-t border-line">
              <td className="py-1.5">{e.element} <span className="text-muted">(<Sym s={e.symbol} />)</span></td>
              <td className="num py-1.5">{fmt(e.lambda, 3)}</td>
              <td className="num py-1.5">{e.lambdaP !== undefined ? fmt(e.lambdaP, 3) : "—"}</td>
              <td className="num py-1.5">{fmt(e.lambdaR, 3)}</td>
              <td className="py-1.5"><Badge tone={e.cls === "compact" || e.cls === "nonslender" ? "pass" : e.cls === "noncompact" ? "warn" : "fail"}>{e.cls}</Badge></td>
              <td className="py-1.5 text-right"><SpecRef>{e.ref}</SpecRef></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Full report for one strength check. `demand` (engine units) adds a D/C line. */
export function CalcReport({ result, demand, title }: { result: StrengthResult; demand?: number; title?: string }) {
  const { units, method } = useSettings();
  const q = result.quantity;
  const avail = available(result, method);
  const ratio = demand !== undefined ? Math.abs(demand) / avail : undefined;
  const cls = "classification" in result ? (result as { classification: SectionClassification<string> }).classification : undefined;
  return (
    <div className="space-y-4">
      {title && <h3 className="text-sm font-semibold text-ink">{title}</h3>}
      <div className="text-xs text-muted">{result.section}</div>
      {cls && <ClassificationTable c={cls} title="Section classification" />}
      {result.steps.length > 0 && <div className="divide-y divide-line">{result.steps.map((s, i) => <StepRow key={i} step={s} />)}</div>}
      {result.limitStates.map((ls) => (
        <div key={ls.id} className={clsx("rounded-lg border px-3 py-2", ls.id === result.governing ? "border-accent/40 bg-accent-soft/40" : "border-line")}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-ink">{ls.name}</div>
            <div className="flex items-center gap-2">
              {ls.id === result.governing && <Badge tone="accent">governs</Badge>}
              <SpecRef>{ls.ref}</SpecRef>
            </div>
          </div>
          <div className="divide-y divide-line">{ls.steps.map((s, i) => <StepRow key={i} step={s} />)}</div>
        </div>
      ))}
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2.5">
        <div className="text-sm text-muted">
          Available strength ({method === "LRFD" ? <>φ = {result.phi}</> : <>Ω = {result.omega}</>})
        </div>
        <div className="num text-base font-semibold text-ink">{fmtQ(avail, q, units, 4)}</div>
      </div>
      {ratio !== undefined && (
        <div className="flex items-baseline justify-between px-3 text-sm">
          <span className="text-muted">Demand / capacity</span>
          <span className={clsx("num font-semibold", ratio <= 1 ? "text-pass" : "text-fail")}>{fmt(ratio, 3)} {ratio <= 1 ? "OK" : "NG"}</span>
        </div>
      )}
      {result.warnings.map((w, i) => <div key={i} className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn"><Sym s={w} /></div>)}
    </div>
  );
}
