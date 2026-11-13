import clsx from "clsx";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui";
import { Sym } from "@/components/Sym";
import { useSettings } from "@/app/settings";
import { PROPERTY } from "@/data/properties";
import { SHAPES } from "@/data/shapes";
import { ColumnChooser, CompareTray, RangeFilters } from "./ExplorerControls";
import {
  availableProps, emphasized, EXPLORER_TYPES, isCapacityProp, MANUAL_ORDER, matchesType, MAX_COMPARE, nextSort, normalizeQuery, PRESETS,
  queryShapes, toCSV, typeInfo, type ExplorerType, type RangeFilter,
} from "./logic";
import { ShapeTable } from "./ShapeTable";
import { Icon, inputClass, toolbarButton } from "./shared";
import { useExplorerState } from "./useExplorerState";

const TYPE_COUNTS = new Map<ExplorerType, number>(EXPLORER_TYPES.map((t) => [t.id, SHAPES.filter((s) => matchesType(s, t.id)).length]));

export function ExplorerPage() {
  const { units } = useSettings();
  const [st, update] = useExplorerState();
  const info = typeInfo(st.type);

  const pool = useMemo(() => SHAPES.filter((s) => matchesType(s, st.type)), [st.type]);
  const props = useMemo(() => availableProps(pool), [pool]);
  const preset = PRESETS[st.type];
  const cols = st.cols ?? preset;

  const deferredQ = useDeferredValue(st.q);
  const rows = useMemo(() => queryShapes(pool, { type: "ALL", q: deferredQ, filters: st.filters, sort: st.sort }), [pool, deferredQ, st.filters, st.sort]);
  const bold = useMemo(() => emphasized(rows, st.sort), [rows, st.sort]);

  const [qText, setQText] = useState(st.q);
  useEffect(() => { setQText((t) => (normalizeQuery(t) === normalizeQuery(st.q) ? t : st.q)); }, [st.q]);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !t.closest("input,textarea,select,[contenteditable]")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setType = (type: ExplorerType) => {
    if (type === st.type) return;
    const next = new Set(availableProps(SHAPES.filter((s) => matchesType(s, type))).map((p) => p.key));
    update((s) => ({
      type,
      cols: undefined,
      filters: s.filters.filter((f) => next.has(f.key)),
      sort: s.sort.key === "label" || next.has(s.sort.key) ? s.sort : MANUAL_ORDER,
    }));
  };
  const onSort = useCallback((key: string) => update((s) => ({ sort: nextSort(s.sort, key) })), [update]);
  const toggleCompare = useCallback((slug: string) => update((s) => ({
    cmp: s.cmp.includes(slug) ? s.cmp.filter((x) => x !== slug) : s.cmp.length >= MAX_COMPARE ? s.cmp : [...s.cmp, slug],
  })), [update]);
  const setFilters = useCallback((filters: RangeFilter[]) => update({ filters }), [update]);

  const lightestFirst = st.sort.key === "W" && st.sort.dir === "asc";
  const exportCsv = () => {
    const blob = new Blob(["\uFEFF" + toCSV(rows, cols, units)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aisc-shapes-v16-${info.id.toLowerCase()}-${units.toLowerCase()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const sortMeta = PROPERTY[st.sort.key];
  const legend = bold.size === 0 ? null : st.sort.key === "W"
    ? <>Bold: lightest shape in each nominal-depth series.</>
    : sortMeta && isCapacityProp(st.sort.key)
      ? <>Bold: lightest shape providing at least that <Sym s={sortMeta.symbol} /> (Manual Table 3-2 convention).</>
      : null;

  return (
    <>
      <PageHeader
        eyebrow="AISC Shapes Database v16.0"
        title={st.type === "ALL" ? "All shapes" : info.name}
        description={<>Dimensions and properties{info.table ? <>, Manual {info.table}</> : <>, Manual Part 1</>}. Open a row for full properties and design strengths; tick up to four shapes to compare.</>}
      />

      <div role="radiogroup" aria-label="Shape type" className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1">
        {EXPLORER_TYPES.map((t) => {
          const on = t.id === st.type;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              title={t.table ? `${t.name} — Manual ${t.table}` : t.name}
              onClick={() => setType(t.id)}
              className={clsx(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition focus-visible:outline-2 focus-visible:outline-accent",
                on ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {t.short}
              <span className={clsx("num text-[11px] font-normal", on ? "text-accent/80" : "text-faint")}>{TYPE_COUNTS.get(t.id)}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            ref={searchRef}
            type="search"
            aria-label="Search designations"
            placeholder="W18x, W18×50, HSS6X6, L4x4…"
            value={qText}
            onChange={(e) => { setQText(e.target.value); update({ q: e.target.value }); }}
            className={clsx(inputClass, "pl-8 pr-8 font-mono placeholder:font-sans")}
          />
          {!qText && <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line px-1 font-mono text-[10px] text-faint">/</kbd>}
        </div>
        <button
          type="button"
          aria-pressed={lightestFirst}
          onClick={() => update({ sort: lightestFirst ? MANUAL_ORDER : { key: "W", dir: "asc" } })}
          className={clsx(toolbarButton, lightestFirst && "border-accent bg-accent-soft text-accent hover:bg-accent-soft")}
        >
          Lightest first
        </button>
        <ColumnChooser cols={cols} preset={preset} presetName={info.table ? `Manual ${info.table.replace("Tables", "Table")}` : "default"} props={props} onChange={(c) => update({ cols: c })} />
        <button type="button" onClick={exportCsv} className={toolbarButton} disabled={rows.length === 0} title="Download the current view as CSV in the active units">
          <Icon name="download" className="text-muted" />CSV
        </button>
        <div className="ml-auto text-sm text-muted" aria-live="polite">
          <span className="num font-medium text-ink">{rows.length.toLocaleString("en-US")}</span> of <span className="num">{pool.length.toLocaleString("en-US")}</span> shapes
          {st.sort.key !== "label" && (
            <button type="button" onClick={() => update({ sort: MANUAL_ORDER })} className="ml-3 text-xs text-accent hover:underline">Manual order</button>
          )}
        </div>
      </div>

      <div className="mb-3">
        <RangeFilters filters={st.filters} onChange={setFilters} pool={pool} props={props} units={units} />
      </div>

      <ShapeTable
        rows={rows}
        cols={cols}
        units={units}
        sort={st.sort}
        onSort={onSort}
        bold={bold}
        compare={st.cmp}
        compareFull={st.cmp.length >= MAX_COMPARE}
        onToggleCompare={toggleCompare}
        height="max(26rem, calc(100dvh - 22rem))"
      />
      <div className="mt-2 flex min-h-4 flex-wrap justify-between gap-2 text-xs text-faint">
        <span>{legend}</span>
        <span>Values as tabulated in the database{units === "SI" ? ", converted to SI" : ""}. Click a column heading to sort.</span>
      </div>

      <CompareTray slugs={st.cmp} onRemove={toggleCompare} onClear={() => update({ cmp: [] })} />
    </>
  );
}
