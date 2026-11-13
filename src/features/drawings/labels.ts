import { toDisplay, toFraction, type UnitSystem } from "@/lib/units";
import type { DimSpec } from "./geometry";

const decimalIn = (v: number) => String(Number(v.toPrecision(4)));

function mm(v: number): string {
  const x = toDisplay(v, "length", "SI");
  return x >= 100 ? String(Math.round(x)) : x.toFixed(1);
}

/**
 * Dimension value in the active unit system, split so long labels can stack on two lines.
 * US: tabulated decimal plus the detailing fraction when it differs, e.g. "17.9" + "(17-7/8)";
 * SI: millimetres.
 */
export function dimValue(d: DimSpec, units: UnitSystem): { main: string; paren?: string } {
  if (units === "SI") return { main: mm(d.value) };
  const main = decimalIn(d.value);
  if (d.det === undefined) return { main };
  const frac = d.detDecimal ? decimalIn(d.det) : toFraction(d.det);
  if (frac === main && !d.detNote) return { main };
  return { main, paren: `(${frac}${d.detNote ? ` ${d.detNote}` : ""})` };
}

export const unitsNote = (units: UnitSystem) =>
  units === "SI" ? "Dimensions in mm" : "Dimensions in in.; detailing values in parentheses";
