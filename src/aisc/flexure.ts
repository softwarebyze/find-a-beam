/** AISC 360-22 Chapter F. Pure functions; kip, in., ksi, kip-in. */
import { E, type Material } from "@/data/materials";
import { familyOf, req, type Shape } from "@/data/shapes";
import { classifyFlexure } from "./classify-flexure";
import type { FlexureFn, FlexureInput } from "./types";
import { iShapeFlexure } from "./flexure/i-shapes";
import { hssFlexure } from "./flexure/hss";
import { singleAngleFlexure, teeFlexure } from "./flexure/angles-tees";
import { step, validateInput, type FlexureContext } from "./flexure/shared";

export const flexuralStrength: FlexureFn = (shape, material, input) => {
  validateInput(material.Fy, input);
  const classification = classifyFlexure(shape, material, input.axis);
  const c: FlexureContext = { classification, limitStates: [], warnings: [], steps: [
    step("Specified yield stress", "F{y}", material.Fy, "stress", "§F1"),
    step("Modulus of elasticity", "E", E, "stress", "§B4"),
    step("Elastic section modulus about the geometric bending axis", input.axis === "major" ? "S{x}" : "S{y}", req(shape, input.axis === "major" ? "Sx" : "Sy"), "modulus", "§F1"),
    step("Plastic section modulus about the geometric bending axis", input.axis === "major" ? "Z{x}" : "Z{y}", req(shape, input.axis === "major" ? "Zx" : "Zy"), "modulus", "§F1"),
    step("Laterally unbraced length", "L{b}", input.Lb, "span", "§F1"),
    step("Moment gradient modification factor", "C{b}", input.Cb ?? 1, "ratio", "Eq. F1-1"),
    ...classification.elements.flatMap(e => [step(`${e.element} width-to-thickness ratio (${e.cls})`, e.symbol, e.lambda, "ratio", e.ref), step(`${e.element} compact limit`, "λ{p}", e.lambdaP!, "ratio", e.ref), step(`${e.element} slender limit`, "λ{r}", e.lambdaR, "ratio", e.ref)]),
  ] };
  switch (familyOf(shape)) {
    case "i-shape": case "channel": return iShapeFlexure(shape, material, input, c);
    case "hss-rect": case "hss-round": case "pipe": return hssFlexure(shape, material, input, c);
    case "tee": case "double-angle": return teeFlexure(shape, material, input, c);
    case "angle": return singleAngleFlexure(shape, material, input, c);
  }
};

/** Eq. F1-1. Moments may have either sign; all four are used as absolute values.
 * Zero demand returns 1.0. Mmax must bound all three sampled moments. */
export function cbFromMoments(Mmax: number, MA: number, MB: number, MC: number): number {
  const vals = [Mmax, MA, MB, MC].map(Math.abs);
  if (!vals.every(Number.isFinite)) throw new RangeError("Moment samples must be finite");
  const [max, a, b, c] = vals as [number, number, number, number];
  if (Math.max(a, b, c) > max) throw new RangeError("Mmax must be at least the magnitude of each quarter-point moment");
  if (max === 0) return 1;
  return 12.5 / (2.5 + 3 * a / max + 4 * b / max + 3 * c / max);
}
export interface LtbCurveInput extends Omit<FlexureInput, "Lb"> {
  /** Maximum length in inches. */
  Lmax: number;
  /** Number of uniformly spaced samples, including 0 and Lmax; default 81. */
  n?: number;
}
export interface LtbCurvePoint { Lb: number; Mn: number }
/** Nominal flexural strength versus Lb, including all local limit states.
 * Exact Lp/Lr samples are inserted when they fall within [0,Lmax]. */
export function ltbCurve(shape: Shape, material: Material, input: LtbCurveInput): LtbCurvePoint[] {
  const { Lmax, n = 81, ...rest } = input;
  if (!Number.isFinite(Lmax) || Lmax < 0) throw new RangeError("Lmax must be finite and nonnegative");
  if (!Number.isInteger(n) || n < 2 || n > 10000) throw new RangeError("n must be an integer between 2 and 10000");
  const base = flexuralStrength(shape, material, { ...rest, Lb: 0 });
  const lengths = new Set(Array.from({ length: n }, (_, i) => Lmax * i / (n - 1)));
  for (const bp of [base.Lp, base.Lr]) if (bp !== undefined && bp >= 0 && bp <= Lmax) lengths.add(bp);
  return [...lengths].sort((a, b) => a - b).map(Lb => ({ Lb, Mn: flexuralStrength(shape, material, { ...rest, Lb }).nominal }));
}
