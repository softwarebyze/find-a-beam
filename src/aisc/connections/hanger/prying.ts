/**
 * Prying action in tee and angle tension fittings — AISC Manual (16th Ed.) Part 9, "Prying Action".
 * The 16th Ed. formulation uses the tensile strength Fu of the fitting with φ = 0.90 / Ω = 1.67.
 * Units: kip, in., ksi. All forces are PER BOLT on the selected design-method basis
 * (LRFD: factored T and B = φr{n}; ASD: service T and B = r{n}/Ω).
 *
 * Model (Manual Part 9; Thornton 1985): with M₁ at the stem face and M₂ = αδM₁ at the bolt line,
 *   M₁ + M₂ = T b′ and q a′ = M₂, hence q = B δ α ρ (t/t{c})² and T{avail} = B Q.
 */
import type { CalcStep, DesignMethod } from "../../types";
import type { ConnectionResult } from "../types";
import { connection, nonnegative, positive, state } from "../result";

export const PRYING_REF = "Manual Part 9 · prying action";
/** Fitting flexure factors for prying (Manual Part 9, 16th Ed.): φ = 0.90, Ω = 1.67 with Fu. */
export const PRYING_PHI = 0.9;
export const PRYING_OMEGA = 1.67;

export interface PryingInput {
  method: DesignMethod;
  /** Required tension per bolt, T (kips) — LRFD factored or ASD service */
  T: number;
  /** NOMINAL tension strength per bolt r{n} (kips), e.g. F{nt}A{b}; reduce for concurrent shear first */
  rn: number;
  /** Bolt resistance factors (default bolt tension rupture φ = 0.75, Ω = 2.00, §J3.7) */
  boltPhi?: number;
  boltOmega?: number;
  /** Distance from bolt centerline to the face of the tee stem or angle leg, in. */
  b: number;
  /** Distance from bolt centerline to the edge of the fitting flange, in. */
  a: number;
  /** Bolt diameter d{b}, in. */
  db: number;
  /** Width of bolt hole parallel to the fitting length, d′, in. */
  dHole: number;
  /** Tributary length of fitting per bolt, in. */
  p: number;
  /** Fitting flange (or angle leg) thickness, in. */
  t: number;
  /** Fitting tensile strength, ksi */
  Fu: number;
}

export interface PryingResult {
  B: number;
  bPrime: number;
  /** a used in a′ after the 1.25b limit */
  aUsed: number;
  aPrime: number;
  rho: number;
  beta: number;
  delta: number;
  /** α′ for DESIGN (from β), used for t{min} */
  alphaPrimeDesign: number;
  tMin: number;
  tc: number;
  /** α′ for CHECKING the selected thickness */
  alphaPrime: number;
  Q: number;
  /** Available tension per bolt including prying, B·Q */
  Tavail: number;
  /** α mobilized at the applied T (clamped to 0…1) */
  alpha: number;
  /** Prying force per bolt at the applied T */
  q: number;
  /** Bolt force T + q */
  boltForce: number;
  /** Bolt tension including prying, nominal r{n}Q with bolt φ/Ω (available = B·Q) */
  result: ConnectionResult;
  steps: CalcStep[];
  warnings: string[];
}

export function pryingAction(input: PryingInput): PryingResult {
  const { method } = input;
  const T = nonnegative(input.T, "Required tension per bolt");
  const rn = positive(input.rn, "Nominal bolt tension");
  const b = positive(input.b, "b"),
    a = positive(input.a, "a"),
    db = positive(input.db, "Bolt diameter"),
    dHole = positive(input.dHole, "Hole width d′"),
    p = positive(input.p, "Tributary length p"),
    t = positive(input.t, "Fitting thickness"),
    Fu = positive(input.Fu, "Fu");
  const boltPhi = input.boltPhi ?? 0.75,
    boltOmega = input.boltOmega ?? 2;
  const warnings: string[] = [];
  const B = method === "LRFD" ? boltPhi * rn : rn / boltOmega;
  const bPrime = b - db / 2;
  if (!(bPrime > 0)) throw new RangeError("b must exceed d{b}/2: the bolt overlaps the stem face");
  const aUsed = Math.min(a, 1.25 * b);
  const aPrime = aUsed + db / 2;
  const rho = bPrime / aPrime;
  const delta = 1 - dHole / p;
  if (!(delta > 0)) throw new RangeError("Tributary length p must exceed the hole width d′");
  // Plate flexure coefficient: LRFD 1/φ, ASD Ω.
  const k = method === "LRFD" ? 1 / PRYING_PHI : PRYING_OMEGA;

  // ---- Design: α′ from β and minimum thickness
  const beta = T > 0 ? (1 / rho) * (B / T - 1) : Infinity;
  let alphaPrimeDesign: number;
  if (beta >= 1) alphaPrimeDesign = 1;
  else alphaPrimeDesign = Math.min(1, Math.max(0, (1 / delta) * (beta / (1 - beta))));
  if (beta < 0) warnings.push("β < 0: the required tension exceeds the available bolt tension even without prying.");
  const tMin = Math.sqrt((k * 4 * T * bPrime) / (p * Fu * (1 + delta * alphaPrimeDesign)));

  // ---- Check of the selected thickness
  const tc = Math.sqrt((k * 4 * B * bPrime) / (p * Fu));
  const alphaPrime = (1 / (delta * (1 + rho))) * ((tc / t) ** 2 - 1);
  const ratio2 = (t / tc) ** 2;
  const Q = alphaPrime < 0 ? 1 : alphaPrime <= 1 ? ratio2 * (1 + delta * alphaPrime) : ratio2 * (1 + delta);
  const Tavail = B * Q;
  // Prying at the applied load
  const alphaRaw = T > 0 ? (T / (B * ratio2) - 1) / delta : 0;
  const alpha = Math.min(1, Math.max(0, alphaRaw));
  const q = B * delta * alpha * rho * ratio2;
  const boltForce = T + q;
  if (alphaRaw > 1) warnings.push("α > 1 at the applied load: the fitting flange forms a two-hinge mechanism (flexure governs).");
  if (a > 1.25 * b) warnings.push("a exceeds 1.25b; a = 1.25b is used for a′ (Manual Part 9).");

  const ref = PRYING_REF;
  const phiTxt = method === "LRFD" ? "φ = 0.90" : "Ω = 1.67";
  const steps: CalcStep[] = [
    { label: "Available tension per bolt", symbol: "B", value: B, quantity: "force", ref: "§J3.7", expr: method === "LRFD" ? "φr{n}" : "r{n}/Ω" },
    { label: "Required tension per bolt", symbol: "T", value: T, quantity: "force", ref },
    { label: "Bolt line to stem face, reduced", symbol: "b′", value: bPrime, quantity: "length", expr: "b − d{b}/2", ref },
    { label: "Bolt line to flange edge (≤ 1.25b), increased", symbol: "a′", value: aPrime, quantity: "length", expr: "min(a, 1.25b) + d{b}/2", ref },
    { label: "Geometry ratio", symbol: "ρ", value: rho, quantity: "ratio", expr: "b′/a′", ref },
    { label: "Net-to-gross area ratio at bolt line", symbol: "δ", value: delta, quantity: "ratio", expr: "1 − d′/p", ref },
    { label: "Bolt strength ratio", symbol: "β", value: Number.isFinite(beta) ? beta : undefined, quantity: "ratio", expr: "(1/ρ)(B/T − 1)", ref },
    {
      label: "Prying ratio for design",
      symbol: "α′",
      value: alphaPrimeDesign,
      quantity: "ratio",
      expr: "β ≥ 1: 1.0; else min[1, (1/δ)(β/(1 − β))]",
      ref,
    },
    {
      label: `Minimum thickness for no bolt overload (${phiTxt})`,
      symbol: "t{min}",
      value: tMin,
      quantity: "length",
      expr: method === "LRFD" ? "√[4Tb′/(φpF{u}(1 + δα′))]" : "√[Ω4Tb′/(pF{u}(1 + δα′))]",
      ref,
    },
    {
      label: "Thickness to develop B without prying",
      symbol: "t{c}",
      value: tc,
      quantity: "length",
      expr: method === "LRFD" ? "√[4Bb′/(φpF{u})]" : "√[Ω4Bb′/(pF{u})]",
      ref,
    },
    { label: "Prying ratio for the selected thickness", symbol: "α′", value: alphaPrime, quantity: "ratio", expr: "[1/(δ(1 + ρ))][(t{c}/t)² − 1]", ref },
    {
      label: "Prying factor",
      symbol: "Q",
      value: Q,
      quantity: "ratio",
      expr: "α′ < 0: 1;  0 ≤ α′ ≤ 1: (t/t{c})²(1 + δα′);  α′ > 1: (t/t{c})²(1 + δ)",
      ref,
    },
    { label: "Available tension per bolt including prying", symbol: "T{avail}", value: Tavail, quantity: "force", expr: "BQ", ref },
    { label: "Prying force per bolt at the required load", symbol: "q", value: q, quantity: "force", expr: "Bδαρ(t/t{c})², α = [(T/B)(t{c}/t)² − 1]/δ, 0 ≤ α ≤ 1", ref },
    { label: "Bolt force including prying", symbol: "T + q", value: boltForce, quantity: "force", ref },
  ];
  const ls = state("PRY", "Bolt tension including prying", rn * Q, ref, "r{n}Q  (available = BQ)", boltPhi, boltOmega);
  ls.steps = [...steps];
  const result = connection(`${ref} — tension per bolt`, [ls], [], warnings);
  return {
    B,
    bPrime,
    aUsed,
    aPrime,
    rho,
    beta,
    delta,
    alphaPrimeDesign,
    tMin,
    tc,
    alphaPrime,
    Q,
    Tavail,
    alpha,
    q,
    boltForce,
    result,
    steps,
    warnings,
  };
}
