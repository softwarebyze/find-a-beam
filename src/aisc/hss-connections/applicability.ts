/**
 * Limits of applicability — Tables K1.1A, K1.2A, K2.1A, K2.2A, K3.1A and K3.2A.
 *
 * The Chapter K strength equations were calibrated inside these parameter ranges only. A joint that
 * violates any of them is reported as a FAILED check rather than given a strength, which is why
 * every result carries `applicable` alongside its limit states.
 */
import { E } from "@/data/materials";
import type { ApplicabilityCheck } from "./types";
import { check, within } from "./result";

export interface MaterialRole {
  Fy: number;
  Fu: number;
  label: string;
  role: string;
}

/** Fy ≤ 52 ksi is a hard limit of applicability for every Chapter K connection. */
export function materialChecks(members: MaterialRole[], ref: string): ApplicabilityCheck[] {
  return members.map((m) =>
    check(`fy-${m.role}`, `${m.role} specified yield stress`, "F{y}", m.Fy, "≤ 52 ksi", m.Fy <= 52 + 1e-9, ref),
  );
}

/**
 * Chapter K also assumes adequate material ductility. AISC meets it by limiting the permitted ASTM
 * specifications rather than by a numeric test, so the underlying Fy/Fu ≤ 0.8 ratio is reported as a
 * note: the nominal values of A500 Gr. C (50/62 = 0.81) sit just outside it.
 */
export function ductilityWarnings(members: MaterialRole[]): string[] {
  return members
    .filter((m) => m.Fy / m.Fu > 0.8 + 1e-9)
    .map(
      (m) =>
        `${m.label}: F{y}/F{u} = ${(m.Fy / m.Fu).toFixed(2)} exceeds the 0.8 ductility ratio the Chapter K equations assume. Acceptable for the ASTM specifications AISC lists for HSS connections; confirm the grade.`,
    );
}

export const angleCheck = (theta: number, ref: string, min = 30): ApplicabilityCheck =>
  check("theta", "Branch angle to the chord", "θ", theta, `≥ ${min}°`, theta >= min - 1e-9 && theta <= 90 + 1e-9, ref);

export const slendernessCheck = (
  id: string,
  label: string,
  symbol: string,
  value: number,
  limit: number,
  ref: string,
): ApplicabilityCheck => check(id, label, symbol, value, `≤ ${limit}`, value <= limit + 1e-9, ref);

/** Db/tb ≤ 0.05E/Fy (round) or Bb/tb ≤ 1.25√(E/Fyb) (rectangular) for a compression branch. */
export function compressionBranchCheck(
  family: "round" | "rect",
  slenderness: number,
  Fyb: number,
  ref: string,
): ApplicabilityCheck {
  const limit = family === "round" ? (0.05 * E) / Fyb : 1.25 * Math.sqrt(E / Fyb);
  return check(
    "branch-compression",
    "Compression branch wall slenderness",
    family === "round" ? "D{b}/t{b}" : "B{b}/t{b}",
    slenderness,
    `≤ ${limit.toFixed(1)}`,
    slenderness <= limit + 1e-9,
    ref,
  );
}

export const betaCheck = (
  beta: number,
  lo: number,
  hi: number,
  ref: string,
  exclusiveLo = false,
  symbol = "β",
): ApplicabilityCheck =>
  check(
    "beta",
    "Width ratio",
    symbol,
    beta,
    `${exclusiveLo ? ">" : "≥"} ${lo} and ≤ ${hi}`,
    within(beta, lo, hi, exclusiveLo),
    ref,
  );

export const aspectCheck = (id: string, label: string, symbol: string, value: number, ref: string) =>
  check(id, label, symbol, value, "0.5 ≤ … ≤ 2.0", within(value, 0.5, 2.0), ref);

/** Gapped K: the gap must clear both branch walls, g ≥ tb1 + tb2. */
export const gapCheck = (g: number, tb1: number, tb2: number, ref: string): ApplicabilityCheck =>
  check(
    "gap",
    "Gap between branch toes",
    "g",
    g,
    `≥ t{b1} + t{b2} = ${(tb1 + tb2).toFixed(3)} in.`,
    g >= tb1 + tb2 - 1e-9,
    ref,
  );

/** Rectangular gapped K additionally needs ζ = g/B ≥ 0.5(1 − βeff). */
export const zetaCheck = (zeta: number, betaEff: number, ref: string): ApplicabilityCheck => {
  const limit = 0.5 * (1 - betaEff);
  return check("zeta", "Gap ratio", "ζ", zeta, `≥ 0.5(1 − β{eff}) = ${limit.toFixed(3)}`, zeta >= limit - 1e-9, ref);
};

export const overlapChecks = (
  Ov: number,
  ratioBi: number,
  thicknessRatio: number,
  ref: string,
): ApplicabilityCheck[] => [
  check("ov", "Overlap", "O{v}", Ov, "25% ≤ O{v} ≤ 100%", within(Ov, 25, 100), ref),
  check(
    "ov-width",
    "Overlapping-to-overlapped branch width",
    "B{bi}/B{bj}",
    ratioBi,
    "≥ 0.75",
    ratioBi >= 0.75 - 1e-9,
    ref,
  ),
  check(
    "ov-thickness",
    "Overlapping branch not thicker than overlapped",
    "t{bi}/t{bj}",
    thicknessRatio,
    "≤ 1.0",
    thicknessRatio <= 1 + 1e-9,
    ref,
  ),
];

export const allOk = (checks: ApplicabilityCheck[]) => checks.every((c) => c.ok);
