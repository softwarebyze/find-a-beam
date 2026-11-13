/**
 * Simple shear connections and coped beams — Manual Parts 9 and 10.
 * `designShearConnection` returns every applicable cited limit state with its demand/capacity ratio.
 */
import { defaultKit, type ConnectionKit } from "./kit";
import { doubleAngle } from "./double-angle";
import { endPlate } from "./end-plate";
import { seated } from "./seated";
import { singlePlate } from "./single-plate";
import type { ShearConnectionInput, ShearConnectionReport } from "./types";

export * from "./types";
export type { ConnectionKit } from "./kit";
export { defaultKit } from "./kit";
export { copedSection, copeFlexure, plateBucklingQ } from "./coped-beam";
export { webLocalCripplingAtEnd, webLocalYieldingAtEnd } from "./web-local";
export { conventionalLimits, momentOnlyCoefficient, netPlasticModulus } from "./single-plate";
export { angleLegs } from "./double-angle";
export { slotLength } from "./common";

export function designShearConnection(input: ShearConnectionInput, kit: ConnectionKit = defaultKit): ShearConnectionReport {
  if (!(input.R >= 0) || !Number.isFinite(input.R)) throw new RangeError("Required reaction must be finite and nonnegative");
  if (!Number.isInteger(input.bolts.n) || input.bolts.n < 1) throw new RangeError("Number of bolt rows must be a positive integer");
  const report =
    input.type === "single-plate"
      ? singlePlate(kit, input)
      : input.type === "double-angle"
        ? doubleAngle(kit, input)
        : input.type === "seated"
          ? seated(kit, input)
          : endPlate(kit, input);
  const governing = report.checks.reduce<ShearConnectionReport["governing"]>((g, c) => (!g || c.ratio > g.ratio ? c : g), undefined);
  const maxRatio = governing?.ratio ?? 0;
  const detailOK = report.detailing.every((d) => d.pass || d.advisory);
  for (const c of report.checks) report.warnings.push(...c.result.warnings.filter((w) => !report.warnings.includes(w)));
  return { ...report, governing, maxRatio, pass: maxRatio <= 1 + 1e-9 && detailOK };
}

export interface RowSuggestion {
  n: number;
  report: ShearConnectionReport;
}

/**
 * Smallest number of bolt rows (2–12) for which every strength check and required detailing check
 * passes with the other inputs unchanged. Seated connections are not row-based and return undefined.
 */
export function suggestBoltRows(input: ShearConnectionInput, kit: ConnectionKit = defaultKit, maxRows = 12): RowSuggestion | undefined {
  if (input.type === "seated") return undefined;
  for (let n = 2; n <= maxRows; n++) {
    try {
      const report = designShearConnection({ ...input, bolts: { ...input.bolts, n } }, kit);
      if (report.pass) return { n, report };
    } catch {
      // Geometry outside the beam for this n; larger n will not fit either.
      return undefined;
    }
  }
  return undefined;
}
