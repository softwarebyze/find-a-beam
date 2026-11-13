/** Commentary Appendix 7 alignment charts. Idealized planar frames, prismatic members. */
import type { CalcStep, DesignMethod } from "../types";

export interface AlignmentInput {
  GA: number;
  GB: number;
  sway: boolean;
}
function validG(g: number) {
  if (Number.isNaN(g) || g < 0) throw new RangeError("G must be nonnegative (Infinity denotes a true pin)");
}
/** Solve C-A-7-1/2 on the first physical buckling branch; K is theoretical. */
export function alignmentK({ GA, GB, sway }: AlignmentInput): number {
  validG(GA);
  validG(GB);
  if (GA === 0 && GB === 0) return sway ? 1 : 0.5;
  if (GA === Infinity && GB === Infinity) return sway ? Infinity : 1;
  const a = GA === Infinity ? 1 : GA / (1 + GA),
    b = GB === Infinity ? 1 : GB / (1 + GB);
  const p = a * b,
    s = a * (1 - b) + b * (1 - a),
    c = (1 - a) * (1 - b);
  // Multiplication by sin(q) removes tangent poles without changing interior roots.
  const f = (q: number) =>
    sway
      ? (p * q * q - 36 * c) * Math.sin(q) - 6 * s * q * Math.cos(q)
      : (p / 4) * q ** 3 * Math.sin(q) +
        (s / 2) * (q * Math.sin(q) - q * q * Math.cos(q)) +
        c * (2 * (1 - Math.cos(q)) - q * Math.sin(q));
  let lo = sway ? 1e-7 : Math.PI + 1e-9,
    hi = sway ? Math.PI - 1e-9 : 2 * Math.PI - 1e-9;
  const sign = Math.sign(f(lo));
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(f(mid)) === sign) lo = mid;
    else hi = mid;
  }
  return Math.PI / ((lo + hi) / 2);
}
export interface JointMember {
  E: number;
  I: number;
  L: number;
  tau?: number;
  farEnd?: "standard" | "fixed" | "pinned";
}
/** C-A-7-3. Girder adjustments apply only to girders, not the columns. */
export function gFactor(input: {
  columns: readonly JointMember[];
  girders: readonly JointMember[];
  sway: boolean;
}): number {
  const stiffness = (m: JointMember) => {
    if (![m.E, m.I, m.L, m.tau ?? 1].every((v) => Number.isFinite(v) && v > 0) || (m.tau ?? 1) > 1)
      throw new RangeError("Require E, I, L > 0 and 0 < tau ≤ 1");
    return (m.E * m.I * (m.tau ?? 1)) / m.L;
  };
  if (!input.columns.length) throw new RangeError("At least one column is required");
  const col = input.columns.reduce((v, m) => v + stiffness(m), 0);
  const girder = input.girders.reduce(
    (v, m) =>
      v +
      stiffness(m) *
        (m.farEnd === "fixed" ? (input.sway ? 1.5 : 2) : m.farEnd === "pinned" ? (input.sway ? 2 : 1.5) : 1),
    0,
  );
  return girder === 0 ? Infinity : col / girder;
}
/** Inelastic stiffness adjustment, §C2.3(b), used with the Manual Table 4-13 approach. */
export function tauB(Pr: number, Py: number, method: DesignMethod = "LRFD"): number {
  if (!Number.isFinite(Pr) || Pr < 0 || !Number.isFinite(Py) || Py <= 0)
    throw new RangeError("Require Pr ≥ 0 and Py > 0");
  const p = ((method === "LRFD" ? 1 : 1.6) * Pr) / Py;
  if (p >= 1) throw new RangeError("αPr must be less than Py for an inelastic stiffness calculation");
  return p <= 0.5 ? 1 : 4 * p * (1 - p);
}
export function alignmentReport(input: AlignmentInput): { K: number; steps: CalcStep[] } {
  const K = alignmentK(input),
    ref = input.sway ? "Eq. C-A-7-2" : "Eq. C-A-7-1";
  return {
    K,
    steps: [
      { label: "Joint A stiffness ratio", symbol: "G{A}", value: input.GA, quantity: "ratio", ref: "Eq. C-A-7-3" },
      { label: "Joint B stiffness ratio", symbol: "G{B}", value: input.GB, quantity: "ratio", ref: "Eq. C-A-7-3" },
      {
        label: "Theoretical effective length factor",
        symbol: "K",
        value: K,
        quantity: "ratio",
        ref,
        note: "Alignment-chart assumptions apply: rigid joints, simultaneous buckling, prismatic members, negligible girder axial load and shear deformation. Foundation restraint requires engineering assessment.",
      },
    ],
  };
}
