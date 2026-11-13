/** ANSI/AISC 360-22 Appendix 8 member magnification and Appendix 7 idealized K values. */
import type { CalcStep, DesignMethod } from "../types";

/** A-8-4. Signed end actions: M1/M2 positive for reverse curvature, negative for single curvature.
 * No intermediate transverse load; otherwise use Cm = 1 or determine it by analysis.
 * Inputs can arrive in either order; the smaller absolute moment is used as M1.
 */
export function Cm(M1: number, M2: number): number {
  if (!Number.isFinite(M1 + M2)) throw new RangeError("End moments must be finite");
  const [small, large] = Math.abs(M1) <= Math.abs(M2) ? [M1, M2] : [M2, M1];
  return large === 0 ? 1 : 0.6 - (0.4 * small) / large;
}
/** A-8-5; EI is the analysis stiffness EI* (including applicable Chapter C reductions). */
export function Pe1(EI: number, Lc1: number): number {
  if (!(EI > 0) || !Number.isFinite(EI) || Lc1 < 0 || !Number.isFinite(Lc1))
    throw new RangeError("EI must be positive and Lc1 nonnegative, both finite");
  return Lc1 === 0 ? Infinity : (Math.PI ** 2 * EI) / Lc1 ** 2;
}
/** A-8-3. Returns Infinity if the elastic stability limit αPr ≥ Pe1 is reached. */
export function B1(Pr: number, elasticLoad: number, cm: number, method: DesignMethod = "LRFD"): number {
  if (Pr < 0 || !Number.isFinite(Pr) || !(elasticLoad > 0) || !(cm > 0) || !Number.isFinite(cm))
    throw new RangeError("Require Pr ≥ 0, Pe1 > 0, and finite Cm > 0");
  const denominator = 1 - ((method === "LRFD" ? 1 : 1.6) * Pr) / elasticLoad;
  return denominator <= 0 ? Infinity : Math.max(1, cm / denominator);
}
export function magnificationReport(
  Pr: number,
  EI: number,
  Lc1: number,
  cm: number,
  method: DesignMethod = "LRFD",
): { B1: number; Pe1: number; steps: CalcStep[] } {
  const elasticLoad = Pe1(EI, Lc1),
    b = B1(Pr, elasticLoad, cm, method);
  return {
    B1: b,
    Pe1: elasticLoad,
    steps: [
      {
        label: "Effective length with sidesway inhibited",
        symbol: "L{c1}",
        value: Lc1,
        quantity: "span",
        ref: "Eq. A-8-5",
      },
      {
        label: "Equivalent uniform moment factor",
        symbol: "C{m}",
        value: cm,
        quantity: "ratio",
        ref: "Eq. A-8-4",
        note: "For intermediate transverse load use Cm = 1 or analysis.",
      },
      {
        label: "Elastic critical buckling strength",
        symbol: "P{e1}",
        expr: "π²EI*/L{c1}²",
        value: elasticLoad,
        quantity: "force",
        ref: "Eq. A-8-5",
      },
      {
        label: "Member moment magnifier",
        symbol: "B{1}",
        expr: "max[1, C{m}/(1 − αP{r}/P{e1})]",
        value: b,
        quantity: "ratio",
        ref: "Eq. A-8-3",
        note: `α = ${method === "LRFD" ? 1 : 1.6}. Infinity means elastic instability; this is not a frame B2 check.`,
      },
    ],
  };
}

export const EFFECTIVE_LENGTH_CASES = [
  { id: "a", theoreticalK: 0.5, recommendedK: 0.65, description: "Both ends rotation fixed and translation fixed." },
  {
    id: "b",
    theoreticalK: 0.7,
    recommendedK: 0.8,
    description: "One end fixed; the other rotation free and translation fixed.",
  },
  {
    id: "c",
    theoreticalK: 1.0,
    recommendedK: 1.0,
    description: "Both ends rotation free and translation fixed (pinned–pinned).",
  },
  {
    id: "d",
    theoreticalK: 1.0,
    recommendedK: 1.2,
    description: "One end fixed; the other rotation fixed and translation free (sidesway permitted).",
  },
  {
    id: "e",
    theoreticalK: 2.0,
    recommendedK: 2.1,
    description: "One end fixed; the other rotation free and translation free (cantilever).",
  },
  {
    id: "f",
    theoreticalK: 2.0,
    recommendedK: 2.0,
    description: "One end rotation free and translation fixed; the other rotation fixed and translation free.",
  },
].map((c) => ({ ...c, quantity: "ratio" as const, ref: `Commentary Table C-A-7.1, Case (${c.id})` }));
