/**
 * Unit handling. ALL engine math is in kip, in., ksi (and lb/ft for weight).
 * Convert only at the UI boundary with `toDisplay` / `fromDisplay`.
 */
export type UnitSystem = "US" | "SI";

export type Quantity =
  | "length" // in. | mm
  | "span" // ft | m     (stored in in.)
  | "area" // in.² | mm²
  | "modulus" // in.³ | 10³ mm³
  | "inertia" // in.⁴ | 10⁶ mm⁴
  | "torsion" // in.⁴ | 10³ mm⁴    (J — AISC lists metric J in 10³ mm⁴)
  | "warping" // in.⁶ | 10⁹ mm⁶
  | "hssTorsion" // in.³ | 10³ mm³  (C)
  | "weight" // lb/ft | kg/m
  | "force" // kip | kN
  | "moment" // kip-ft | kN·m    (stored in kip-in.)
  | "stress" // ksi | MPa
  | "lineLoad" // kip/ft | kN/m   (stored in kip/in.)
  | "areaLoad" // psf | kPa      (stored in ksi)
  | "ratio"; // unitless

interface UnitDef { label: string; factor: number } // display = stored * factor

const IN_TO_MM = 25.4;
const KIP_TO_KN = 4.4482216152605;

const UNITS: Record<Quantity, Record<UnitSystem, UnitDef>> = {
  length: { US: { label: "in.", factor: 1 }, SI: { label: "mm", factor: IN_TO_MM } },
  span: { US: { label: "ft", factor: 1 / 12 }, SI: { label: "m", factor: IN_TO_MM / 1000 } },
  area: { US: { label: "in.²", factor: 1 }, SI: { label: "mm²", factor: IN_TO_MM ** 2 } },
  modulus: { US: { label: "in.³", factor: 1 }, SI: { label: "10³ mm³", factor: IN_TO_MM ** 3 / 1e3 } },
  inertia: { US: { label: "in.⁴", factor: 1 }, SI: { label: "10⁶ mm⁴", factor: IN_TO_MM ** 4 / 1e6 } },
  torsion: { US: { label: "in.⁴", factor: 1 }, SI: { label: "10³ mm⁴", factor: IN_TO_MM ** 4 / 1e3 } },
  warping: { US: { label: "in.⁶", factor: 1 }, SI: { label: "10⁹ mm⁶", factor: IN_TO_MM ** 6 / 1e9 } },
  hssTorsion: { US: { label: "in.³", factor: 1 }, SI: { label: "10³ mm³", factor: IN_TO_MM ** 3 / 1e3 } },
  weight: { US: { label: "lb/ft", factor: 1 }, SI: { label: "kg/m", factor: 1.48816394 } },
  force: { US: { label: "kips", factor: 1 }, SI: { label: "kN", factor: KIP_TO_KN } },
  moment: { US: { label: "kip-ft", factor: 1 / 12 }, SI: { label: "kN·m", factor: (KIP_TO_KN * IN_TO_MM) / 1000 } },
  stress: { US: { label: "ksi", factor: 1 }, SI: { label: "MPa", factor: 6.894757293 } },
  lineLoad: { US: { label: "kip/ft", factor: 12 }, SI: { label: "kN/m", factor: KIP_TO_KN / (IN_TO_MM / 1000) } },
  areaLoad: { US: { label: "psf", factor: 144_000 }, SI: { label: "kPa", factor: 6894.757293 } },
  ratio: { US: { label: "", factor: 1 }, SI: { label: "", factor: 1 } },
};

export const unitLabel = (q: Quantity, sys: UnitSystem) => UNITS[q][sys].label;
export const toDisplay = (v: number, q: Quantity, sys: UnitSystem) => v * UNITS[q][sys].factor;
export const fromDisplay = (v: number, q: Quantity, sys: UnitSystem) => v / UNITS[q][sys].factor;

/** Engineering-friendly number formatting: 3 significant figures by default, thousands separators. */
export function fmt(v: number | undefined, sig = 3): string {
  if (v === undefined || !Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 10 ** sig) return Math.round(v).toLocaleString("en-US");
  const digits = Math.max(0, sig - 1 - Math.floor(Math.log10(abs)));
  return v.toLocaleString("en-US", { maximumFractionDigits: Math.min(digits, 6), minimumFractionDigits: 0 });
}

/** Format a stored value in the active unit system, e.g. fmtQ(4560, "moment", "US") -> "380 kip-ft" */
export function fmtQ(v: number | undefined, q: Quantity, sys: UnitSystem, sig = 3): string {
  if (v === undefined) return "—";
  const label = unitLabel(q, sys);
  return label ? `${fmt(toDisplay(v, q, sys), sig)} ${label}` : fmt(v, sig);
}

/** Decimal inches -> nearest fraction string like 1-3/16 (for detailing dimensions). */
export function toFraction(v: number, denom = 16): string {
  const sign = v < 0 ? "−" : "";
  let whole = Math.floor(Math.abs(v));
  let n = Math.round((Math.abs(v) - whole) * denom);
  let d = denom;
  if (n === d) { whole += 1; n = 0; }
  while (n > 0 && n % 2 === 0) { n /= 2; d /= 2; }
  if (n === 0) return `${sign}${whole}`;
  return whole ? `${sign}${whole}-${n}/${d}` : `${sign}${n}/${d}`;
}
