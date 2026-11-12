import raw from "./aisc-shapes-v16.json";

/** AISC Shapes Database v16.0 record (US customary: in., lb/ft). Absent keys = not applicable. */
export interface Shape {
  type: ShapeType;
  /** EDI standard nomenclature, e.g. "W44X408" */
  edi: string;
  /** AISC Manual label, e.g. "W44X408", "HSS6X6X1/2", "2L4X4X1/2X3/8LLBB" */
  label: string;
  metricLabel?: string;
  /** Special note flag (W/WT: tf > 2 in.; M/MT: sloped flanges) */
  note?: boolean;
  [prop: string]: number | string | boolean | undefined;
}

export type ShapeType =
  | "W" | "M" | "S" | "HP" | "C" | "MC" | "L" | "WT" | "MT" | "ST" | "2L" | "HSS" | "PIPE";

/** Geometric family — what the design engine and drawings dispatch on. */
export type ShapeFamily =
  | "i-shape" // W, M, S, HP — doubly symmetric I
  | "channel" // C, MC
  | "angle" // L
  | "tee" // WT, MT, ST
  | "double-angle" // 2L
  | "hss-rect" // rectangular & square HSS
  | "hss-round" // round HSS
  | "pipe"; // Pipe

export const SHAPES: readonly Shape[] = raw as Shape[];

export function familyOf(s: { type: ShapeType; OD?: unknown }): ShapeFamily {
  switch (s.type) {
    case "W": case "M": case "S": case "HP": return "i-shape";
    case "C": case "MC": return "channel";
    case "L": return "angle";
    case "WT": case "MT": case "ST": return "tee";
    case "2L": return "double-angle";
    case "PIPE": return "pipe";
    case "HSS": return s.OD !== undefined ? "hss-round" : "hss-rect";
  }
}

/** Numeric property accessor; undefined when the property does not apply to the shape. */
export function num(s: Shape, key: string): number | undefined {
  const v = s[key];
  return typeof v === "number" ? v : undefined;
}

/** Numeric property accessor that throws if missing — for engine code that requires it. */
export function req(s: Shape, key: string): number {
  const v = s[key];
  if (typeof v !== "number") throw new Error(`${s.label}: property "${key}" is not defined for this shape`);
  return v;
}

/** URL-safe, reversible slug: "HSS6X6X1/2" -> "HSS6X6X1_2" */
export const slugOf = (label: string) => label.replace(/\//g, "_");
export const labelFromSlug = (slug: string) => slug.replace(/_/g, "/");

/** Typeset label as printed in the Manual: "W44X408" -> "W44×408" */
export function displayLabel(label: string): string {
  return label.replace(/X/g, "×");
}

const byLabel = new Map(SHAPES.map((s) => [s.label.toUpperCase(), s]));
const byEdi = new Map(SHAPES.map((s) => [s.edi.toUpperCase(), s]));

/** Look up by Manual label, EDI name, or slug (case-insensitive; accepts "×"). */
export function findShape(name: string): Shape | undefined {
  const key = labelFromSlug(name).replace(/×/g, "X").replace(/\s+/g, "").toUpperCase();
  return byLabel.get(key) ?? byEdi.get(key);
}

/** For 2L: parse spacing and leg configuration from the label. */
export function doubleAngleInfo(s: Shape): { spacing: number; config: "equal" | "LLBB" | "SLBB" } | undefined {
  if (s.type !== "2L") return undefined;
  const m = /^2L[\d.\-/]+X[\d.\-/]+X[\d.\-/]+(?:X([\d.\-/]+))?(LLBB|SLBB)?$/.exec(s.label);
  const config = (m?.[2] as "LLBB" | "SLBB" | undefined) ?? "equal";
  return { spacing: m?.[1] ? parseFraction(m[1]) : 0, config };
}

/** "1-3/8" -> 1.375, "3/4" -> 0.75, "6" -> 6 */
export function parseFraction(s: string): number {
  const [whole, frac] = s.includes("-") ? s.split("-") : s.includes("/") ? ["0", s] : [s, undefined];
  let v = Number(whole);
  if (frac) {
    const [n, d] = frac.split("/").map(Number);
    v += (n ?? 0) / (d ?? 1);
  }
  return v;
}

export const SHAPE_TYPES: { type: ShapeType; name: string; family: ShapeFamily | "hss" }[] = [
  { type: "W", name: "W-shapes", family: "i-shape" },
  { type: "M", name: "M-shapes", family: "i-shape" },
  { type: "S", name: "S-shapes", family: "i-shape" },
  { type: "HP", name: "HP-shapes", family: "i-shape" },
  { type: "C", name: "C-shapes (channels)", family: "channel" },
  { type: "MC", name: "MC-shapes (misc. channels)", family: "channel" },
  { type: "L", name: "Angles", family: "angle" },
  { type: "WT", name: "WT-shapes", family: "tee" },
  { type: "MT", name: "MT-shapes", family: "tee" },
  { type: "ST", name: "ST-shapes", family: "tee" },
  { type: "2L", name: "Double angles", family: "double-angle" },
  { type: "HSS", name: "HSS (rect., square & round)", family: "hss" },
  { type: "PIPE", name: "Pipe", family: "pipe" },
];

/** Manual Part 1 table numbers for each family. */
export const MANUAL_TABLE: Record<ShapeType, string> = {
  W: "Table 1-1", M: "Table 1-2", S: "Table 1-3", HP: "Table 1-4", C: "Table 1-5", MC: "Table 1-6",
  L: "Table 1-7", WT: "Table 1-8", MT: "Table 1-9", ST: "Table 1-10", "2L": "Table 1-15",
  HSS: "Tables 1-11 to 1-13", PIPE: "Table 1-14",
};
