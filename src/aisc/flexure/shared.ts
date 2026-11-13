import type { Quantity } from "@/lib/units";
import type { CalcStep, FlexureInput, FlexureResult, LimitState } from "../types";
import { governingOf, RESISTANCE } from "../common";

/** Numeric report lines are always dimensioned and cited. */
export function step(
  label: string,
  symbol: string,
  value: number,
  quantity: Quantity,
  ref: string,
  expr?: string,
): CalcStep {
  return { label, symbol, value, quantity, ref, expr };
}
/** The quantity is also carried at runtime on every limit state for report consumers. */
export function state(
  id: string,
  name: string,
  nominal: number,
  ref: string,
  steps: CalcStep[] = [],
  quantity: "moment" | "force" = "moment",
): LimitState & { quantity: "moment" | "force" } {
  return {
    id,
    name,
    nominal,
    ref,
    quantity,
    steps: [...steps, step(name, quantity === "moment" ? "M{n}" : "V{n}", nominal, quantity, ref)],
  };
}
export type FlexureContext = Pick<FlexureResult, "classification" | "steps" | "warnings" | "limitStates">;
export function finish(c: FlexureContext, Mp: number, section: string, Lp?: number, Lr?: number): FlexureResult {
  for (const l of c.limitStates)
    if (!Number.isFinite(l.nominal) || l.nominal <= 0)
      throw new RangeError(`Invalid ${l.id} strength; section geometry is outside the applicable equation`);
  const gov = governingOf(c.limitStates);
  return {
    kind: "flexure",
    quantity: "moment",
    ...RESISTANCE.flexure,
    ...c,
    nominal: gov.nominal,
    governing: gov.id,
    Mp,
    section,
    Lp,
    Lr,
  };
}
export function validateInput(Fy: number, input: FlexureInput): void {
  if (!Number.isFinite(Fy) || Fy <= 0) throw new RangeError("Fy must be finite and positive");
  if (!Number.isFinite(input.Lb) || input.Lb < 0) throw new RangeError("Lb must be finite and nonnegative");
  if (input.Cb !== undefined && (!Number.isFinite(input.Cb) || input.Cb <= 0))
    throw new RangeError("Cb must be finite and positive");
}
export const interpolate = (x: number, lo: number, hi: number) => Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
export const kcOf = (htw: number) => Math.min(0.76, Math.max(0.35, 4 / Math.sqrt(htw)));
/** Eq. F5-6 (also invoked by F7-7); aw must not exceed 10. */
export function rpgOf(aw: number, lambda: number, E: number, Fy: number): number {
  const a = Math.min(10, aw);
  return Math.min(1, 1 - (a / (1200 + 300 * a)) * (lambda - 5.7 * Math.sqrt(E / Fy)));
}
