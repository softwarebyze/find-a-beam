/** Combined axial force and flexure, ANSI/AISC 360-22 §§H1–H2. */
import { E } from "@/data/materials";
import { UnsupportedError, type CalcStep, type DesignMethod, type InteractionInput, type InteractionResult } from "./types";

export interface SeparatePlaneInteractionInput extends InteractionInput {
  mode: "H1.3";
  /** Caller verifies rolled, doubly symmetric, compact section. */
  doublySymmetricRolledCompact: true;
  Lcz: number;
  Lcy: number;
  /** Available axial strengths in and out of the plane of bending. */
  Pcx: number;
  Pcy: number;
  /** Available yielding strength and LTB strength computed with Cb = 1. */
  McxYield: number;
  McxLTB: number;
  Cb?: number;
}
export interface StressInteractionPoint {
  label?: string;
  /** Signed required stresses at the SAME point, principal axes, ksi.
   * Choose a consistent stress sign; available stresses must match the stress sense.
   */
  fra: number;
  Fca: number;
  frbw: number;
  Fcbw: number;
  frbz?: number;
  Fcbz?: number;
}
export interface StressInteractionInput { mode: "H2"; points: readonly StressInteractionPoint[] }
export interface ExtendedInteractionResult {
  ratio: number;
  equation: InteractionResult["equation"] | "H1-3" | "H2-1";
  steps: CalcStep[];
  checks?: { name: string; ratio: number; ref: string; quantity: "ratio" }[];
}

function finite(v: number, name: string): void { if (!Number.isFinite(v)) throw new RangeError(`${name} must be finite`); }
function positive(v: number, name: string): void { finite(v, name); if (!(v > 0)) throw new RangeError(`${name} must be positive`); }
function minorRatio(Mry: number | undefined, Mcy: number | undefined): number {
  finite(Mry ?? 0, "Mry");
  if (Mcy !== undefined) positive(Mcy, "Mcy");
  if ((Mry ?? 0) === 0) return 0;
  if (Mcy === undefined) throw new RangeError("Nonzero Mry requires Mcy");
  return Math.abs(Mry!) / Mcy;
}
function h1(input: InteractionInput): InteractionResult {
  finite(input.Pr, "Pr"); finite(input.Mrx, "Mrx"); positive(input.Pc, "Pc"); positive(input.Mcx, "Mcx");
  const pr = Math.abs(input.Pr) / input.Pc, mx = Math.abs(input.Mrx) / input.Mcx, my = minorRatio(input.Mry, input.Mcy);
  const equation = pr >= 0.2 ? "H1-1a" : "H1-1b";
  const ratio = pr >= 0.2 ? pr + 8 / 9 * (mx + my) : pr / 2 + mx + my;
  return { ratio, equation, steps: [
    { label: "Axial ratio", symbol: "P{r}/P{c}", value: pr, quantity: "ratio", ref: "§H1.1", note: pr >= 0.2 ? "≥ 0.2" : "< 0.2" },
    { label: "Major-axis flexural ratio", symbol: "M{rx}/M{cx}", value: mx, quantity: "ratio", ref: "§H1.1" },
    { label: "Minor-axis flexural ratio", symbol: "M{ry}/M{cy}", value: my, quantity: "ratio", ref: "§H1.1" },
    { label: "Interaction", expr: pr >= 0.2 ? "P{r}/P{c} + (8/9)(M{rx}/M{cx} + M{ry}/M{cy}) ≤ 1" : "P{r}/(2P{c}) + M{rx}/M{cx} + M{ry}/M{cy} ≤ 1", value: ratio, quantity: "ratio", ref: `Eq. ${equation}`, note: "Use available strengths on the same LRFD/ASD basis; required moments include Chapter C second-order effects." },
  ] };
}

export function interaction(input: SeparatePlaneInteractionInput | StressInteractionInput): ExtendedInteractionResult;
export function interaction(input: InteractionInput): InteractionResult;
export function interaction(input: InteractionInput | SeparatePlaneInteractionInput | StressInteractionInput): ExtendedInteractionResult;
export function interaction(input: InteractionInput | SeparatePlaneInteractionInput | StressInteractionInput): ExtendedInteractionResult {
  if ("mode" in input && input.mode === "H2") {
    if (!input.points.length) throw new RangeError("H2 requires stresses at all critical section points");
    const steps: CalcStep[] = [], checks: NonNullable<ExtendedInteractionResult["checks"]> = [];
    for (const [i, p] of input.points.entries()) {
      finite(p.fra, "fra"); finite(p.frbw, "frbw"); finite(p.frbz ?? 0, "frbz"); positive(p.Fca, "Fca"); positive(p.Fcbw, "Fcbw");
      if (p.Fcbz !== undefined) positive(p.Fcbz, "Fcbz");
      if ((p.frbz ?? 0) !== 0 && p.Fcbz === undefined) throw new RangeError("Nonzero frbz requires Fcbz");
      const ratio = Math.abs(p.fra / p.Fca + p.frbw / p.Fcbw + (p.frbz ?? 0) / (p.Fcbz ?? 1));
      const label = p.label ?? `Critical point ${i + 1}`;
      steps.push({ label, expr: "|f{ra}/F{ca} + f{rbw}/F{cbw} + f{rbz}/F{cbz}| ≤ 1", value: ratio, quantity: "ratio", ref: "Eq. H2-1", note: "Signed stresses at the same point; available stresses correspond to the local stress sense. Evaluate every critical point and include second-order compression moments (§H2)." });
      checks.push({ name: label, ratio, ref: "Eq. H2-1", quantity: "ratio" });
    }
    return { ratio: Math.max(...checks.map(c => c.ratio)), equation: "H2-1", steps, checks };
  }
  if ("mode" in input && input.mode === "H1.3") {
    if (!input.doublySymmetricRolledCompact) throw new UnsupportedError("§H1.3 requires a doubly symmetric rolled compact member");
    for (const [name, value] of Object.entries({ Lcz: input.Lcz, Lcy: input.Lcy })) { finite(value, name); if (value < 0) throw new RangeError(`${name} must be nonnegative`); }
    if (input.Lcz > input.Lcy || minorRatio(input.Mry, input.Mcy) >= 0.05) throw new UnsupportedError("§H1.3 requires Lcz ≤ Lcy and Mry/Mcy < 0.05; use §H1.1");
    positive(input.Pcy, "Pcy"); positive(input.McxLTB, "McxLTB"); positive(input.Cb ?? 1, "Cb");
    const inPlane = h1({ ...input, Pc: input.Pcx, Mcx: input.McxYield });
    const pr = Math.abs(input.Pr) / input.Pcy, mx = Math.abs(input.Mrx) / ((input.Cb ?? 1) * input.McxLTB);
    // For Pr > Pcy the member already fails; do not let the quadratic axial term decrease the ratio.
    const out = pr > 1 ? Math.max(pr, pr * (1.5 - 0.5 * pr) + mx ** 2) : pr * (1.5 - 0.5 * pr) + mx ** 2;
    return { ratio: Math.max(inPlane.ratio, out), equation: out > inPlane.ratio ? "H1-3" : inPlane.equation,
      steps: [...inPlane.steps,
        { label: "Out-of-plane axial ratio", symbol: "P{r}/P{cy}", value: pr, quantity: "ratio", ref: "§H1.3(b)" },
        { label: "Out-of-plane buckling and LTB", expr: "(P{r}/P{cy})[1.5 − 0.5(P{r}/P{cy})] + [M{rx}/(C{b}M{cx})]² ≤ 1", value: out, quantity: "ratio", ref: "Eq. H1-3", note: "Mcx is available LTB strength with Cb = 1. If Pr > Pcy, the ratio is also bounded below by Pr/Pcy." },
      ], checks: [
        { name: "In-plane instability", ratio: inPlane.ratio, ref: `Eq. ${inPlane.equation}`, quantity: "ratio" },
        { name: "Out-of-plane buckling", ratio: out, ref: "Eq. H1-3", quantity: "ratio" },
      ] };
  }
  return h1(input);
}

/** §H1.2 tension benefit for Cb; caller must recompute Chapter F strength and enforce yielding.
 * Applies only to doubly symmetric members under simultaneous axial tension and flexure.
 */
export function tensionLtbFactor(Pr: number, Iy: number, Lb: number, method: DesignMethod = "LRFD"): { factor: number; Pey: number; steps: CalcStep[] } {
  finite(Pr, "Pr"); positive(Iy, "Iy"); finite(Lb, "Lb");
  if (Pr < 0 || Lb < 0) throw new RangeError("Tension Pr and Lb must be nonnegative");
  const Pey = Lb === 0 ? Infinity : Math.PI ** 2 * E * Iy / Lb ** 2;
  const factor = Math.sqrt(1 + (method === "LRFD" ? 1 : 1.6) * Pr / Pey);
  return { factor, Pey, steps: [
    { label: "Unbraced length", symbol: "L{b}", value: Lb, quantity: "span", ref: "Eq. H1-2" },
    { label: "Minor-axis elastic buckling load", symbol: "P{ey}", expr: "π²EI{y}/L{b}²", value: Pey, quantity: "force", ref: "Eq. H1-2" },
    { label: "Tension multiplier for Cb", expr: "√(1 + αP{r}/P{ey})", value: factor, quantity: "ratio", ref: "§H1.2", note: "Recompute Chapter F available flexural strength; this does not multiply Mcx directly." },
  ] };
}
