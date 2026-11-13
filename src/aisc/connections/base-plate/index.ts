/** AISC Design Guide 1, third edition, §§4.3.1, 4.3.3, 4.3.5, 4.3.7; AISC 360-22 §J8. */
import type { DesignMethod, CalcStep } from "../../types";
import { familyOf, req, num, type Shape } from "@/data/shapes";
import { boltArea } from "@/aisc/connections";
import { connectionResult, connectionCheck, positiveInputs, type ConnectionCheck } from "../concentrated-forces";

export type AnchorGrade = "36" | "55" | "105";
export const ANCHOR_GRADES: Record<AnchorGrade, { Fy: number; Fu: number }> = {
  "36": { Fy: 36, Fu: 58 },
  "55": { Fy: 55, Fu: 75 },
  "105": { Fy: 105, Fu: 125 },
};
export interface BasePlateInput {
  P: number;
  M?: number;
  V?: number;
  N: number;
  B: number;
  thickness: number;
  fc: number;
  Fy: number;
  pedestalN: number;
  pedestalB: number;
  method?: DesignMethod;
  anchorDiameter: number;
  anchorGrade: AnchorGrade;
  anchorCount: number;
  anchorEdge: number;
  /** Only leading row assumed effective in shear unless load equalization is established. */
  friction?: boolean;
  frictionCoefficient?: number;
}
export interface BasePlateResult {
  checks: ConnectionCheck[];
  pass: boolean;
  ratio: number;
  steps: CalcStep[];
  warnings: string[];
  A1: number;
  A2: number;
  bearingFactor: number;
  fpMax: number;
  fp: number;
  m: number;
  n: number;
  lambda: number;
  nPrime: number;
  ell: number;
  eccentricity: number;
  ecrit: number;
  f: number;
  Y: number;
  tension: number;
  compression: number;
  requiredThickness: number;
  compressionThickness: number;
  tensionThickness: number;
  regime: "concentric" | "small moment" | "large moment";
  equilibrium: boolean;
  anchorTensionPerRod: number;
  anchorShearPerRod: number;
  frictionCapacity: number;
}
/** DG1 uniform bearing block; P ≥ 0 is compression, M is uniaxial strong-axis bending. */
export function basePlate(shape: Shape, input: BasePlateInput): BasePlateResult {
  const { P, N, B, fc, Fy, thickness: t, pedestalN, pedestalB } = input,
    M = Math.abs(input.M ?? 0),
    V = Math.abs(input.V ?? 0),
    method = input.method ?? "LRFD";
  positiveInputs({ P, M, V }, true);
  positiveInputs({
    N,
    B,
    fc,
    Fy,
    thickness: t,
    pedestalN,
    pedestalB,
    anchorDiameter: input.anchorDiameter,
    anchorEdge: input.anchorEdge,
  });
  if (!Number.isInteger(input.anchorCount) || input.anchorCount < 4 || input.anchorCount % 2)
    throw new Error("Use an even anchor count of at least four in two symmetric rows.");
  const family = familyOf(shape);
  if (!["i-shape", "hss-rect", "hss-round"].includes(family))
    throw new Error("Base plate requires a rolled I-shape or HSS column.");
  const d = family === "hss-round" ? req(shape, "OD") : family === "hss-rect" ? req(shape, "Ht") : req(shape, "d");
  const bf = family === "hss-round" ? d : family === "hss-rect" ? req(shape, "B") : req(shape, "bf");
  if (N <= d || B <= bf) throw new Error("Plate must extend beyond the column footprint.");
  if (pedestalN < N || pedestalB < B) throw new Error("Pedestal must support the full base plate.");
  if (input.anchorEdge >= Math.min((N - d) / 2, (B - bf) / 2))
    throw new Error("Anchor rows must be outside the column footprint and inside the plate.");
  if (input.anchorEdge < 1.5 * input.anchorDiameter)
    throw new Error("Anchor center-to-plate edge distance must be at least 1.5 diameters for this layout.");
  if (!ANCHOR_GRADES[input.anchorGrade]) throw new Error("Select F1554 grade 36, 55, or 105.");
  if ((B - 2 * input.anchorEdge) / (input.anchorCount / 2 - 1) < 3 * input.anchorDiameter)
    throw new Error("Anchor spacing along a row must be at least three diameters for this layout.");
  const A1 = N * B,
    scale = Math.min(pedestalN / N, pedestalB / B),
    A2 = A1 * scale ** 2;
  const bearingFactor = Math.min(2, Math.sqrt(A2 / A1)),
    nominalFp = 0.85 * fc * bearingFactor;
  const concreteFactor = method === "LRFD" ? 0.65 : 1 / 2.31,
    flexFactor = method === "LRFD" ? 0.9 : 1 / 1.67;
  const fpMax = concreteFactor * nominalFp,
    qmax = fpMax * B;
  const m = (N - (family === "hss-round" ? 0.8 : 0.95) * d) / 2;
  const n = (B - (family === "i-shape" || family === "hss-round" ? 0.8 : 0.95) * bf) / 2;
  const nPrime = family === "i-shape" ? Math.sqrt(d * bf) / 4 : 0;
  const X = Math.min(1, (((4 * d * bf) / (d + bf) ** 2) * P) / (fpMax * A1));
  const lambda = Math.min(1, (2 * Math.sqrt(X)) / (1 + Math.sqrt(1 - X))),
    ell = Math.max(m, n, lambda * nPrime);
  const e = P > 0 ? M / P : M > 0 ? Infinity : 0,
    ecrit = N / 2 - P / (2 * qmax),
    f = N / 2 - input.anchorEdge;
  let Y = N,
    fp = P / A1,
    tension = 0,
    equilibrium = true;
  const regime = M === 0 ? "concentric" : e <= ecrit ? "small moment" : "large moment";
  if (regime === "small moment") {
    Y = N - 2 * e;
    fp = P / (B * Y);
  }
  if (regime === "large moment") {
    const L = N / 2 + f,
      disc = L ** 2 - (2 * (M + P * f)) / qmax;
    if (disc < 0) {
      equilibrium = false;
      Y = 0;
      fp = fpMax;
      tension = Infinity;
    } else {
      Y = L - Math.sqrt(disc);
      fp = fpMax;
      tension = Math.max(0, qmax * Y - P);
      if (Y <= 0 || Y > N || qmax * Y < P - 1e-8) equilibrium = false;
    }
  }
  const compression = P + tension;
  const cantileverMoment = (l: number) => fp * (Y >= l ? (l * l) / 2 : Y * (l - Y / 2));
  const mc =
    regime === "concentric"
      ? (fp * ell ** 2) / 2
      : Math.max(cantileverMoment(m), cantileverMoment(n), (fp * (lambda * nPrime) ** 2) / 2);
  const compressionThickness = equilibrium ? Math.sqrt((4 * mc) / (flexFactor * Fy)) : Infinity;
  const tf = num(shape, "tf") ?? num(shape, "tdes") ?? 0,
    x = Math.max(0, f - (d - tf) / 2);
  const mt = (tension * x) / B,
    tensionThickness = Math.sqrt((4 * mt) / (flexFactor * Fy));
  const requiredThickness = Math.max(compressionThickness, tensionThickness);
  const grade = ANCHOR_GRADES[input.anchorGrade],
    area = boltArea(input.anchorDiameter),
    rowCount = input.anchorCount / 2;
  // BoltSpec deliberately contains only structural bolt grades. F1554 is a threaded part:
  // use its actual Fu, §J3 Table J3.2 (0.75Fu tension / 0.45Fu shear, threads included).
  const anchorRnT = 0.75 * grade.Fu * area,
    anchorRnV = 0.45 * grade.Fu * area;
  const boltFactor = method === "LRFD" ? 0.75 : 0.5;
  const warnings = [
    "ACI 318 Chapter 17 concrete breakout, pullout, pryout, side-face blowout, embedment and reinforcement design are OUT OF SCOPE. Steel-only PASS is not an anchorage approval.",
    "Column-to-base-plate welds, anchor washer bending, hole clearances, grout and rod bending require separate design. Two symmetric anchor rows outside the column footprint are assumed.",
    "A2 is the largest concentric, geometrically similar supporting area within the centered pedestal; it is not the entire pedestal area in general.",
  ];
  const mu = input.frictionCoefficient ?? 0.4;
  positiveInputs({ frictionCoefficient: mu }, true);
  // DG1 Eq.4-30: φfriction=0.65; credit only applied compression, never anchor clamping.
  const frictionCapacity =
    input.friction && method === "LRFD" ? Math.min(0.65 * mu * P, 0.75 * Math.min(0.2 * fc, 0.8) * B * Y) : 0;
  if (input.friction && method === "ASD")
    warnings.push("DG1 §4.3.5 gives LRFD friction provisions only; no friction credit is taken for ASD.");
  const rodV = Math.max(0, V - frictionCapacity),
    anchorTensionPerRod = tension / rowCount,
    anchorShearPerRod = rodV / rowCount;
  const vRatio = anchorShearPerRod / (boltFactor * anchorRnV),
    remainingT = Math.max(0, 1 - vRatio);
  const checks: ConnectionCheck[] = [];
  const add = (
    id: string,
    label: string,
    demand: number,
    rn: number,
    phi: number,
    omega: number,
    ref: string,
    expr: string,
  ) => checks.push(connectionCheck(id, label, demand, connectionResult(id, label, rn, phi, omega, ref, expr), method));
  add(
    "bearing",
    "Concrete bearing",
    equilibrium ? fp * B * Y : Infinity,
    nominalFp * B * Y,
    0.65,
    2.31,
    "§J8; Eqs. J8-1, J8-2",
    "0.85 f′{c} A{bearing} min(√(A{2}/A{1}), 2)",
  );
  // Express plate moment checks as equivalent force demands/capacities for cited common reports.
  add(
    "plate-compression",
    "Plate at compression interface",
    equilibrium ? (mc * B) / ell : Infinity,
    (Fy * B * t * t) / (4 * ell),
    0.9,
    1.67,
    "DG1 Eqs. 4-47–4-52",
    "F{y} B t{p}² / (4 ℓ); equivalent force demand = M{plate} B/ℓ",
  );
  add(
    "plate-tension",
    "Plate at tension interface",
    tension,
    x > 0 ? (Fy * B * t * t) / (4 * x) : Number.MAX_VALUE,
    0.9,
    1.67,
    "DG1 Eqs. 4-60–4-62",
    "F{y} B t{p}² / (4 x)",
  );
  add(
    "anchor-tension",
    "Anchor rod steel tension (each)",
    anchorTensionPerRod,
    anchorRnT,
    0.75,
    2,
    "§J3.7; Table J3.2",
    "0.75 F{u} A{b}",
  );
  add(
    "anchor-shear",
    "Anchor rod steel shear (each leading row)",
    anchorShearPerRod,
    anchorRnV,
    0.75,
    2,
    "§J3.7; Table J3.2",
    "0.45 F{u} A{b}",
  );
  add(
    "anchor-combined",
    "Anchor steel interaction (conservative linear)",
    anchorTensionPerRod,
    anchorRnT * remainingT,
    0.75,
    2,
    "§J3.8; DG1 §4.3.4",
    "R{nt} max(0, 1 − V{rod}/V{available})",
  );
  warnings.push(
    "Anchor interaction uses conservative linear T/Tc + V/Vc ≤ 1. Only one leading row resists shear; plate washers/load transfer and rod bending must be detailed.",
  );
  if (!equilibrium)
    warnings.push(
      "No admissible uniform bearing-block equilibrium. Increase plate dimensions or revise the anchor layout.",
    );
  const steps: CalcStep[] = [
    { label: "Plate bearing area", symbol: "A{1}", value: A1, quantity: "area", ref: "§J8" },
    { label: "Effective supporting area", symbol: "A{2}", value: A2, quantity: "area", ref: "§J8" },
    { label: "Concrete confinement factor (capped at 2)", value: bearingFactor, quantity: "ratio", ref: "Eq. J8-2" },
    { label: "Maximum available bearing pressure", symbol: "f{p(max)}", value: fpMax, quantity: "stress", ref: "§J8" },
    { label: "Cantilever m", value: m, quantity: "length", ref: "DG1 Eq. 4-10" },
    { label: "Cantilever n", value: n, quantity: "length", ref: "DG1 Eq. 4-11" },
    { label: "Interior yield-line distance", symbol: "n′", value: nPrime, quantity: "length", ref: "DG1 Eq. 4-12" },
    { label: "Yield-line factor", symbol: "λ", value: lambda, quantity: "ratio", ref: "DG1 Eq. 4-13" },
    { label: "Controlling axial cantilever", symbol: "ℓ", value: ell, quantity: "length", ref: "DG1 Eq. 4-15" },
    { label: "Load eccentricity", symbol: "e", value: e, quantity: "length", ref: "DG1 Eq. 4-39" },
    { label: "Critical eccentricity", symbol: "e{crit}", value: ecrit, quantity: "length", ref: "DG1 Eq. 4-40" },
    { label: "Centerline to tension anchor row", symbol: "f", value: f, quantity: "length", ref: "DG1 Fig. 4-8" },
    {
      label: "Bearing-block length",
      symbol: "Y",
      value: Y,
      quantity: "length",
      ref: regime === "large moment" ? "DG1 Eq. 4-58" : "DG1 Eq. 4-42",
    },
    { label: "Uniform bearing pressure", symbol: "f{p}", value: fp, quantity: "stress", ref: "DG1 Eq. 4-46" },
    { label: "Total anchor tension", symbol: "T", value: tension, quantity: "force", ref: "DG1 Eq. 4-55" },
    {
      label: "Required plate thickness, compression",
      value: compressionThickness,
      quantity: "length",
      ref: "DG1 Eqs. 4-51, 4-52",
    },
    { label: "Required plate thickness, tension", value: tensionThickness, quantity: "length", ref: "DG1 Eq. 4-62" },
    { label: "Available friction transfer", value: frictionCapacity, quantity: "force", ref: "DG1 Eq. 4-30" },
  ];
  const ratio = Math.max(0, ...checks.map((c) => c.ratio));
  return {
    checks,
    pass: equilibrium && ratio <= 1 + 1e-9,
    ratio,
    steps,
    warnings,
    A1,
    A2,
    bearingFactor,
    fpMax,
    fp,
    m,
    n,
    lambda,
    nPrime,
    ell,
    eccentricity: e,
    ecrit,
    f,
    Y,
    tension,
    compression,
    requiredThickness,
    compressionThickness,
    tensionThickness,
    regime,
    equilibrium,
    anchorTensionPerRod,
    anchorShearPerRod,
    frictionCapacity,
  };
}
/** Finite grid search: minimum area (1-in. grid), then minimum thickness rounded up to 1/8 in. */
export function sizeBasePlate(
  shape: Shape,
  input: BasePlateInput,
): { N: number; B: number; thickness: number } | undefined {
  const candidates: { N: number; B: number; thickness: number }[] = [];
  for (let N = Math.ceil(Math.max(8, input.anchorEdge * 2 + 2)); N <= Math.min(72, input.pedestalN); N++)
    for (let B = 8; B <= Math.min(72, input.pedestalB); B++) {
      try {
        const trial = basePlate(shape, { ...input, N, B, thickness: 8 });
        if (!trial.equilibrium || trial.checks.some((c) => !c.id.startsWith("plate-") && c.ratio > 1 + 1e-9)) continue;
        const thickness = Math.max(0.5, Math.ceil(trial.requiredThickness * 8) / 8);
        if (thickness <= 8) candidates.push({ N, B, thickness });
      } catch {
        /* inadmissible geometry */
      }
    }
  return candidates.sort((a, b) => a.N * a.B - b.N * b.B || a.thickness - b.thickness)[0];
}
export const evaluateBasePlate = basePlate;
