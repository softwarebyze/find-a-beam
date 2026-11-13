import clsx from "clsx";
import { Fragment, useMemo, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { available } from "@/aisc";
import { useSettings } from "@/app/settings";
import { ShapePicker } from "@/components/ShapePicker";
import { Sym } from "@/components/Sym";
import { EmptyState, PageHeader } from "@/components/ui";
import { PROPERTIES, PROPERTY_GROUPS } from "@/data/properties";
import { displayLabel, findShape, num, slugOf, type Shape } from "@/data/shapes";
import { CrossSection } from "@/features/drawings/CrossSection";
import { fmt, toDisplay, unitLabel, type Quantity, type UnitSystem } from "@/lib/units";
import { designSummary, governingState, type DesignSummary } from "./design";
import { bestWorst, commonScale, efficiency, EFFICIENCY, efficiencyUnit, fmtExact, manualTableOf, MAX_COMPARE, parseCompareSlugs, plainSymbol, preference } from "./logic";
import { Icon } from "./shared";

const EXAMPLES = [["W18X50", "W21X44", "W16X57"], ["HSS8X8X1/2", "HSS10X6X1/2", "HSS8.625X0.500"], ["W14X90", "W12X96", "HP14X89"]];
const DRAW_W = 150;
const DRAW_H = 180;

type Pref = "higher" | "lower" | undefined;
interface CompareRow { id: string; label: ReactNode; unit: string; values: (number | undefined)[]; format: (v: number) => string; pref: Pref; title?: string }

export function ComparePage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const { units, method } = useSettings();
  const shapes = useMemo(() => parseCompareSlugs(new URLSearchParams(search).get("s"), findShape), [search]);
  const setShapes = (list: Shape[]) => navigate({ search: list.length ? `?s=${list.map((s) => slugOf(s.label)).join(",")}` : "" }, { replace: true });
  const add = (s: Shape) => { if (!shapes.includes(s) && shapes.length < MAX_COMPARE) setShapes([...shapes, s]); };
  const remove = (s: Shape) => setShapes(shapes.filter((x) => x !== s));

  const designs = useMemo(() => shapes.map((s) => designSummary(s)), [shapes]);
  const scale = useMemo(() => commonScale(shapes, DRAW_W, DRAW_H), [shapes]);
  const sections = useMemo(() => buildRows(shapes, designs, units, method), [shapes, designs, units, method]);

  const picker = shapes.length < MAX_COMPARE && (
    <div className="w-full max-w-56">
      <ShapePicker label={shapes.length ? "Add shape" : "First shape"} value={undefined} onChange={add} placeholder="e.g. W21×44" />
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Shapes"
        title="Compare shapes"
        description={<>Up to {MAX_COMPARE} shapes side by side, drawn to a common scale. Best and worst values are highlighted where more (or less) is clearly better.</>}
      />
      {shapes.length === 0 ? (
        <div className="space-y-4">
          <div className="max-w-xs">{picker}</div>
          <EmptyState title="No shapes selected">
            <div className="mt-2 flex flex-col items-center gap-2">
              {EXAMPLES.map((ex) => (
                <Link key={ex.join()} to={`?s=${ex.map(slugOf).join(",")}`} className="font-mono text-[13px] text-accent hover:underline">
                  {ex.map(displayLabel).join("  vs  ")}
                </Link>
              ))}
              <span className="text-xs">or tick shapes in the <Link to="/shapes" className="text-accent hover:underline">explorer</Link>.</span>
            </div>
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface lg:overflow-visible [--cs-halo:var(--surface)]">
          <table className="w-full border-collapse text-sm">
            <colgroup>
              <col className="w-56" />
              {shapes.map((s) => <col key={s.label} className="min-w-44" />)}
              {picker && <col className="w-56" />}
            </colgroup>
            <thead>
              <tr>
                <td className="border-b border-line px-3 py-3 align-bottom text-xs text-faint">All sections drawn to the same scale.</td>
                {shapes.map((s) => (
                  <td key={s.label} className="border-b border-l border-line px-2 pt-3 align-bottom">
                    <div className="flex justify-center"><CrossSection shape={s} mode="dimensioned" scale={scale} showUnits={false} /></div>
                  </td>
                ))}
                {picker && <td rowSpan={2} className="border-b border-l border-line px-3 py-3 align-top">{picker}</td>}
              </tr>
              <tr>
                <th scope="col" className="border-b border-line-strong bg-surface-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted lg:sticky lg:top-14 lg:z-10">Property</th>
                {shapes.map((s) => (
                  <th key={s.label} scope="col" className="border-b border-l border-line border-b-line-strong bg-surface-2 px-3 py-2 text-right lg:sticky lg:top-14 lg:z-10">
                    <div className="flex items-center justify-end gap-2">
                      <Link to={`/shapes/${slugOf(s.label)}`} className="font-mono text-[13.5px] font-semibold text-ink hover:text-accent hover:underline">{displayLabel(s.label)}</Link>
                      <button type="button" onClick={() => remove(s)} aria-label={`Remove ${displayLabel(s.label)}`} className="flex size-6 items-center justify-center rounded text-faint hover:bg-surface hover:text-ink">
                        <Icon name="x" className="size-3.5" />
                      </button>
                    </div>
                    <div className="text-[11px] font-normal text-faint">Manual {manualTableOf(s)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => (
                <Fragment key={sec.title}>
                  <tr>
                    <th scope="colgroup" colSpan={shapes.length + 1 + (picker ? 1 : 0)} className="border-b border-line bg-surface-2/60 px-3 pb-1 pt-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {sec.title}{sec.note && <span className="ml-2 font-normal normal-case tracking-normal text-faint">{sec.note}</span>}
                    </th>
                  </tr>
                  {sec.rows.map((r) => <ValueRow key={r.id} r={r} hasPicker={!!picker} />)}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ValueRow({ r, hasPicker }: { r: CompareRow; hasPicker: boolean }) {
  const { best, worst } = bestWorst(r.values, r.pref);
  return (
    <tr className="hover:bg-surface-2/50" title={r.title}>
      <th scope="row" className="border-b border-line px-3 py-1.5 text-left font-normal">
        <span className="text-[13px] text-ink">{r.label}</span>
        {r.unit && <span className="ml-1.5 text-[11px] text-faint">{r.unit}</span>}
      </th>
      {r.values.map((v, i) => (
        <td
          key={i}
          className={clsx(
            "num border-b border-l border-line px-3 py-1.5 text-right",
            v === undefined ? "text-faint" : i === best ? "bg-pass-soft font-semibold text-pass" : i === worst ? "text-fail" : "text-ink",
          )}
        >
          {v === undefined ? "—" : r.format(v)}
          {i === best && <span className="sr-only"> (best)</span>}
          {i === worst && <span className="sr-only"> (worst)</span>}
        </td>
      ))}
      {hasPicker && <td className="border-b border-l border-line" />}
    </tr>
  );
}

function buildRows(shapes: Shape[], designs: DesignSummary[], units: UnitSystem, method: "LRFD" | "ASD"): { title: string; note?: ReactNode; rows: CompareRow[] }[] {
  if (!shapes.length) return [];
  const out: { title: string; note?: ReactNode; rows: CompareRow[] }[] = [];
  const many = shapes.length > 1;

  for (const group of PROPERTY_GROUPS) {
    const rows: CompareRow[] = [];
    for (const p of PROPERTIES) {
      if (p.group !== group) continue;
      const values = shapes.map((s) => num(s, p.key));
      if (values.every((v) => v === undefined)) continue;
      rows.push({
        id: p.key, label: <Sym s={p.symbol} />, unit: unitLabel(p.quantity, units), values, title: `${plainSymbol(p.name)} — ${plainSymbol(p.description)}`,
        format: (v) => fmtExact(v, p.quantity, units), pref: many ? preference(p.key) : undefined,
      });
    }
    if (rows.length) out.push({ title: group, rows });
  }

  out.splice(1, 0, {
    title: "Efficiency",
    note: "section property per unit weight",
    rows: EFFICIENCY.map((m) => ({
      id: m.id, label: <Sym s={m.symbol} />, unit: efficiencyUnit(m, units), values: shapes.map((s) => efficiency(s, m, units)),
      format: (v: number) => fmt(v, 3), pref: many ? "higher" as const : undefined, title: m.name,
    })).filter((r) => r.values.some((v) => v !== undefined)),
  });

  const strength = (id: string, label: ReactNode, q: Quantity, pick: (d: DesignSummary) => number | undefined): CompareRow => ({
    id, label, unit: unitLabel(q, units), values: designs.map(pick), format: (v) => fmt(toDisplay(v, q, units), 3), pref: many ? "higher" : undefined,
  });
  const f = method === "LRFD";
  out.splice(2, 0, {
    title: "Design strengths",
    note: <>{method}, preferred material per shape ({[...new Set(designs.map((d) => d.material.name))].join(", ")}), <Sym s="C{b}" /> = 1.0</>,
    rows: [
      strength("Mnx", <><Sym s={f ? "φ{b}M{nx}" : "M{nx}/Ω{b}"} />, <Sym s="L{b}" /> = 0</>, "moment", (d) => (d.flexX.ok ? available(d.flexX.value, method) : undefined)),
      strength("Lp", <Sym s="L{p}" />, "span", (d) => (d.flexX.ok ? d.flexX.value.Lp : undefined)),
      strength("Lr", <Sym s="L{r}" />, "span", (d) => (d.flexX.ok && d.flexX.value.Lr !== undefined && Number.isFinite(d.flexX.value.Lr) ? d.flexX.value.Lr : undefined)),
      strength("Mny", <Sym s={f ? "φ{b}M{ny}" : "M{ny}/Ω{b}"} />, "moment", (d) => (d.flexY.ok ? available(d.flexY.value, method) : undefined)),
      strength("Vnx", <Sym s={f ? "φ{v}V{nx}" : "V{nx}/Ω{v}"} />, "force", (d) => (d.shearX.ok ? available(d.shearX.value, method) : undefined)),
      ...designs[0]!.compression.map((c, i) => strength(`Pn${i}`, <><Sym s={f ? "φ{c}P{n}" : "P{n}/Ω{c}"} />, <Sym s="L{c}" /> = {c.Lc === 0 ? "0" : `${fmt(toDisplay(c.Lc, "span", units), 3)} ${unitLabel("span", units)}`}</>, "force", (d) => {
        const r = d.compression[i]?.result;
        return r?.ok ? available(r.value, method) : undefined;
      })),
    ].map((r) => ({ ...r, title: r.id === "Mnx" ? designs.map((d, i) => `${shapes[i]!.label}: ${d.flexX.ok ? governingState(d.flexX.value)?.name ?? "" : "n/a"}`).join(" · ") : undefined }))
      .filter((r) => r.values.some((v) => v !== undefined)),
  });
  return out;
}
