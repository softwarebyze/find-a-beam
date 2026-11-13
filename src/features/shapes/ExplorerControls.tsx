import clsx from "clsx";
import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { Sym } from "@/components/Sym";
import { PROPERTY, PROPERTY_GROUPS, type PropertyMeta } from "@/data/properties";
import { displayLabel, findShape, num, type Shape } from "@/data/shapes";
import { CrossSection } from "@/features/drawings/CrossSection";
import { fmt, fromDisplay, toDisplay, unitLabel, type Quantity, type UnitSystem } from "@/lib/units";
import { MAX_COMPARE, plainSymbol, sameList, type RangeFilter } from "./logic";
import { Icon, inputClass, Popover } from "./shared";

/* ------------------------------------------------------------------ range filters */

function BoundInput({
  value,
  quantity,
  units,
  onChange,
  placeholder,
  label,
  autoFocus,
}: {
  value: number | undefined;
  quantity: Quantity;
  units: UnitSystem;
  onChange: (v: number | undefined) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
}) {
  const shown = value === undefined ? "" : String(Number(toDisplay(value, quantity, units).toPrecision(6)));
  const [text, setText] = useState(shown);
  useEffect(() => {
    setText((t) => (t.trim() !== "" && Number(t) === Number(shown) ? t : shown));
  }, [shown]);
  return (
    <input
      inputMode="decimal"
      aria-label={label}
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const raw = e.target.value.trim();
        const n = Number(raw);
        onChange(raw === "" || !Number.isFinite(n) ? undefined : fromDisplay(n, quantity, units));
      }}
      className="num h-7 w-[4.5rem] rounded-md border border-line-strong bg-surface px-1.5 text-right text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
    />
  );
}

/** Min / max of a property over a pool, in engine units. */
function rangeOf(pool: readonly Shape[], key: string): [number, number] | undefined {
  let lo = Infinity,
    hi = -Infinity;
  for (const s of pool) {
    const v = num(s, key);
    if (v === undefined) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? [lo, hi] : undefined;
}

export function RangeFilters({
  filters,
  onChange,
  pool,
  props,
  units,
}: {
  filters: RangeFilter[];
  onChange: (f: RangeFilter[]) => void;
  pool: readonly Shape[];
  props: PropertyMeta[];
  units: UnitSystem;
}) {
  const [justAdded, setJustAdded] = useState<string>();
  const addId = useId();
  const unused = props.filter((p) => !filters.some((f) => f.key === p.key));
  const groups = PROPERTY_GROUPS.map((g) => ({ g, items: unused.filter((p) => p.group === g) })).filter(
    (x) => x.items.length,
  );
  const set = (key: string, patch: Partial<RangeFilter>) =>
    onChange(filters.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => {
        const p = PROPERTY[f.key];
        if (!p) return null;
        const r = rangeOf(pool, f.key);
        const u = unitLabel(p.quantity, units);
        const ph = (v: number | undefined) =>
          v === undefined ? "" : fmt(toDisplay(v, p.quantity, units), 3).replace(/,/g, "");
        return (
          <div
            key={f.key}
            role="group"
            aria-label={`${plainSymbol(p.name)} range`}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface-2 pl-2.5 pr-1"
          >
            <span className="text-[13px] font-medium text-ink" title={plainSymbol(p.description)}>
              <Sym s={p.symbol} />
            </span>
            <BoundInput
              label={`${plainSymbol(p.name)} minimum`}
              value={f.min}
              quantity={p.quantity}
              units={units}
              placeholder={ph(r?.[0])}
              onChange={(min) => set(f.key, { min })}
              autoFocus={justAdded === f.key}
            />
            <span className="text-xs text-faint">to</span>
            <BoundInput
              label={`${plainSymbol(p.name)} maximum`}
              value={f.max}
              quantity={p.quantity}
              units={units}
              placeholder={ph(r?.[1])}
              onChange={(max) => set(f.key, { max })}
            />
            {u && <span className="text-[11px] text-faint">{u}</span>}
            <button
              type="button"
              aria-label={`Remove ${plainSymbol(p.name)} filter`}
              onClick={() => onChange(filters.filter((x) => x.key !== f.key))}
              className="flex size-6 items-center justify-center rounded text-faint hover:bg-surface hover:text-ink"
            >
              <Icon name="x" className="size-3.5" />
            </button>
          </div>
        );
      })}
      <label htmlFor={addId} className="sr-only">
        Add range filter
      </label>
      <select
        id={addId}
        value=""
        onChange={(e) => {
          const key = e.target.value;
          if (!key) return;
          setJustAdded(key);
          onChange([...filters, { key }]);
        }}
        className={clsx(inputClass.replace("w-full", "w-44"), "pr-8 text-muted")}
      >
        <option value="">+ Range filter…</option>
        {groups.map(({ g, items }) => (
          <optgroup key={g} label={g}>
            {items.map((p) => (
              <option key={p.key} value={p.key}>
                {p.key} — {plainSymbol(p.name)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {filters.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs text-muted hover:text-ink hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ columns */

export function ColumnChooser({
  cols,
  preset,
  presetName,
  props,
  onChange,
}: {
  cols: readonly string[];
  preset: readonly string[];
  presetName: string;
  props: PropertyMeta[];
  onChange: (cols: string[] | undefined) => void;
}) {
  const order = useMemo(() => {
    const idx = new Map<string, number>();
    preset.forEach((k, i) => idx.set(k, i));
    props.forEach((p, i) => {
      if (!idx.has(p.key)) idx.set(p.key, 1000 + i);
    });
    return idx;
  }, [preset, props]);
  const toggle = (k: string) => {
    const next = cols.includes(k)
      ? cols.filter((c) => c !== k)
      : [...cols, k].sort((a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999));
    onChange(sameList(next, preset) ? undefined : next);
  };
  const isPreset = sameList(cols, preset);
  return (
    <Popover
      label={
        <>
          <Icon name="columns" className="text-muted" />
          Columns <span className="num text-faint">{cols.length}</span>
        </>
      }
      align="left"
      panelClassName="w-[36rem] max-lg:fixed max-lg:inset-x-4 max-lg:w-auto"
    >
      {() => (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs text-muted">
              {isPreset ? <>Showing the {presetName} column set.</> : "Custom columns."}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs font-medium text-accent hover:underline disabled:text-faint disabled:no-underline"
                disabled={isPreset}
                onClick={() => onChange(undefined)}
              >
                Reset to {presetName}
              </button>
              <button
                type="button"
                className="text-xs font-medium text-accent hover:underline"
                onClick={() => onChange(props.map((p) => p.key))}
              >
                All
              </button>
            </div>
          </div>
          <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
            {PROPERTY_GROUPS.map((g) => {
              const items = props.filter((p) => p.group === g);
              if (!items.length) return null;
              return (
                <fieldset key={g}>
                  <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{g}</legend>
                  <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
                    {items.map((p) => (
                      <label
                        key={p.key}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[13px] hover:bg-surface-2"
                        title={plainSymbol(p.description)}
                      >
                        <input
                          type="checkbox"
                          className="accent-[var(--accent)]"
                          checked={cols.includes(p.key)}
                          onChange={() => toggle(p.key)}
                        />
                        <Sym s={p.symbol} className="w-10 shrink-0 text-ink" />
                        <Sym s={p.name} className="truncate text-xs text-muted" />
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </div>
      )}
    </Popover>
  );
}

/* ------------------------------------------------------------------ compare tray */

export function CompareTray({
  slugs,
  onRemove,
  onClear,
}: {
  slugs: readonly string[];
  onRemove: (slug: string) => void;
  onClear: () => void;
}) {
  const shapes = slugs.map((s) => findShape(s)).filter((s): s is Shape => !!s);
  if (!shapes.length) return null;
  return (
    <div className="sticky bottom-3 z-30 mt-3">
      <div
        role="region"
        aria-label="Compare tray"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-surface/95 px-3 py-2 shadow-lg backdrop-blur [--cs-halo:var(--surface)]"
      >
        <span className="text-xs font-medium text-muted">
          Compare{" "}
          <span className="num">
            {shapes.length}/{MAX_COMPARE}
          </span>
        </span>
        {shapes.map((s, i) => (
          <span
            key={s.label}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 py-0.5 pl-1 pr-0.5"
          >
            <CrossSection shape={s} mode="thumbnail" className="size-5" />
            <span className="font-mono text-[12.5px] text-ink">{displayLabel(s.label)}</span>
            <button
              type="button"
              aria-label={`Remove ${displayLabel(s.label)} from compare`}
              onClick={() => onRemove(slugs[i]!)}
              className="flex size-5 items-center justify-center rounded text-faint hover:bg-surface hover:text-ink"
            >
              <Icon name="x" className="size-3" />
            </button>
          </span>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onClear} className="text-xs text-muted hover:text-ink hover:underline">
            Clear
          </button>
          <Link
            to={`/compare?s=${slugs.join(",")}`}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-accent px-3 text-sm font-medium text-accent-ink transition hover:brightness-110"
          >
            Compare side by side <Icon name="right" className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
