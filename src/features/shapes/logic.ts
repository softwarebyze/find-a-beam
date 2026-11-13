/**
 * Pure logic for the shape explorer, detail and compare pages: type categories, search,
 * range filters, sorting, nominal-depth series, Manual-style emphasis, URL state and CSV.
 * No React here — everything is unit-tested in __tests__/logic.test.ts.
 *
 * All numeric values (filters included) are in ENGINE units (in., lb/ft …). The URL stores
 * engine units too, so a shared link means the same thing in US and SI.
 */
import { familyOf, findShape, num, SHAPES, slugOf, type Shape, type ShapeType } from "@/data/shapes";
import { PROPERTIES, PROPERTY, type PropertyMeta } from "@/data/properties";
import { fmt, toDisplay, unitLabel, type Quantity, type UnitSystem } from "@/lib/units";

/* ------------------------------------------------------------------ categories */

/** Explorer type categories. HSS splits into rect / square / round to mirror Tables 1-11 … 1-13. */
export type ExplorerType = Exclude<ShapeType, "HSS"> | "HSS" | "HSSR" | "HSSQ" | "HSSO" | "ALL";

export interface ExplorerTypeInfo {
  id: ExplorerType;
  /** Short label for the selector */
  short: string;
  name: string;
  table?: string;
}

export const EXPLORER_TYPES: ExplorerTypeInfo[] = [
  { id: "ALL", short: "All", name: "All shapes" },
  { id: "W", short: "W", name: "W-shapes", table: "Table 1-1" },
  { id: "M", short: "M", name: "M-shapes", table: "Table 1-2" },
  { id: "S", short: "S", name: "S-shapes", table: "Table 1-3" },
  { id: "HP", short: "HP", name: "HP-shapes", table: "Table 1-4" },
  { id: "C", short: "C", name: "C-shapes", table: "Table 1-5" },
  { id: "MC", short: "MC", name: "MC-shapes", table: "Table 1-6" },
  { id: "L", short: "L", name: "Angles", table: "Table 1-7" },
  { id: "WT", short: "WT", name: "WT-shapes", table: "Table 1-8" },
  { id: "MT", short: "MT", name: "MT-shapes", table: "Table 1-9" },
  { id: "ST", short: "ST", name: "ST-shapes", table: "Table 1-10" },
  { id: "HSS", short: "HSS", name: "HSS (all)", table: "Tables 1-11 to 1-13" },
  { id: "HSSR", short: "HSS rect.", name: "Rectangular HSS", table: "Table 1-11" },
  { id: "HSSQ", short: "HSS sq.", name: "Square HSS", table: "Table 1-12" },
  { id: "HSSO", short: "HSS round", name: "Round HSS", table: "Table 1-13" },
  { id: "PIPE", short: "Pipe", name: "Pipe", table: "Table 1-14" },
  { id: "2L", short: "2L", name: "Double angles", table: "Table 1-15" },
];

const TYPE_IDS = new Set<string>(EXPLORER_TYPES.map((t) => t.id));

export function parseExplorerType(v: string | null | undefined): ExplorerType {
  const u = (v ?? "").trim().toUpperCase();
  if (u === "" ) return "ALL";
  if (TYPE_IDS.has(u)) return u as ExplorerType;
  // Friendly aliases for deep links
  const alias: Record<string, ExplorerType> = {
    "HSS-RECT": "HSSR", HSSRECT: "HSSR", "HSS-SQUARE": "HSSQ", HSSSQUARE: "HSSQ", HSSSQ: "HSSQ",
    "HSS-ROUND": "HSSO", HSSROUND: "HSSO", ROUND: "HSSO", PIPES: "PIPE", ANGLE: "L", ANGLES: "L", DL: "2L",
  };
  return alias[u] ?? "ALL";
}

/** Precise explorer category of a single shape (never "HSS" / "ALL"). */
export function categoryOf(s: Shape): Exclude<ExplorerType, "HSS" | "ALL"> {
  if (s.type !== "HSS") return s.type;
  if (familyOf(s) === "hss-round") return "HSSO";
  return num(s, "Ht") === num(s, "B") ? "HSSQ" : "HSSR";
}

/** Manual Part 1 table for one shape, e.g. "Table 1-12" for square HSS. */
export function manualTableOf(s: Shape): string {
  return typeInfo(categoryOf(s)).table ?? "";
}

export function matchesType(s: Shape, t: ExplorerType): boolean {
  if (t === "ALL") return true;
  if (t === "HSS") return s.type === "HSS";
  return categoryOf(s) === t;
}

export function typeInfo(t: ExplorerType): ExplorerTypeInfo {
  return EXPLORER_TYPES.find((x) => x.id === t) ?? EXPLORER_TYPES[0]!;
}

/* ------------------------------------------------------------------ column presets */

/** Column presets mirroring the Manual Part 1 table for each type (W is always first). */
export const PRESETS: Record<ExplorerType, string[]> = {
  ALL: ["W", "A", "d", "bf", "tw", "tf", "Ix", "Zx", "Sx", "rx", "Iy", "Zy", "Sy", "ry", "J"],
  W: ["W", "A", "d", "bf", "tw", "tf", "bf/2tf", "h/tw", "Ix", "Zx", "Sx", "rx", "Iy", "Zy", "Sy", "ry", "J", "Cw", "rts", "ho"],
  M: ["W", "A", "d", "bf", "tw", "tf", "bf/2tf", "h/tw", "Ix", "Zx", "Sx", "rx", "Iy", "Zy", "Sy", "ry", "J", "Cw", "rts", "ho"],
  S: ["W", "A", "d", "bf", "tw", "tf", "bf/2tf", "h/tw", "Ix", "Zx", "Sx", "rx", "Iy", "Zy", "Sy", "ry", "J", "Cw", "rts", "ho"],
  HP: ["W", "A", "d", "bf", "tw", "tf", "bf/2tf", "h/tw", "Ix", "Zx", "Sx", "rx", "Iy", "Zy", "Sy", "ry", "J", "Cw", "rts", "ho"],
  C: ["W", "A", "d", "bf", "tw", "tf", "b/t", "h/tw", "Ix", "Zx", "Sx", "rx", "Iy", "Zy", "Sy", "ry", "x", "xp", "eo", "J", "Cw", "rts", "ho", "ro", "H"],
  MC: ["W", "A", "d", "bf", "tw", "tf", "b/t", "h/tw", "Ix", "Zx", "Sx", "rx", "Iy", "Zy", "Sy", "ry", "x", "xp", "eo", "J", "Cw", "rts", "ho", "ro", "H"],
  L: ["W", "A", "d", "b", "t", "kdes", "b/t", "x", "y", "Ix", "Zx", "Sx", "rx", "Iy", "Zy", "Sy", "ry", "Iz", "Sz", "rz", "tan(α)", "J", "Cw", "ro", "H"],
  WT: ["W", "A", "d", "bf", "tw", "tf", "bf/2tf", "D/t", "Ix", "Zx", "Sx", "rx", "y", "yp", "Iy", "Zy", "Sy", "ry", "J", "Cw", "ro", "H"],
  MT: ["W", "A", "d", "bf", "tw", "tf", "bf/2tf", "D/t", "Ix", "Zx", "Sx", "rx", "y", "yp", "Iy", "Zy", "Sy", "ry", "J", "Cw", "ro", "H"],
  ST: ["W", "A", "d", "bf", "tw", "tf", "bf/2tf", "D/t", "Ix", "Zx", "Sx", "rx", "y", "yp", "Iy", "Zy", "Sy", "ry", "J", "Cw", "ro", "H"],
  "2L": ["W", "A", "d", "b", "t", "b/t", "y", "yp", "Ix", "Zx", "Sx", "rx", "Iy", "Zy", "Sy", "ry", "ro", "H"],
  HSS: ["W", "A", "Ht", "B", "OD", "tdes", "b/tdes", "h/tdes", "D/t", "Ix", "Zx", "Sx", "rx", "Iy", "Zy", "Sy", "ry", "J", "C"],
  HSSR: ["W", "A", "Ht", "B", "tdes", "b/tdes", "h/tdes", "Ix", "Zx", "Sx", "rx", "Iy", "Zy", "Sy", "ry", "J", "C"],
  HSSQ: ["W", "A", "Ht", "tdes", "b/tdes", "Ix", "Zx", "Sx", "rx", "J", "C"],
  HSSO: ["W", "A", "OD", "tdes", "D/t", "Ix", "Zx", "Sx", "rx", "J", "C"],
  PIPE: ["W", "A", "OD", "ID", "tnom", "tdes", "D/t", "Ix", "Zx", "Sx", "rx", "J"],
};

/** Properties (in PROPERTIES order) defined for at least one shape of the type. */
export function availableProps(shapes: readonly Shape[]): PropertyMeta[] {
  const present = new Set<string>();
  for (const s of shapes) for (const k in s) if (typeof s[k] === "number") present.add(k);
  return PROPERTIES.filter((p) => present.has(p.key));
}

/* ------------------------------------------------------------------ search */

/** Normalize user text the way labels are written: "w18×50 " -> "W18X50". */
export function normalizeQuery(q: string): string {
  return q.replace(/[×✕*]/g, "X").replace(/\s+/g, "").toUpperCase();
}

/** Comma-separated terms are OR-ed: "W18x, W21x" */
export function searchTerms(q: string): string[] {
  return q.split(/[,;]/).map(normalizeQuery).filter(Boolean);
}

const haystackCache = new WeakMap<Shape, string[]>();
function haystack(s: Shape): string[] {
  let h = haystackCache.get(s);
  if (!h) {
    h = [s.label.toUpperCase(), s.edi.toUpperCase()];
    if (s.metricLabel) h.push(s.metricLabel.toUpperCase());
    haystackCache.set(s, h);
  }
  return h;
}

export function matchesSearch(s: Shape, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const h = haystack(s);
  return terms.some((t) => h.some((x) => x.includes(t)));
}

/* ------------------------------------------------------------------ filters */

export interface RangeFilter {
  key: string;
  /** Engine units; undefined = open */
  min?: number;
  max?: number;
}

export function matchesFilters(s: Shape, filters: RangeFilter[]): boolean {
  for (const f of filters) {
    if (f.min === undefined && f.max === undefined) continue;
    const v = num(s, f.key);
    if (v === undefined) return false;
    // Tolerance so that a bound typed from a displayed (rounded) value still includes that shape
    if (f.min !== undefined && v < f.min - Math.abs(f.min) * 1e-9) return false;
    if (f.max !== undefined && v > f.max + Math.abs(f.max) * 1e-9) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ sort */

export interface SortSpec {
  /** Property key, or "label" for Manual order */
  key: string;
  dir: "asc" | "desc";
}

export const MANUAL_ORDER: SortSpec = { key: "label", dir: "asc" };

const manualIndex = new Map<Shape, number>(SHAPES.map((s, i) => [s, i]));
const indexOf = (s: Shape) => manualIndex.get(s) ?? Number.MAX_SAFE_INTEGER;

/** Stable sort; shapes lacking the property always sink to the bottom. Ties fall back to Manual order. */
export function sortShapes(shapes: readonly Shape[], sort: SortSpec): Shape[] {
  const out = shapes.slice();
  if (sort.key === "label") {
    out.sort((a, b) => indexOf(a) - indexOf(b));
    if (sort.dir === "desc") out.reverse();
    return out;
  }
  const sign = sort.dir === "asc" ? 1 : -1;
  out.sort((a, b) => {
    const va = num(a, sort.key), vb = num(b, sort.key);
    if (va === undefined && vb === undefined) return indexOf(a) - indexOf(b);
    if (va === undefined) return 1;
    if (vb === undefined) return -1;
    return va === vb ? indexOf(a) - indexOf(b) : (va - vb) * sign;
  });
  return out;
}

/* ------------------------------------------------------------------ series */

const SUFFIX_2L = /(LLBB|SLBB)$/;

/**
 * Nominal-depth series key — shapes that differ only by weight / wall / leg thickness:
 * W18X50 -> "W18", HSS6X6X1/2 -> "HSS6X6", HSS6.000X0.500 -> "HSS6.000", L4X4X1/2 -> "L4X4",
 * 2L4X4X1/2X3/8LLBB -> "2L4X4X3/8LLBB", Pipe12XS -> "Pipe12".
 */
export function seriesKey(s: Pick<Shape, "type" | "label"> & { OD?: unknown }): string {
  const label = s.label;
  switch (s.type) {
    case "PIPE":
      return label.replace(/(X*S|STD)$/, "");
    case "HSS": {
      const t = label.split("X");
      return s.OD !== undefined ? t[0]! : `${t[0]}X${t[1]}`;
    }
    case "L": {
      const t = label.split("X");
      return `${t[0]}X${t[1]}`;
    }
    case "2L": {
      const suffix = SUFFIX_2L.exec(label)?.[1] ?? "";
      const t = label.replace(SUFFIX_2L, "").split("X");
      return [t[0], t[1], ...t.slice(3)].join("X") + suffix;
    }
    default:
      return label.split("X")[0]!;
  }
}

let seriesIndex: Map<string, Shape[]> | undefined;
function seriesMap(): Map<string, Shape[]> {
  if (!seriesIndex) {
    seriesIndex = new Map();
    for (const s of SHAPES) {
      const k = `${s.type}|${seriesKey(s)}`;
      const arr = seriesIndex.get(k);
      if (arr) arr.push(s); else seriesIndex.set(k, [s]);
    }
    for (const arr of seriesIndex.values()) arr.sort((a, b) => (num(a, "W") ?? 0) - (num(b, "W") ?? 0) || indexOf(a) - indexOf(b));
  }
  return seriesIndex;
}

/** All shapes in the same series, lightest first. */
export function seriesOf(s: Shape): Shape[] {
  return seriesMap().get(`${s.type}|${seriesKey(s)}`) ?? [s];
}

/** Lighter / heavier neighbours within the series. */
export function neighbours(s: Shape): { lighter?: Shape; heavier?: Shape } {
  const list = seriesOf(s);
  const i = list.indexOf(s);
  return { lighter: i > 0 ? list[i - 1] : undefined, heavier: i >= 0 ? list[i + 1] : undefined };
}

/* ------------------------------------------------------------------ Manual emphasis */

/** Properties where "more is more capacity" — used for Manual Table 3-2 style emphasis. */
const CAPACITY_QUANTITIES = new Set(["area", "modulus", "inertia", "torsion", "warping", "hssTorsion"]);
export function isCapacityProp(key: string): boolean {
  const p = PROPERTY[key];
  if (!p) return false;
  return CAPACITY_QUANTITIES.has(p.quantity) || key === "rx" || key === "ry" || key === "rz" || key === "rts";
}

/**
 * Shapes to typeset in bold, as the Manual does:
 *  - sorted by weight: the lightest shape of each nominal-depth series in the current view;
 *  - sorted by a capacity property (Zx, Ix …): the lightest shape providing at least that value,
 *    i.e. no other shape in view with a larger value weighs less (Manual Table 3-2 convention).
 * Returns an empty set for other sorts.
 */
export function emphasized(shapes: readonly Shape[], sort: SortSpec): Set<Shape> {
  const out = new Set<Shape>();
  if (sort.key === "W") {
    const best = new Map<string, Shape>();
    for (const s of shapes) {
      const w = num(s, "W");
      if (w === undefined) continue;
      const k = `${s.type}|${seriesKey(s)}`;
      const cur = best.get(k);
      if (!cur || w < (num(cur, "W") ?? Infinity)) best.set(k, s);
    }
    for (const s of best.values()) out.add(s);
    return out;
  }
  if (!isCapacityProp(sort.key)) return out;
  const withVal = shapes.filter((s) => num(s, sort.key) !== undefined && num(s, "W") !== undefined);
  withVal.sort((a, b) => num(b, sort.key)! - num(a, sort.key)! || num(a, "W")! - num(b, "W")!);
  let lightest = Infinity;
  for (const s of withVal) {
    const w = num(s, "W")!;
    if (w < lightest) { out.add(s); lightest = w; }
  }
  return out;
}

/* ------------------------------------------------------------------ URL state */

export interface ExplorerState {
  type: ExplorerType;
  q: string;
  filters: RangeFilter[];
  sort: SortSpec;
  /** Explicit column list; undefined = preset for the type */
  cols?: string[];
  /** Compare tray, shape slugs (max 4) */
  cmp: string[];
}

export const MAX_COMPARE = 4;

const numOrUndef = (s: string | undefined) => {
  if (s === undefined || s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

/** `f=Zx:50:120` · `f=d::18` · `sort=-Zx` · `cols=W,A,d` · `cmp=W18X50,W21X44` */
export function parseExplorerState(p: URLSearchParams): ExplorerState {
  const type = parseExplorerType(p.get("type"));
  const filters: RangeFilter[] = [];
  for (const raw of p.getAll("f")) {
    const parts = raw.split(":");
    const key = parts[0] ?? "";
    if (!PROPERTY[key] || filters.some((f) => f.key === key)) continue;
    filters.push({ key, min: numOrUndef(parts[1]), max: numOrUndef(parts[2]) });
  }
  const rawSort = p.get("sort") ?? "";
  let sort = MANUAL_ORDER;
  if (rawSort) {
    const desc = rawSort.startsWith("-");
    const key = desc ? rawSort.slice(1) : rawSort;
    if (key === "label" || PROPERTY[key]) sort = { key, dir: desc ? "desc" : "asc" };
  }
  const colsRaw = p.get("cols");
  const cols = colsRaw ? colsRaw.split(",").filter((k) => PROPERTY[k]) : undefined;
  const cmp = parseCompareSlugs(p.get("cmp"), findShape).map((s) => slugOf(s.label));
  return { type, q: p.get("q") ?? "", filters, sort, cols: cols && cols.length ? cols : undefined, cmp };
}

const fmtBound = (v: number | undefined) => (v === undefined ? "" : String(Number(v.toPrecision(8))));

export function serializeExplorerState(s: ExplorerState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.type !== "ALL") p.set("type", s.type);
  if (s.q.trim()) p.set("q", s.q);
  for (const f of s.filters) p.append("f", `${f.key}:${fmtBound(f.min)}:${fmtBound(f.max)}`);
  if (s.sort.key !== "label" || s.sort.dir !== "asc") p.set("sort", `${s.sort.dir === "desc" ? "-" : ""}${s.sort.key}`);
  if (s.cols && !sameList(s.cols, PRESETS[s.type])) p.set("cols", s.cols.join(","));
  if (s.cmp.length) p.set("cmp", s.cmp.join(","));
  return p;
}

export function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Next sort when clicking a column header: asc -> desc -> Manual order. Weight starts ascending, capacities descending. */
export function nextSort(cur: SortSpec, key: string): SortSpec {
  const first: SortSpec["dir"] = key === "label" || key === "W" || !isCapacityProp(key) ? "asc" : "desc";
  if (cur.key !== key) return { key, dir: first };
  if (cur.dir === first) return { key, dir: first === "asc" ? "desc" : "asc" };
  return MANUAL_ORDER;
}

/** Full pipeline: type -> search -> filters -> sort. */
export function queryShapes(all: readonly Shape[], st: Pick<ExplorerState, "type" | "q" | "filters" | "sort">): Shape[] {
  const terms = searchTerms(st.q);
  const rows = all.filter((s) => matchesType(s, st.type) && matchesSearch(s, terms) && matchesFilters(s, st.filters));
  return sortShapes(rows, st.sort);
}

/* ------------------------------------------------------------------ compare */

/** `s=W18X50,W21X44` (slugs or labels; "×" accepted). Unknown / duplicate entries are dropped. */
export function parseCompareSlugs(raw: string | null, find: (name: string) => Shape | undefined): Shape[] {
  const out: Shape[] = [];
  for (const part of (raw ?? "").split(",")) {
    const t = part.trim();
    if (!t) continue;
    const s = find(t);
    if (s && !out.includes(s)) out.push(s);
    if (out.length === MAX_COMPARE) break;
  }
  return out;
}

/** Which properties are meaningfully "better" when higher / lower. Dimensions are neutral. */
export function preference(key: string): "higher" | "lower" | undefined {
  if (key === "W") return "lower";
  const p = PROPERTY[key];
  if (!p) return undefined;
  if (p.group === "Slenderness") return "lower";
  if (key === "A") return undefined;
  if (isCapacityProp(key)) return "higher";
  return undefined;
}

/** Indices of best and worst value; undefined when fewer than two values or all equal. */
export function bestWorst(values: (number | undefined)[], pref: "higher" | "lower" | undefined): { best?: number; worst?: number } {
  if (!pref) return {};
  const present = values.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => x[0] !== undefined);
  if (present.length < 2) return {};
  let hi = present[0]!, lo = present[0]!;
  for (const x of present) {
    if (x[0] > hi[0]) hi = x;
    if (x[0] < lo[0]) lo = x;
  }
  if (hi[0] === lo[0]) return {};
  return pref === "higher" ? { best: hi[1], worst: lo[1] } : { best: lo[1], worst: hi[1] };
}

/** Rough drawing extent (in.) for choosing a common compare scale. */
export function extentOf(s: Shape): { w: number; h: number } {
  const h = num(s, "d") ?? num(s, "Ht") ?? num(s, "OD") ?? 1;
  let w = num(s, "bf") ?? num(s, "B") ?? num(s, "OD") ?? num(s, "b") ?? h;
  if (s.type === "2L") w = 2 * (num(s, "b") ?? 0) + 1.5;
  return { w, h };
}

/* ------------------------------------------------------------------ CSV */

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV of the current view in the active unit system. Header row: `W (lb/ft)`, `Ix (in.^4)` … */
export function toCSV(shapes: readonly Shape[], cols: readonly string[], units: UnitSystem): string {
  const head = ["Shape", ...cols.map((k) => {
    const p = PROPERTY[k];
    const u = p ? unitLabel(p.quantity, units) : "";
    return u ? `${k} (${u})` : k;
  })];
  const lines = [head.map(csvCell).join(",")];
  for (const s of shapes) {
    const row = [s.label];
    for (const k of cols) {
      const v = num(s, k);
      const p = PROPERTY[k];
      row.push(v === undefined || !p ? "" : String(Number(toDisplay(v, p.quantity, units).toPrecision(6))));
    }
    lines.push(row.map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

/** Display string for a property value in the active units (no unit label). */
export function fmtProp(v: number | undefined, key: string, units: UnitSystem, sig = 3): string {
  const p = PROPERTY[key];
  if (v === undefined || !p) return "—";
  return fmt(toDisplay(v, p.quantity, units), sig);
}

/**
 * Value as tabulated: US values are printed exactly as stored in the database (which already
 * carries the Manual's precision); converted SI values are rounded to `sig` significant figures.
 */
export function fmtExact(v: number | undefined, quantity: Quantity, units: UnitSystem, sig = 4): string {
  if (v === undefined || !Number.isFinite(v)) return "—";
  if (units === "US" || quantity === "ratio") return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return fmt(toDisplay(v, quantity, units), sig);
}

/** Plain machine-readable number for the clipboard / CSV (no thousands separators). */
export function plainValue(v: number, quantity: Quantity, units: UnitSystem, sig = 6): string {
  if (units === "US" || quantity === "ratio") return String(v);
  return String(Number(toDisplay(v, quantity, units).toPrecision(sig)));
}

/** Symbol text without subscript braces, for plain-text contexts (titles, <option>): "e{o}" -> "eo". */
export const plainSymbol = (s: string) => s.replace(/\{([^}]*)\}/g, "$1");

/** Query string with `,` and `:` left readable (`?type=W&f=Zx:50:&cols=W,A,d`). */
export function toQueryString(p: URLSearchParams): string {
  const s = p.toString().replace(/%2C/gi, ",").replace(/%3A/gi, ":");
  return s ? `?${s}` : "";
}

/* ------------------------------------------------------------------ detail */

/** Special-note text for the database `note` flag. */
export function noteText(s: Shape): string | undefined {
  if (!s.note) return undefined;
  if (s.type === "M" || s.type === "MT") return "Shape has tapered (sloped) flanges.";
  if (s.type === "W" || s.type === "WT") return "Flange thickness greater than 2 in. Special requirements may apply per AISC 360 §A3.1c.";
  return "See Manual Part 1 table notes for this shape.";
}

/* ------------------------------------------------------------------ efficiency */

export interface EfficiencyMetric {
  id: string;
  /** Symbol in {sub} convention */
  symbol: string;
  name: string;
  num: string;
  den: string;
}

/** Section property per unit weight — the usual "how hard is each pound working" ratios. */
export const EFFICIENCY: EfficiencyMetric[] = [
  { id: "Zx/W", symbol: "Z{x}/W", name: "Plastic modulus per weight", num: "Zx", den: "W" },
  { id: "Sx/W", symbol: "S{x}/W", name: "Elastic modulus per weight", num: "Sx", den: "W" },
  { id: "Ix/W", symbol: "I{x}/W", name: "Moment of inertia per weight", num: "Ix", den: "W" },
  { id: "Zy/W", symbol: "Z{y}/W", name: "Minor-axis plastic modulus per weight", num: "Zy", den: "W" },
  { id: "ry/rx", symbol: "r{y}/r{x}", name: "Radius of gyration ratio", num: "ry", den: "rx" },
];

/** Efficiency value in DISPLAY units of the active system (e.g. in.³ per lb/ft). */
export function efficiency(s: Shape, m: EfficiencyMetric, units: UnitSystem): number | undefined {
  const n = num(s, m.num), d = num(s, m.den);
  const pn = PROPERTY[m.num], pd = PROPERTY[m.den];
  if (n === undefined || d === undefined || !d || !pn || !pd) return undefined;
  return toDisplay(n, pn.quantity, units) / toDisplay(d, pd.quantity, units);
}

export function efficiencyUnit(m: EfficiencyMetric, units: UnitSystem): string {
  const un = PROPERTY[m.num] ? unitLabel(PROPERTY[m.num]!.quantity, units) : "";
  const ud = PROPERTY[m.den] ? unitLabel(PROPERTY[m.den]!.quantity, units) : "";
  if (un === ud) return "";
  return `${un} per ${ud}`;
}

/** Common px-per-inch scale so every shape fits a `boxW` × `boxH` drawing box. */
export function commonScale(shapes: readonly Shape[], boxW: number, boxH: number): number {
  let w = 0, h = 0;
  for (const s of shapes) {
    const e = extentOf(s);
    w = Math.max(w, e.w);
    h = Math.max(h, e.h);
  }
  if (!w || !h) return 10;
  return Math.min(boxW / w, boxH / h);
}
