import clsx from "clsx";
import { useState } from "react";
import { Sym } from "@/components/Sym";
import { PROPERTIES, PROPERTY_GROUPS, type PropertyGroup, type PropertyMeta } from "@/data/properties";
import { num, type Shape } from "@/data/shapes";
import { toFraction, unitLabel, type UnitSystem } from "@/lib/units";
import { fmtExact, plainSymbol, plainValue } from "./logic";
import { CopyButton } from "./shared";

const FRACTION_GROUPS = new Set<PropertyGroup>(["Detailing", "Workable gage"]);

export function groupedProperties(s: Shape): { group: PropertyGroup; items: { p: PropertyMeta; v: number }[] }[] {
  return PROPERTY_GROUPS.map((group) => ({
    group,
    items: PROPERTIES.filter((p) => p.group === group).flatMap((p) => {
      const v = num(s, p.key);
      return v === undefined ? [] : [{ p, v }];
    }),
  })).filter((g) => g.items.length > 0);
}

function PropertyRow({ p, v, units }: { p: PropertyMeta; v: number; units: UnitSystem }) {
  const [open, setOpen] = useState(false);
  const u = unitLabel(p.quantity, units);
  const shown = fmtExact(v, p.quantity, units);
  const frac =
    units === "US" &&
    p.quantity === "length" &&
    FRACTION_GROUPS.has(p.group) &&
    Math.abs(v * 16 - Math.round(v * 16)) < 1e-6
      ? toFraction(v)
      : undefined;
  return (
    <>
      <tr className="group border-t border-line first:border-t-0" title={plainSymbol(p.description)}>
        <th scope="row" className="w-[4.5rem] py-1.5 pl-3 pr-2 text-left align-baseline font-normal">
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${p.name}: ${open ? "hide" : "show"} description`}
            onClick={() => setOpen((o) => !o)}
            className="rounded text-[13px] font-medium text-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Sym s={p.symbol} />
          </button>
        </th>
        <td className="py-1.5 pr-2 align-baseline text-[12.5px] text-muted">
          <button type="button" tabIndex={-1} onClick={() => setOpen((o) => !o)} className="text-left hover:text-ink">
            {p.name}
          </button>
        </td>
        <td className="num whitespace-nowrap py-1.5 text-right align-baseline text-[13px] font-medium text-ink">
          <CopyButton text={plainValue(v, p.quantity, units)} label={`${p.key} value`}>
            {shown}
          </CopyButton>
          {frac && frac !== shown && <span className="ml-1.5 text-[11px] font-normal text-faint">{frac}</span>}
        </td>
        <td className="w-16 py-1.5 pl-1.5 pr-3 align-baseline text-[11px] text-faint">{u}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} className="px-3 pb-2 pt-0 text-xs leading-relaxed text-muted">
            <Sym s={p.description} />
          </td>
        </tr>
      )}
    </>
  );
}

export function PropertyGroupTable({
  group,
  items,
  units,
  className,
}: {
  group: string;
  items: { p: PropertyMeta; v: number }[];
  units: UnitSystem;
  className?: string;
}) {
  return (
    <section className={clsx("overflow-hidden rounded-xl border border-line bg-surface", className)} aria-label={group}>
      <h3 className="border-b border-line bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {group}
      </h3>
      <table className="w-full border-collapse">
        <tbody>
          {items.map(({ p, v }) => (
            <PropertyRow key={p.key} p={p} v={v} units={units} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
