/**
 * Pure cross-section geometry: AISC Shapes Database v16.0 record → outline contours (in.),
 * dimension specs, centroidal axes and markers. No React, no units conversion.
 *
 * Drawing coordinates are SVG-style (x right, y down, in.) with the origin at the top-left
 * corner of the section's bounding box.
 */
import { doubleAngleInfo, familyOf, findShape, num, req, type Shape, type ShapeFamily } from "@/data/shapes";

export interface Pt { x: number; y: number }
const P = (x: number, y: number): Pt => ({ x, y });

/** Polygon whose vertices are rounded with the given radii (0 = sharp), or a circle. */
export type Contour =
  | { kind: "poly"; pts: Pt[]; radii: number[]; hole?: boolean }
  | { kind: "circle"; c: Pt; r: number; hole?: boolean };

export type Side = "top" | "bottom" | "left" | "right";

export interface DimSpec {
  id: string;
  /** Manual symbol, `{sub}` convention */
  sym: string;
  /** Tabulated design value, in. */
  value: number;
  /** Detailing (or nominal) value, shown as a fraction in US units */
  det?: number;
  detNote?: string;
  /** Show `det` as a decimal (pipe nominal walls are not sixteenths) */
  detDecimal?: boolean;
  /**
   * Points on the section. Side dims measure a→b along x ("h") or y ("v") with extension
   * lines from a and b; inline dims are drawn directly from a to b.
   */
  a: Pt;
  b: Pt;
  orient: "h" | "v" | "aligned";
  place: Side | "inline";
  /** Centroid / shear-center locating dims, shown only with axes */
  withAxes?: boolean;
}

/** 1 = overall size, 2 = thickness / spacing, 3 = detailing and locating dims. */
export function dimRank(d: DimSpec): 1 | 2 | 3 {
  if (["d", "bf", "b", "Ht", "B", "OD"].includes(d.id)) return 1;
  if (["tw", "tf", "t", "s"].includes(d.id)) return 2;
  return 3;
}

export interface AxisSpec {
  id: "x" | "y" | "z" | "w";
  origin: Pt;
  /** Unit direction toward the labelled end */
  dir: Pt;
  principal?: boolean;
}

export interface MarkerSpec { kind: "cg" | "sc"; at: Pt }

export interface Box { x0: number; y0: number; x1: number; y1: number }

export interface SectionGeometry {
  family: ShapeFamily;
  contours: Contour[];
  /** Outline bounding box (always starts at 0,0) */
  width: number;
  height: number;
  /** Outline ∪ markers (the shear center of a channel lies outside the steel) */
  extent: Box;
  centroid: Pt;
  dims: DimSpec[];
  axes: AxisSpec[];
  markers: MarkerSpec[];
}

/** 2 on 12 inner-flange slope of S, C, ST and sloped-flange M/MT shapes (Manual Part 1). */
export const FLANGE_SLOPE_STD = 2 / 12;
/** MC slope is not tabulated ("other than 16⅔%", Manual Part 1); assumed value. */
export const FLANGE_SLOPE_MC = 1 / 12;

// ---------------------------------------------------------------- vector helpers
const sub = (a: Pt, b: Pt) => P(a.x - b.x, a.y - b.y);
const add = (a: Pt, b: Pt) => P(a.x + b.x, a.y + b.y);
const mul = (a: Pt, k: number) => P(a.x * k, a.y * k);
const len = (a: Pt) => Math.hypot(a.x, a.y);
const unit = (a: Pt) => { const l = len(a) || 1; return P(a.x / l, a.y / l); };
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

/** Radius of a fillet in the corner prev→p→next whose tangent point lies `along` from p on edge p→next. */
function filletRadius(prev: Pt, p: Pt, next: Pt, along: number): number {
  if (!(along > 0)) return 0;
  const th = Math.acos(Math.max(-1, Math.min(1, dot(unit(sub(prev, p)), unit(sub(next, p))))));
  return along * Math.tan(th / 2);
}

interface Corner { start: Pt; end: Pt; arc?: { r: number; c: Pt; a0: number; da: number } }

function corners(pts: Pt[], radii: number[]): Corner[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n]!;
    const next = pts[(i + 1) % n]!;
    let r = radii[i] ?? 0;
    if (r <= 0) return { start: p, end: p };
    const u1 = unit(sub(prev, p));
    const u2 = unit(sub(next, p));
    const th = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))));
    if (th < 1e-6 || th > Math.PI - 1e-6) return { start: p, end: p };
    let tl = r / Math.tan(th / 2);
    const maxTl = 0.5 * Math.min(len(sub(prev, p)), len(sub(next, p)));
    if (tl > maxTl) { tl = maxTl; r = tl * Math.tan(th / 2); }
    const t1 = add(p, mul(u1, tl));
    const t2 = add(p, mul(u2, tl));
    const c = add(p, mul(unit(add(u1, u2)), r / Math.sin(th / 2)));
    const a0 = Math.atan2(t1.y - c.y, t1.x - c.x);
    let da = Math.atan2(t2.y - c.y, t2.x - c.x) - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    return { start: t1, end: t2, arc: { r, c, a0, da } };
  });
}

/** Maps drawing inches to output units: out = in. × k + offset. */
export interface PathTransform { k: number; dx: number; dy: number }
const IDENTITY: PathTransform = { k: 1, dx: 0, dy: 0 };

/** SVG path data for one contour, with true circular arcs. */
export function contourPath(c: Contour, t: PathTransform = IDENTITY): string {
  const f = (v: number) => String(Math.round(v * t.k * 1e4) / 1e4);
  const fp = (p: Pt) => `${String(Math.round((p.x * t.k + t.dx) * 1e4) / 1e4)} ${String(Math.round((p.y * t.k + t.dy) * 1e4) / 1e4)}`;
  if (c.kind === "circle") {
    const l = P(c.c.x - c.r, c.c.y), r = P(c.c.x + c.r, c.c.y);
    return `M${fp(l)}A${f(c.r)} ${f(c.r)} 0 1 0 ${fp(r)}A${f(c.r)} ${f(c.r)} 0 1 0 ${fp(l)}Z`;
  }
  const cs = corners(c.pts, c.radii);
  let d = "";
  cs.forEach((k, i) => {
    d += `${i === 0 ? "M" : "L"}${fp(k.start)}`;
    if (k.arc) d += `A${f(k.arc.r)} ${f(k.arc.r)} 0 0 ${k.arc.da > 0 ? 1 : 0} ${fp(k.end)}`;
  });
  return d + "Z";
}

/** Path data for the whole section; render with fill-rule="evenodd". */
export function sectionPath(g: SectionGeometry, t: PathTransform = IDENTITY): string {
  return g.contours.map((c) => contourPath(c, t)).join("");
}

/** Contour sampled as a polyline (arcs subdivided) — for area / bounds checks. */
export function contourPolygon(c: Contour, segs = 24): Pt[] {
  if (c.kind === "circle") {
    const n = segs * 8;
    return Array.from({ length: n }, (_, i) => P(c.c.x + c.r * Math.cos((2 * Math.PI * i) / n), c.c.y + c.r * Math.sin((2 * Math.PI * i) / n)));
  }
  const out: Pt[] = [];
  for (const k of corners(c.pts, c.radii)) {
    if (!k.arc) { out.push(k.start); continue; }
    const { r, c: ctr, a0, da } = k.arc;
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (da * i) / segs;
      out.push(P(ctr.x + r * Math.cos(a), ctr.y + r * Math.sin(a)));
    }
  }
  return out;
}

function polyArea(pts: Pt[]): number {
  let s = 0;
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]!; s += p.x * q.y - q.x * p.y; });
  return Math.abs(s) / 2;
}

/** Net steel area of the drawn section, in.² */
export function sectionArea(g: SectionGeometry): number {
  return g.contours.reduce((a, c) => a + (c.hole ? -1 : 1) * polyArea(contourPolygon(c, 48)), 0);
}

/** Bounding box of the drawn outline, in. */
export function contoursBounds(contours: Contour[]): Box {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const c of contours) for (const p of contourPolygon(c)) {
    b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y);
    b.x1 = Math.max(b.x1, p.x); b.y1 = Math.max(b.y1, p.y);
  }
  return b;
}

// ---------------------------------------------------------------- families
type Parts = Omit<SectionGeometry, "family" | "width" | "height" | "extent">;

const xyAxes = (c: Pt): AxisSpec[] => [
  { id: "x", origin: c, dir: P(1, 0) },
  { id: "y", origin: c, dir: P(0, -1) },
];

const isSloped = (s: Shape) => s.type === "S" || s.type === "ST" || ((s.type === "M" || s.type === "MT") && s.note === true);

/** Flange thickness at the toe and at the web face; tf is the average (mid-outstand) thickness. */
function flangeThickness(tf: number, outstand: number, slope: number) {
  const m = outstand / 2;
  return { tToe: tf - slope * m, tWeb: tf + slope * m, mid: m };
}

function iShape(s: Shape): Parts {
  const d = req(s, "d"), bf = req(s, "bf"), tw = req(s, "tw"), tf = req(s, "tf");
  const k = num(s, "kdes") ?? tf;
  const k1 = num(s, "k1");
  const cx = bf / 2, wl = cx - tw / 2, wr = cx + tw / 2;
  const slope = isSloped(s) ? FLANGE_SLOPE_STD : 0;
  const { tToe, tWeb, mid } = flangeThickness(tf, (bf - tw) / 2, slope);
  const r = filletRadius(P(bf, tToe), P(wr, tWeb), P(wr, d - tWeb), k - tWeb);
  const pts = [
    P(0, 0), P(bf, 0), P(bf, tToe), P(wr, tWeb), P(wr, d - tWeb), P(bf, d - tToe),
    P(bf, d), P(0, d), P(0, d - tToe), P(wl, d - tWeb), P(wl, tWeb), P(0, tToe),
  ];
  const radii = [0, 0, 0, r, r, 0, 0, 0, 0, r, r, 0];
  const c = P(cx, d / 2);
  const yTw = Math.max(0.3 * d, k + 0.08 * d);
  const dims: DimSpec[] = [
    { id: "d", sym: "d", value: d, det: num(s, "ddet"), a: P(0, 0), b: P(0, d), orient: "v", place: "left" },
    { id: "bf", sym: "b{f}", value: bf, det: num(s, "bfdet"), a: P(0, 0), b: P(bf, 0), orient: "h", place: "top" },
    { id: "tf", sym: "t{f}", value: tf, det: num(s, "tfdet"), a: P(bf, 0), b: P(slope ? bf - mid : bf, tf), orient: "v", place: "right" },
    { id: "k", sym: "k", value: k, det: num(s, "kdet"), a: P(wr, d - k), b: P(bf, d), orient: "v", place: "right" },
    { id: "tw", sym: "t{w}", value: tw, det: num(s, "twdet"), a: P(wl, yTw), b: P(wr, yTw), orient: "h", place: "inline" },
  ];
  if (k1 !== undefined) dims.push({ id: "k1", sym: "k{1}", value: k1, det: k1, a: P(cx, d), b: P(cx + k1, d - tWeb), orient: "h", place: "bottom" });
  return { contours: [{ kind: "poly", pts, radii }], centroid: c, dims, axes: xyAxes(c), markers: [] };
}

function channel(s: Shape): Parts {
  const d = req(s, "d"), bf = req(s, "bf"), tw = req(s, "tw"), tf = req(s, "tf");
  const k = num(s, "kdes") ?? tf;
  const xb = num(s, "x") ?? 0, eo = num(s, "eo");
  const { tToe, tWeb, mid } = flangeThickness(tf, bf - tw, s.type === "C" ? FLANGE_SLOPE_STD : FLANGE_SLOPE_MC);
  const r = filletRadius(P(bf, tToe), P(tw, tWeb), P(tw, d - tWeb), k - tWeb);
  const pts = [P(0, 0), P(bf, 0), P(bf, tToe), P(tw, tWeb), P(tw, d - tWeb), P(bf, d - tToe), P(bf, d), P(0, d)];
  const radii = [0, 0, 0, r, r, 0, 0, 0];
  const c = P(xb, d / 2);
  const yTw = Math.max(0.3 * d, k + 0.08 * d);
  const dims: DimSpec[] = [
    { id: "d", sym: "d", value: d, det: num(s, "ddet"), a: P(0, 0), b: P(0, d), orient: "v", place: "left" },
    { id: "bf", sym: "b{f}", value: bf, det: num(s, "bfdet"), a: P(0, 0), b: P(bf, 0), orient: "h", place: "top" },
    { id: "tf", sym: "t{f}", value: tf, det: num(s, "tfdet"), a: P(bf, 0), b: P(bf - mid, tf), orient: "v", place: "right" },
    { id: "k", sym: "k", value: k, det: num(s, "kdet"), a: P(tw, d - k), b: P(bf, d), orient: "v", place: "right" },
    { id: "tw", sym: "t{w}", value: tw, det: num(s, "twdet"), a: P(0, yTw), b: P(tw, yTw), orient: "h", place: "inline" },
    { id: "x", sym: "x̄", value: xb, a: P(0, d), b: c, orient: "h", place: "bottom", withAxes: true },
  ];
  const markers: MarkerSpec[] = [{ kind: "cg", at: c }];
  if (eo !== undefined) {
    const sc = P(-eo, d / 2);
    markers.push({ kind: "sc", at: sc });
    dims.push({ id: "eo", sym: "e{o}", value: eo, a: sc, b: P(0, d), orient: "h", place: "bottom", withAxes: true });
  }
  return { contours: [{ kind: "poly", pts, radii }], centroid: c, dims, axes: xyAxes(c), markers };
}

/** Single-angle outline: vertical leg `v` (left), horizontal leg `h` (bottom), heel at bottom-left. */
function anglePts(h: number, v: number, t: number, rRoot: number) {
  const rToe = Math.min(rRoot / 2, t / 2);
  return {
    pts: [P(0, 0), P(t, 0), P(t, v - t), P(h, v - t), P(h, v), P(0, v)],
    radii: [0, rToe, rRoot, rToe, 0, 0],
  };
}

function principalAxes(c: Pt, tanAlpha: number | undefined): AxisSpec[] {
  if (tanAlpha === undefined) return [];
  const a = Math.atan(tanAlpha);
  return [
    { id: "z", origin: c, dir: P(-Math.sin(a), -Math.cos(a)), principal: true },
    { id: "w", origin: c, dir: P(Math.cos(a), -Math.sin(a)), principal: true },
  ];
}

function angle(s: Shape): Parts {
  const d = req(s, "d"), b = req(s, "b"), t = req(s, "t");
  const k = num(s, "kdes") ?? 2 * t;
  const xb = num(s, "x") ?? 0, yb = num(s, "y") ?? 0;
  const { pts, radii } = anglePts(d, b, t, Math.max(0, k - t));
  const c = P(xb, b - yb);
  const yT = 0.22 * b;
  const dims: DimSpec[] = [
    { id: "b", sym: "b", value: b, det: b, a: P(0, 0), b: P(0, b), orient: "v", place: "left" },
    { id: "d", sym: "d", value: d, det: d, a: P(0, b), b: P(d, b), orient: "h", place: "bottom" },
    { id: "t", sym: "t", value: t, det: t, a: P(0, yT), b: P(t, yT), orient: "h", place: "inline" },
    { id: "k", sym: "k", value: k, det: num(s, "kdet"), a: P(t, b - k), b: P(d, b), orient: "v", place: "right" },
    { id: "x", sym: "x̄", value: xb, a: P(0, b), b: c, orient: "h", place: "bottom", withAxes: true },
    { id: "y", sym: "ȳ", value: yb, a: c, b: P(0, b), orient: "v", place: "left", withAxes: true },
  ];
  // Locating dims sit inside (nearer the steel than) the overall leg dims
  dims.sort((p, q) => Number(q.withAxes ?? false) - Number(p.withAxes ?? false));
  return {
    contours: [{ kind: "poly", pts, radii }],
    centroid: c,
    dims,
    axes: [...xyAxes(c), ...principalAxes(c, num(s, "tan(α)"))],
    markers: [{ kind: "cg", at: c }],
  };
}

function tee(s: Shape): Parts {
  const d = req(s, "d"), bf = req(s, "bf"), tw = req(s, "tw"), tf = req(s, "tf");
  const k = num(s, "kdes") ?? tf;
  const yb = num(s, "y") ?? d / 2;
  const cx = bf / 2, wl = cx - tw / 2, wr = cx + tw / 2;
  const slope = isSloped(s) ? FLANGE_SLOPE_STD : 0;
  const { tToe, tWeb, mid } = flangeThickness(tf, (bf - tw) / 2, slope);
  const r = filletRadius(P(bf, tToe), P(wr, tWeb), P(wr, d), k - tWeb);
  const pts = [P(0, 0), P(bf, 0), P(bf, tToe), P(wr, tWeb), P(wr, d), P(wl, d), P(wl, tWeb), P(0, tToe)];
  const radii = [0, 0, 0, r, 0, 0, r, 0];
  const c = P(cx, yb);
  const yTw = k + 0.6 * (d - k);
  const dims: DimSpec[] = [
    { id: "k", sym: "k", value: k, det: num(s, "kdet"), a: P(0, 0), b: P(wl, k), orient: "v", place: "left" },
    { id: "d", sym: "d", value: d, det: num(s, "ddet"), a: P(0, 0), b: P(wl, d), orient: "v", place: "left" },
    { id: "bf", sym: "b{f}", value: bf, det: num(s, "bfdet"), a: P(0, 0), b: P(bf, 0), orient: "h", place: "top" },
    { id: "tf", sym: "t{f}", value: tf, det: num(s, "tfdet"), a: P(bf, 0), b: P(slope ? bf - mid : bf, tf), orient: "v", place: "right" },
    { id: "y", sym: "ȳ", value: yb, a: P(bf, 0), b: c, orient: "v", place: "right", withAxes: true },
    { id: "tw", sym: "t{w}", value: tw, det: num(s, "twdet"), a: P(wl, yTw), b: P(wr, yTw), orient: "h", place: "inline" },
  ];
  return { contours: [{ kind: "poly", pts, radii }], centroid: c, dims, axes: xyAxes(c), markers: [{ kind: "cg", at: c }] };
}

/** Manual label of the single angle a 2L is built from: "2L8X4X1X3/4LLBB" → "L8X4X1". */
export function singleAngleLabel(label: string): string {
  return label.replace(/(LLBB|SLBB)$/, "").split("X").slice(0, 3).join("X").slice(1);
}

function doubleAngle(s: Shape): Parts {
  const d = req(s, "d"), b = req(s, "b"), t = req(s, "t");
  const yb = num(s, "y") ?? 0;
  const gap = doubleAngleInfo(s)?.spacing ?? 0;
  const single = findShape(singleAngleLabel(s.label));
  const k = (single && num(single, "kdes")) ?? 2 * t;
  const W = 2 * b + gap, cx = W / 2, x0 = cx + gap / 2;
  // Single angle with its heel at the top: horizontal leg along the top, vertical leg hanging down
  const { pts: base, radii } = anglePts(b, d, t, Math.max(0, k - t));
  const right = base.map((p) => P(x0 + p.x, d - p.y));
  const left = right.map((p) => P(W - p.x, p.y));
  const c = P(cx, yb);
  const yT = t + 0.6 * (d - t);
  const dims: DimSpec[] = [
    { id: "d", sym: "d", value: d, det: d, a: P(0, 0), b: P(cx - gap / 2 - t, d), orient: "v", place: "left" },
    { id: "b", sym: "b", value: b, det: b, a: P(x0, 0), b: P(W, 0), orient: "h", place: "top" },
    { id: "t", sym: "t", value: t, det: t, a: P(x0, yT), b: P(x0 + t, yT), orient: "h", place: "inline" },
    { id: "y", sym: "ȳ", value: yb, a: P(W, 0), b: c, orient: "v", place: "right", withAxes: true },
  ];
  if (gap > 0) dims.push({ id: "s", sym: "s", value: gap, det: gap, a: P(cx - gap / 2, d), b: P(cx + gap / 2, d), orient: "h", place: "bottom" });
  return {
    contours: [{ kind: "poly", pts: left, radii }, { kind: "poly", pts: right, radii }],
    centroid: c,
    dims,
    axes: xyAxes(c),
    markers: [{ kind: "cg", at: c }],
  };
}

function hssRect(s: Shape): Parts {
  const H = req(s, "Ht"), B = req(s, "B"), t = req(s, "tdes");
  const rect = (x0: number, y0: number, x1: number, y1: number) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
  const c = P(B / 2, H / 2);
  const yT = 0.25 * H;
  return {
    contours: [
      { kind: "poly", pts: rect(0, 0, B, H), radii: [2 * t, 2 * t, 2 * t, 2 * t] },
      { kind: "poly", pts: rect(t, t, B - t, H - t), radii: [t, t, t, t], hole: true },
    ],
    centroid: c,
    dims: [
      { id: "Ht", sym: "H", value: H, det: H, a: P(0, 0), b: P(0, H), orient: "v", place: "left" },
      { id: "B", sym: "B", value: B, det: B, a: P(0, H), b: P(B, H), orient: "h", place: "bottom" },
      { id: "t", sym: "t", value: t, det: num(s, "tnom"), detNote: "nom.", a: P(B - t, yT), b: P(B, yT), orient: "h", place: "inline" },
    ],
    axes: xyAxes(c),
    markers: [],
  };
}

function round(s: Shape): Parts {
  const OD = req(s, "OD"), t = req(s, "tdes");
  const ID = s.type === "PIPE" ? num(s, "ID") ?? OD - 2 * t : OD - 2 * t;
  const R = OD / 2;
  const c = P(R, R);
  const u = P(Math.SQRT1_2, -Math.SQRT1_2);
  return {
    contours: [{ kind: "circle", c, r: R }, { kind: "circle", c, r: ID / 2, hole: true }],
    centroid: c,
    dims: [
      { id: "OD", sym: "OD", value: OD, det: OD, a: P(0, R), b: P(OD, R), orient: "h", place: "bottom" },
      {
        id: "t", sym: "t", value: t, det: num(s, "tnom"), detNote: "nom.", detDecimal: s.type === "PIPE",
        a: add(c, mul(u, ID / 2)), b: add(c, mul(u, R)), orient: "aligned", place: "inline",
      },
    ],
    axes: xyAxes(c),
    markers: [],
  };
}

const BUILDERS: Record<ShapeFamily, (s: Shape) => Parts> = {
  "i-shape": iShape,
  channel,
  angle,
  tee,
  "double-angle": doubleAngle,
  "hss-rect": hssRect,
  "hss-round": round,
  pipe: round,
};

/** Build the drawing geometry for any shape in the database. */
export function sectionGeometry(s: Shape): SectionGeometry {
  const family = familyOf(s);
  const parts = BUILDERS[family](s);
  const bb = contoursBounds(parts.contours);
  const extent = { ...bb };
  for (const m of parts.markers) {
    extent.x0 = Math.min(extent.x0, m.at.x); extent.x1 = Math.max(extent.x1, m.at.x);
    extent.y0 = Math.min(extent.y0, m.at.y); extent.y1 = Math.max(extent.y1, m.at.y);
  }
  return { family, ...parts, width: bb.x1 - bb.x0, height: bb.y1 - bb.y0, extent };
}
