import { available } from "../../common";
import type { CalcStep, DesignMethod, LimitState } from "../../types";
import type { ConnectionResult, HoleType } from "../types";
import type { ConnectionKit } from "./kit";
import type { CheckGroup, DetailCheck, ShearCheck } from "./types";

export const PHI = {
  yield: { phi: 1.0, omega: 1.5 },
  rupture: { phi: 0.75, omega: 2.0 },
  flexure: { phi: 0.9, omega: 1.67 },
} as const;

export function limitState(
  id: string,
  name: string,
  ref: string,
  nominal: number,
  factors: { phi: number; omega: number },
  steps: CalcStep[],
): LimitState {
  return { id, name, ref, nominal: Math.max(0, nominal), phi: factors.phi, omega: factors.omega, steps };
}

/** Assemble a ConnectionResult; governing is the lowest available strength for `method`. */
export function connectionResult(
  section: string,
  limitStates: LimitState[],
  method: DesignMethod,
  steps: CalcStep[] = [],
  warnings: string[] = [],
): ConnectionResult {
  const avail = (l: LimitState) => (method === "LRFD" ? l.phi! * l.nominal : l.nominal / l.omega!);
  const gov = limitStates.reduce((a, b) => (avail(b) < avail(a) ? b : a));
  return {
    kind: "connection",
    quantity: "force",
    nominal: gov.nominal,
    phi: gov.phi!,
    omega: gov.omega!,
    governing: gov.id,
    limitStates,
    section,
    steps,
    warnings,
  };
}

/** Re-express a per-element kit result as one limit state scaled by `factor` (e.g. group size). */
export function scaled(
  r: ConnectionResult,
  id: string,
  name: string,
  factor: number,
  factorStep?: CalcStep,
): LimitState {
  const gov = r.limitStates.find((l) => l.id === r.governing) ?? r.limitStates[0];
  const phi = gov?.phi ?? r.phi,
    omega = gov?.omega ?? r.omega;
  const steps: CalcStep[] = [...r.steps, ...r.limitStates.flatMap((l) => l.steps)];
  if (factorStep) steps.push(factorStep);
  return { id, name, ref: gov?.ref ?? r.section, nominal: r.nominal * factor, phi, omega, steps };
}

export function makeCheck(
  id: string,
  title: string,
  group: CheckGroup,
  result: ConnectionResult,
  demand: number,
  method: DesignMethod,
): ShearCheck {
  const avail = available(result, method);
  return { id, title, group, result, demand, available: avail, ratio: avail > 0 ? demand / avail : Infinity };
}

export function detail(
  id: string,
  label: string,
  value: number,
  limit: number,
  kind: "min" | "max",
  ref: string,
  opts: { quantity?: DetailCheck["quantity"]; advisory?: boolean; note?: string } = {},
): DetailCheck {
  const tol = 1e-6;
  const pass = kind === "min" ? value >= limit - tol : value <= limit + tol;
  return { id, label, value, limit, kind, ref, pass, quantity: opts.quantity ?? "length", advisory: opts.advisory, note: opts.note };
}

/** Slot length per Table J3.3 (horizontal dimension of SSL / LSL holes), in. */
export function slotLength(d: number, hole: HoleType): number | undefined {
  if (hole === "SSL") return d <= 0.5 + 1e-9 ? 11 / 16 : d <= 0.875 + 1e-9 ? d + 0.25 : d <= 1 + 1e-9 ? d + 5 / 16 : d + 0.375;
  if (hole === "LSL") return 2.5 * d;
  return undefined;
}

export interface HoleSize {
  /** Vertical dimension (parallel to the reaction) */
  y: number;
  /** Horizontal dimension (slot length for horizontal slots) */
  x: number;
  type: HoleType;
}

export function holeSize(kit: ConnectionKit, d: number, hole: HoleType): HoleSize {
  const slotted = hole === "SSL" || hole === "LSL";
  const width = slotted ? kit.nominalHoleDiameter(d, hole, "perpendicular") : kit.nominalHoleDiameter(d, hole);
  return { y: width, x: slotLength(d, hole) ?? width, type: hole };
}

/** Width deducted for net area, §B4.3b: hole dimension + 1/16 in. */
export const netWidth = (dim: number) => dim + 1 / 16;

/**
 * Clear distances lc for a vertical bolt row, loaded-edge bolt first. `edge` is the center-to-edge distance
 * toward which that bolt bears; undefined means the material is continuous there (tearout cannot govern,
 * so lc is taken as 4dh, beyond the 2d at which Eq. J3-6c reaches Eq. J3-6a).
 */
export function rowClearDistances(n: number, s: number, hole: HoleSize, edge: number | undefined): number[] {
  return Array.from({ length: n }, (_, i) =>
    i > 0 ? s - hole.y : edge !== undefined ? edge - hole.y / 2 : 4 * hole.y,
  );
}

export interface BearingPly {
  label: string;
  t: number;
  Fu: number;
  /** Clear distances per bolt, loaded-edge bolt first */
  lcs: number[];
  /** Number of identical rows (bolt lines or plies) */
  multiplier?: number;
}

/** Σ min(bearing, tearout) per bolt, Eqs. J3-6a/J3-6c, scaled by C/n for eccentric groups. */
export function bearingLimitState(
  kit: ConnectionKit,
  id: string,
  d: number,
  hole: HoleSize,
  ply: BearingPly,
  groupFactor = 1,
): LimitState {
  const m = ply.multiplier ?? 1;
  const edgeLc = ply.lcs[0]!;
  const interiorLc = ply.lcs[1];
  const common = { d, t: ply.t, Fu: ply.Fu, holeType: hole.type, slot: "perpendicular" as const };
  const edge = kit.boltBearing({ ...common, lc: Math.max(edgeLc, 0) });
  const interior = interiorLc !== undefined ? kit.boltBearing({ ...common, lc: Math.max(interiorLc, 0) }) : undefined;
  const nInterior = ply.lcs.length - 1;
  const perRow = edge.nominal + nInterior * (interior?.nominal ?? 0);
  const prefixed = (r: ConnectionResult, prefix: string) =>
    [...r.steps, ...r.limitStates.flatMap((l) => l.steps)].map((s) => ({ ...s, label: `${prefix}: ${s.label}` }));
  const steps: CalcStep[] = [
    { label: `Clear distance, bolt nearest the loaded edge (${ply.label})`, symbol: "l{c}", value: edgeLc, quantity: "length", ref: "§J3.11" },
    ...prefixed(edge, "Edge bolt"),
    { label: "Edge bolt nominal strength", symbol: "r{n,edge}", value: edge.nominal, quantity: "force", ref: "Eq. J3-6" },
  ];
  if (interior && interiorLc !== undefined) {
    steps.push(
      { label: "Clear distance, interior bolts", symbol: "l{c}", expr: "s − d{h}", value: interiorLc, quantity: "length", ref: "§J3.11" },
      ...prefixed(interior, "Interior bolt"),
      { label: "Interior bolt nominal strength", symbol: "r{n,int}", value: interior.nominal, quantity: "force", ref: "Eq. J3-6" },
    );
  }
  const nominal = perRow * m * groupFactor;
  steps.push({
    label: `Bearing and tearout on ${ply.label}`,
    symbol: "R{n}",
    expr: `${groupFactor !== 1 ? "(C/n) × " : ""}${m > 1 ? `${m} × ` : ""}[r{n,edge} + ${nInterior} r{n,int}]`,
    value: nominal,
    quantity: "force",
    ref: "§J3.11",
  });
  return { id, name: `Bolt bearing and tearout on ${ply.label}`, ref: "§J3.11", nominal, phi: edge.phi, omega: edge.omega, steps };
}

export const sixteenths = (w: number) => Math.round(w * 16 * 1000) / 1000;

/**
 * Eccentrically loaded weld group, Manual Part 8 convention: Rn = C C1 D l, with C from the shared
 * instantaneous-center solver (E70 basis), C1 = FEXX/70 (Manual Table 8-3) and l the longest segment.
 * The group is solved with the load on either side of the centroid and the lesser C is used.
 */
export function weldGroupLimitState(
  kit: ConnectionKit,
  id: string,
  name: string,
  group: { segments: { x1: number; y1: number; x2: number; y2: number }[]; ex: number },
  weld: { w: number; FEXX: number },
): LimitState {
  const solve = (ex: number) => kit.eccentricWeldGroup({ segments: group.segments, ex, angle: 0, FEXX: 70 });
  const pos = solve(Math.abs(group.ex)),
    neg = solve(-Math.abs(group.ex));
  const r = neg.C < pos.C ? neg : pos;
  const l = Math.max(...group.segments.map((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1)));
  const D = sixteenths(weld.w),
    C1 = weld.FEXX / 70;
  const nominal = r.C * C1 * D * l;
  return {
    id,
    name,
    ref: "Manual Part 8",
    nominal,
    phi: 0.75,
    omega: 2.0,
    steps: [
      { label: "Eccentricity from weld group centroid", symbol: "e{x}", value: group.ex, quantity: "length", ref: r.ref },
      ...r.steps,
      { label: "Weld group coefficient (E70)", symbol: "C", value: r.C, ref: r.ref },
      { label: "Electrode coefficient", symbol: "C{1}", expr: "F{EXX}/70", value: C1, ref: "Manual Table 8-3" },
      { label: "Weld size in sixteenths", symbol: "D", value: D },
      { label: "Characteristic weld length (longest segment)", symbol: "l", value: l, quantity: "length" },
      { label: "Nominal weld group strength", symbol: "R{n}", expr: "C C{1} D l", value: nominal, quantity: "force", ref: "Manual Part 8, §J2.4" },
    ],
  };
}

export function positive(v: number, name: string): number {
  if (!(v > 0) || !Number.isFinite(v)) throw new RangeError(`${name} must be finite and positive`);
  return v;
}
export function nonnegative(v: number, name: string): number {
  if (!(v >= 0) || !Number.isFinite(v)) throw new RangeError(`${name} must be finite and nonnegative`);
  return v;
}
