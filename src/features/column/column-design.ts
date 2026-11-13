/**
 * Column selection logic — AISC 360-22 Chapter E, mirroring Manual Part 4 (Tables 4-1 to 4-12).
 * Pure functions, engine units (kip, in., ksi). No React.
 */
import { applyCombination, combinationsFor, type Combination, type LoadSet } from "@/analysis/load-combinations";
import { available, compressionStrength, UnsupportedError, type CompressionInput, type CompressionResult, type DesignMethod } from "@/aisc";
import { E, preferredMaterial, type Material } from "@/data/materials";
import { familyOf, num, SHAPES, type Shape, type ShapeFamily } from "@/data/shapes";

export type ColumnFamilyId = "W" | "HP" | "HSS-rect" | "HSS-square" | "HSS-round" | "PIPE" | "WT" | "2L" | "L";

export interface ColumnFamily {
  id: ColumnFamilyId;
  label: string;
  /** Manual Part 4 table this family corresponds to */
  table: string;
  family: ShapeFamily;
  match: (s: Shape) => boolean;
}

const isSquare = (s: Shape) => familyOf(s) === "hss-rect" && num(s, "Ht") === num(s, "B");

export const COLUMN_FAMILIES: readonly ColumnFamily[] = [
  { id: "W", label: "W-shapes", table: "Manual Table 4-1a", family: "i-shape", match: (s) => s.type === "W" },
  { id: "HP", label: "HP-shapes", table: "Manual Table 4-2", family: "i-shape", match: (s) => s.type === "HP" },
  { id: "HSS-rect", label: "Rectangular HSS", table: "Manual Table 4-3", family: "hss-rect", match: (s) => familyOf(s) === "hss-rect" && !isSquare(s) },
  { id: "HSS-square", label: "Square HSS", table: "Manual Table 4-4", family: "hss-rect", match: isSquare },
  { id: "HSS-round", label: "Round HSS", table: "Manual Table 4-5", family: "hss-round", match: (s) => familyOf(s) === "hss-round" },
  { id: "PIPE", label: "Pipe", table: "Manual Table 4-6", family: "pipe", match: (s) => s.type === "PIPE" },
  { id: "WT", label: "WT-shapes", table: "Manual Table 4-7", family: "tee", match: (s) => s.type === "WT" },
  { id: "2L", label: "Double angles", table: "Manual Table 4-9", family: "double-angle", match: (s) => s.type === "2L" },
  { id: "L", label: "Single angles", table: "Manual Table 4-11", family: "angle", match: (s) => s.type === "L" },
];

export const columnFamilyById = (id: string | null | undefined): ColumnFamily | undefined => COLUMN_FAMILIES.find((f) => f.id === id);

export function columnFamilyOf(s: Shape): ColumnFamily | undefined {
  return COLUMN_FAMILIES.find((f) => f.match(s));
}

export function defaultMaterial(f: ColumnFamily): Material {
  const sample = SHAPES.find(f.match);
  return sample ? preferredMaterial(sample.type, f.family) : preferredMaterial("W", "i-shape");
}

/**
 * Nominal depth group used for the depth filter and "lightest per depth" highlighting:
 * "W14X90" → "W14", "HSS8X8X1/2" → "HSS8", "HSS6.625X0.250" → "HSS6.625", "Pipe6XS" → "Pipe6",
 * "2L4X4X1/2X3/8" → "2L4", "L4X4X1/2" → "L4".
 */
export function nominalGroup(s: Shape): string {
  if (s.type === "PIPE") return /^Pipe[\d\-/]+/.exec(s.label)?.[0] ?? s.label;
  const i = s.label.indexOf("X");
  return i > 0 ? s.label.slice(0, i) : s.label;
}

/** Numeric sort key for nominal groups (descending depth). */
export function groupDepth(group: string): number {
  const m = /(\d+(?:\.\d+)?)(?:-(\d+)\/(\d+))?$/.exec(group.replace(/^(2L|HSS|Pipe|HP|WT|W|L)/, ""));
  if (!m) return 0;
  return Number(m[1]) + (m[2] && m[3] ? Number(m[2]) / Number(m[3]) : 0);
}

export function nominalGroups(f: ColumnFamily): string[] {
  const set = new Set(SHAPES.filter(f.match).map(nominalGroup));
  return [...set].sort((a, b) => groupDepth(b) - groupDepth(a));
}

/** Least radius of gyration among the tabulated principal/geometric axes. */
export function leastR(s: Shape): number {
  const rs = [num(s, "rx"), num(s, "ry"), num(s, "rz")].filter((r): r is number => r !== undefined && r > 0);
  return Math.min(...rs);
}

/** Slenderness limit separating inelastic (Eq. E3-2) and elastic (Eq. E3-3) buckling: 4.71√(E/Fy). */
export const transitionSlenderness = (Fy: number) => 4.71 * Math.sqrt(E / Fy);

/** Governing compression combination (largest compression, compression positive). ASCE/SEI 7-22 §2.3.1 / §2.4.1. */
export function governingAxial(loads: LoadSet, method: DesignMethod): { combo: Combination; value: number; all: { combo: Combination; value: number }[] } {
  const all = combinationsFor(method).map((combo) => ({ combo, value: applyCombination(loads, combo) }));
  const best = all.reduce((a, b) => (b.value > a.value ? b : a));
  return { ...best, all };
}

export interface ColumnLengths extends CompressionInput {
  /** Effective lengths, in. */
  Lcx: number;
  Lcy: number;
  Lcz: number;
}

export type Axis = "x" | "y" | "z";

export interface ColumnCandidate {
  shape: Shape;
  result: CompressionResult;
  /** Available strength, φcPn or Pn/Ωc, kips */
  available: number;
  ratio: number;
  pass: boolean;
  /** Axis with the largest flexural slenderness Lc/r */
  axis: "x" | "y";
  slx: number;
  sly: number;
  group: string;
}

export interface ColumnSearch {
  candidates: ColumnCandidate[];
  /** Shapes the engine could not evaluate */
  unsupported: { shape: Shape; message: string }[];
}

/** Try the engine; UnsupportedError (and missing-property errors) are reported instead of thrown. */
export function tryCompression(shape: Shape, mat: Material, L: ColumnLengths): { ok: true; result: CompressionResult } | { ok: false; message: string } {
  try {
    const result = compressionStrength(shape, mat, L);
    if (!Number.isFinite(result.nominal)) return { ok: false, message: "Engine returned a non-finite strength" };
    return { ok: true, result };
  } catch (e) {
    if (e instanceof UnsupportedError || e instanceof Error) return { ok: false, message: e.message };
    throw e;
  }
}

export function evaluateColumn(shape: Shape, mat: Material, L: ColumnLengths, Pr: number, method: DesignMethod): ColumnCandidate | { shape: Shape; message: string } {
  const r = tryCompression(shape, mat, L);
  if (!r.ok) return { shape, message: r.message };
  const avail = available(r.result, method);
  const rx = shape.type === "L" ? Math.sqrt((num(shape, "Iw") ?? Infinity) / (num(shape, "A") ?? 1)) : num(shape, "rx") ?? Infinity;
  const ry = (shape.type === "L" ? num(shape, "rz") : num(shape, "ry")) ?? Infinity;
  const slx = L.Lcx / rx, sly = L.Lcy / ry;
  const ratio = avail > 0 ? Math.max(0, Pr) / avail : Infinity;
  return { shape, result: r.result, available: avail, ratio, pass: ratio <= 1 + 1e-9, axis: r.result.governing === "FB-x" ? "x" : r.result.governing === "FB-y" ? "y" : slx > sly ? "x" : "y", slx, sly, group: nominalGroup(shape) };
}

/** Evaluate every shape in the family; candidates are sorted lightest-first (ties → higher capacity). */
export function searchColumns(opts: { family: ColumnFamily; material: Material; lengths: ColumnLengths; Pr: number; method: DesignMethod; groups?: string[] }): ColumnSearch {
  const { family, material, lengths, Pr, method, groups } = opts;
  const pool = SHAPES.filter((s) => family.match(s) && (!groups?.length || groups.includes(nominalGroup(s))));
  const candidates: ColumnCandidate[] = [];
  const unsupported: { shape: Shape; message: string }[] = [];
  for (const s of pool) {
    const r = evaluateColumn(s, material, lengths, Pr, method);
    if ("result" in r) candidates.push(r);
    else unsupported.push(r);
  }
  candidates.sort((a, b) => (a.shape.W as number) - (b.shape.W as number) || b.available - a.available);
  return { candidates, unsupported };
}

/** Label of the lightest passing shape in each nominal group (input assumed sorted lightest-first). */
export function lightestPerGroup(cands: ColumnCandidate[]): Set<string> {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const c of cands) {
    if (!c.pass || seen.has(c.group)) continue;
    seen.add(c.group);
    out.add(c.shape.label);
  }
  return out;
}

/** Tabulated lengths, in. — US: 0, 6–30 ft by 1 ft, 32–40 ft by 2 ft (Manual Table 4-1a style); SI: 0, 1.5–12 m by 0.5 m. */
export function tableLengths(units: "US" | "SI"): number[] {
  if (units === "SI") {
    const m = [0];
    for (let v = 1.5; v <= 12 + 1e-9; v += 0.5) m.push(Number(v.toFixed(2)));
    return m.map((x) => (x * 1000) / 25.4);
  }
  const ft = [0];
  for (let v = 6; v <= 30; v++) ft.push(v);
  for (let v = 32; v <= 40; v += 2) ft.push(v);
  return ft.map((x) => x * 12);
}

export interface StrengthTableRow {
  /** Effective length Lc applied about every axis, in. */
  Lc: number;
  Pn: number;
  phiPn: number;
  PnOmega: number;
  /** Governing Lc/r from the engine */
  slenderness: number;
  governing: string;
  /** Lc/r > 200 (§E2 user note) */
  over200: boolean;
}

/**
 * Available strength in axial compression vs. effective length, taken equal about all axes
 * (Lcx = Lcy = Lcz = Lc) — the basis of the Manual Part 4 column tables, which tabulate
 * against the least radius of gyration.
 */
export function strengthTable(shape: Shape, mat: Material, lengths: number[], options: Partial<CompressionInput> = {}): StrengthTableRow[] {
  const rows: StrengthTableRow[] = [];
  for (const Lc of lengths) {
    const r = tryCompression(shape, mat, { ...options, Lcx: Lc, Lcy: Lc, Lcz: Lc });
    if (!r.ok) continue;
    rows.push({
      Lc, Pn: r.result.nominal, phiPn: available(r.result, "LRFD"), PnOmega: available(r.result, "ASD"),
      slenderness: r.result.slenderness, governing: r.result.governing, over200: r.result.slenderness > 200 + 1e-9,
    });
  }
  return rows;
}

/** Available-strength curve for charting (engine units). */
export function strengthCurve(shape: Shape, mat: Material, method: DesignMethod, maxLc: number, n = 120, options: Partial<CompressionInput> = {}): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const Lc = (maxLc * i) / n;
    const r = tryCompression(shape, mat, { ...options, Lcx: Lc, Lcy: Lc, Lcz: Lc });
    if (r.ok) pts.push({ x: Lc, y: available(r.result, method) });
  }
  return pts;
}

/**
 * Equivalent effective length on the "equal-axes" curve: the Manual's rule of entering
 * the column tables with max(Lcy, Lcx/(rx/ry)) generalized to max over axes of Lci·(rleast/ri).
 */
export function equivalentLc(shape: Shape, L: ColumnLengths): number {
  const rl = leastR(shape);
  const rx = shape.type === "L" ? Math.sqrt((num(shape, "Iw") ?? 0) / (num(shape, "A") ?? 1)) : num(shape, "rx");
  const ry = shape.type === "L" ? num(shape, "rz") : num(shape, "ry");
  const ex = rx ? (L.Lcx * rl) / rx : 0;
  const ey = ry ? (L.Lcy * rl) / ry : 0;
  return Math.max(ex, ey);
}
