/**
 * Hanger and tension connections — AISC Manual (16th Ed.) Part 9; ANSI/AISC 360-22 §§J3, J4.
 *  - Tee or angle tension fittings bolted through the flange, with prying action.
 *  - Simple hanger plates (bolted or welded).
 * Units: kip, in., ksi. Demands are on the selected design-method basis.
 */
import { familyOf, num, req, SHAPES, type Shape } from "@/data/shapes";
import type { CalcStep, DesignMethod } from "../../types";
import { blockShear, shearLagReport } from "../../tension";
import {
  boltBearing,
  boltShear,
  boltTension,
  elementShearRupture,
  elementTensionRupture,
  elementTensionYielding,
  filletWeld,
  minEdgeDistance,
  nominalHoleDiameter,
  type BoltSpec,
  type ConnectionResult,
} from "@/aisc/connections";
import { connection, count, positive, state } from "../result";
import { connectionCheck, type ConnectionCheck } from "../concentrated-forces";
import { pryingAction, PRYING_REF, type PryingResult } from "./prying";

export { pryingAction, PRYING_REF, PRYING_PHI, PRYING_OMEGA } from "./prying";
export type { PryingInput, PryingResult } from "./prying";

export interface DesignSummary {
  checks: ConnectionCheck[];
  ratio: number;
  pass: boolean;
  steps: CalcStep[];
  warnings: string[];
}

export function summarize(checks: ConnectionCheck[], steps: CalcStep[], warnings: string[]): DesignSummary {
  const ratio = Math.max(0, ...checks.map((c) => c.ratio));
  return { checks, ratio, pass: ratio <= 1 + 1e-9, steps, warnings };
}

// ---------------------------------------------------------------------------------------------
// Tee / angle tension fitting
// ---------------------------------------------------------------------------------------------

export interface FittingMaterial {
  Fy: number;
  Fu: number;
}

export interface TensionFittingInput {
  method: DesignMethod;
  /** Total required tension on the fitting (all bolts), kips */
  P: number;
  /** WT/MT/ST (two bolt lines, one each side of the stem) or L (one line per angle) */
  fitting: Shape;
  material: FittingMaterial;
  bolt: BoltSpec;
  /** Bolts per line along the fitting length */
  rows: number;
  /** Tee: gage between the two bolt lines (center to center). Angle: gage from the heel to the bolt line. */
  gage: number;
  /** Fitting length along the bolt lines, in. */
  length: number;
  /** Angle fittings: 1 (single) or 2 (back-to-back pair, one bolt line each). */
  angles?: 1 | 2;
  /** Angle fittings: the leg bolted to the support (default the longer leg). */
  boltedLeg?: "long" | "short";
}

export interface TensionFittingResult extends DesignSummary {
  kind: "tee" | "angle";
  prying: PryingResult;
  /** Bolt count and force per bolt */
  n: number;
  Tbolt: number;
  /** Fitting geometry used */
  t: number;
  tStem: number;
  b: number;
  a: number;
  p: number;
  flangeWidth: number;
  stemDepth: number;
}

/** Angle leg lengths: [bolted leg, outstanding (stem) leg]. */
function angleLegs(s: Shape, boltedLeg: "long" | "short"): [number, number] {
  const L1 = req(s, "b"),
    L2 = req(s, "d");
  const long = Math.max(L1, L2),
    short = Math.min(L1, L2);
  return boltedLeg === "long" ? [long, short] : [short, long];
}

export function tensionFitting(input: TensionFittingInput): TensionFittingResult {
  const { method, fitting, material, bolt } = input;
  const P = positive(input.P, "Required tension");
  const rows = count(input.rows, "Bolts per line");
  const g = positive(input.gage, "Gage");
  const L = positive(input.length, "Fitting length");
  const fam = familyOf(fitting);
  if (fam !== "tee" && fam !== "angle") throw new RangeError("Select a WT/MT/ST tee or a single angle (L) fitting");
  const kind = fam === "tee" ? "tee" : "angle";
  const angles = input.angles ?? 1;
  const warnings: string[] = [];
  let t: number, tStem: number, b: number, a: number, flangeWidth: number, stemDepth: number, lines: number, stemCount: number;
  if (kind === "tee") {
    t = req(fitting, "tf");
    tStem = req(fitting, "tw");
    flangeWidth = req(fitting, "bf");
    stemDepth = req(fitting, "d");
    b = (g - tStem) / 2;
    a = (flangeWidth - g) / 2;
    lines = 2;
    stemCount = 1;
    if (a <= 0) throw new RangeError("Gage exceeds the tee flange width");
  } else {
    t = req(fitting, "t");
    tStem = t;
    const [leg, out] = angleLegs(fitting, input.boltedLeg ?? "long");
    flangeWidth = leg;
    stemDepth = out;
    b = g - t;
    a = leg - g;
    lines = angles;
    stemCount = angles;
    if (a <= 0) throw new RangeError("Gage exceeds the bolted leg length");
  }
  if (!(b > bolt.d / 2)) throw new RangeError("Gage too small: the bolt falls within the stem or leg (b ≤ d{b}/2)");
  const n = rows * lines;
  const Tbolt = P / n;
  const p = L / rows;
  const dHole = nominalHoleDiameter(bolt.d);
  const tens = boltTension(bolt);
  const rn = tens.nominal;
  const prying = pryingAction({ method, T: Tbolt, rn, b, a, db: bolt.d, dHole, p, t, Fu: material.Fu });

  const checks: ConnectionCheck[] = [];
  checks.push(connectionCheck("PRY", "Bolt tension including prying (per bolt)", Tbolt, prying.result, method));
  // Fitting flexure at the stem face — the α′ = 1 mechanism (two plastic hinges), Fu basis.
  const bPrime = prying.bPrime;
  const flex = connection(`${PRYING_REF} — fitting flexure`, [
    {
      ...state("FF", "Fitting flexure (two-hinge mechanism)", (material.Fu * p * t ** 2 * (1 + prying.delta)) / (4 * bPrime), PRYING_REF, "F{u}pt²(1 + δ)/(4b′)", 0.9, 1.67),
    },
  ]);
  flex.limitStates[0]!.steps.unshift(
    { label: "Fitting thickness", symbol: "t", value: t, quantity: "length", ref: kind === "tee" ? "t{f}" : "t" },
    { label: "Tributary length per bolt", symbol: "p", value: p, quantity: "length", expr: "L/n{rows}", ref: PRYING_REF },
  );
  checks.push(connectionCheck("FF", "Fitting flange flexure (per bolt)", Tbolt, flex, method));
  const Ag = tStem * L * stemCount;
  const stemY = elementTensionYielding({ Fy: material.Fy, Fu: material.Fu, Ag });
  stemY.steps.push({ label: kind === "tee" ? "Stem gross area t{w}L" : "Outstanding leg gross area tL", symbol: "A{g}", value: Ag, quantity: "area", ref: "§J4.1" });
  checks.push(connectionCheck("STY", kind === "tee" ? "Tee stem tension yielding" : "Angle leg tension yielding", P, stemY, method));
  const stemR = elementTensionRupture({ Fy: material.Fy, Fu: material.Fu, Ag, An: Ag, Ae: Ag });
  checks.push(connectionCheck("STR", kind === "tee" ? "Tee stem tension rupture (welded attachment)" : "Angle leg tension rupture (welded attachment)", P, stemR, method));
  warnings.push("Stem rupture assumes the hanger is welded across the full stem; deduct holes and apply shear lag (§D3) if the stem is bolted.");

  const minEdge = minEdgeDistance(bolt.d);
  if (a < minEdge) warnings.push(`Edge distance a below the Table J3.4 minimum (${minEdge} in.).`);
  if (p > 2 * b + bolt.d && rows > 1) warnings.push("Tributary length p is large relative to b; the effective flange length per bolt may be overestimated (Manual Part 9).");
  if (kind === "angle") warnings.push("Angle fittings: b is measured from the bolt centerline to the face of the outstanding leg (b = g − t).");
  warnings.push(...prying.warnings);

  const steps: CalcStep[] = [
    { label: "Bolts in tension", symbol: "n", value: n, quantity: "ratio", ref: PRYING_REF },
    { label: "Required tension per bolt", symbol: "T", value: Tbolt, quantity: "force", expr: "P/n", ref: PRYING_REF },
    { label: "Nominal bolt tension", symbol: "r{n}", value: rn, quantity: "force", expr: "F{nt}A{b}", ref: "Eq. J3-1" },
    {
      label: kind === "tee" ? "Bolt centerline to stem face" : "Bolt centerline to outstanding-leg face",
      symbol: "b",
      value: b,
      quantity: "length",
      expr: kind === "tee" ? "(g − t{w})/2" : "g − t",
      ref: PRYING_REF,
    },
    {
      label: "Bolt centerline to flange edge",
      symbol: "a",
      value: a,
      quantity: "length",
      expr: kind === "tee" ? "(b{f} − g)/2" : "leg − g",
      ref: PRYING_REF,
    },
  ];
  return {
    ...summarize(checks, steps, warnings),
    kind,
    prying,
    n,
    Tbolt,
    t,
    tStem,
    b,
    a,
    p,
    flangeWidth,
    stemDepth,
  };
}

/** Lightest tee (WT) in the database satisfying all fitting checks for the given bolts and geometry. */
export function lightestTeeFitting(
  input: Omit<TensionFittingInput, "fitting">,
  types: string[] = ["WT"],
): { shape: Shape; result: TensionFittingResult } | undefined {
  const pool = SHAPES.filter((s) => types.includes(s.type)).slice().sort((x, y) => (num(x, "W") ?? 0) - (num(y, "W") ?? 0));
  for (const shape of pool) {
    const bf = num(shape, "bf"),
      tw = num(shape, "tw");
    if (bf === undefined || tw === undefined) continue;
    if (bf - input.gage < 2 * minEdgeDistance(input.bolt.d)) continue;
    if ((input.gage - tw) / 2 <= input.bolt.d / 2 + 1e-9) continue;
    try {
      const result = tensionFitting({ ...input, fitting: shape });
      if (result.pass) return { shape, result };
    } catch {
      continue;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Simple hanger plate
// ---------------------------------------------------------------------------------------------

export type HangerPlateAttachment =
  | {
      kind: "bolted";
      bolt: BoltSpec;
      /** Bolt rows along the load */
      rows: number;
      /** Bolt columns across the plate width */
      cols: number;
      pitch: number;
      gage: number;
      /** End distance from the last row to the plate end (along the load), in. */
      endDistance: number;
      /** Shear planes per bolt (2 when the plate is sandwiched between two plies) */
      planes?: number;
    }
  | {
      kind: "welded";
      /** Fillet weld leg size, in. */
      w: number;
      /** Length of EACH of the two longitudinal welds, in. */
      length: number;
      FEXX?: number;
    };

export interface HangerPlateInput {
  method: DesignMethod;
  P: number;
  width: number;
  t: number;
  Fy: number;
  Fu: number;
  attachment: HangerPlateAttachment;
}

export function hangerPlate(input: HangerPlateInput): DesignSummary & { An: number; Ae: number } {
  const { method, attachment: at } = input;
  const P = positive(input.P, "Required tension"),
    w = positive(input.width, "Plate width"),
    t = positive(input.t, "Plate thickness");
  const { Fy, Fu } = input;
  const Ag = w * t;
  const checks: ConnectionCheck[] = [];
  const steps: CalcStep[] = [{ label: "Plate gross area", symbol: "A{g}", value: Ag, quantity: "area", expr: "wt", ref: "§J4.1" }];
  const warnings: string[] = [];
  checks.push(connectionCheck("TY", "Plate tension yielding", P, elementTensionYielding({ Fy, Fu, Ag }), method));
  let An = Ag,
    Ae = Ag;
  if (at.kind === "bolted") {
    const rows = count(at.rows, "Rows"),
      cols = count(at.cols, "Columns");
    const dh = nominalHoleDiameter(at.bolt.d),
      dEff = dh + 1 / 16;
    const s = positive(at.pitch, "Pitch"),
      Le = positive(at.endDistance, "End distance");
    const gAcross = cols > 1 ? positive(at.gage, "Gage") : 0;
    const side = (w - (cols - 1) * gAcross) / 2;
    if (!(side > dh / 2)) throw new RangeError("Bolt columns do not fit within the plate width");
    An = (w - cols * dEff) * t;
    Ae = An;
    steps.push({ label: "Net area across one row", symbol: "A{n}", value: An, quantity: "area", expr: "(w − n(d{h} + 1/16))t", ref: "§B4.3b" });
    checks.push(connectionCheck("TR", "Plate tension rupture", P, elementTensionRupture({ Fy, Fu, Ag, An, Ae }), method));
    // Block shear: (i) interior block between outer lines; (ii) two outer strips to the plate edges.
    const Lv = Le + (rows - 1) * s;
    const Agv = 2 * Lv * t,
      Anv = 2 * (Lv - (rows - 0.5) * dEff) * t;
    const blocks: { name: string; Ant: number }[] = [];
    if (cols > 1) blocks.push({ name: "between outer bolt lines", Ant: ((cols - 1) * gAcross - (cols - 1) * dEff) * t });
    blocks.push({ name: "outer lines to plate edges", Ant: 2 * (side - 0.5 * dEff) * t });
    let best: ConnectionResult | undefined;
    for (const blk of blocks) {
      if (!(blk.Ant > 0) || !(Anv > 0)) continue;
      const bs = blockShear({ Agv, Anv, Ant: blk.Ant, Fy, Fu, method });
      const r = connection(`§J4.3 Block shear — ${blk.name}`, bs.limitStates, [
        { label: "Gross shear area", symbol: "A{gv}", value: Agv, quantity: "area", ref: "§J4.3" },
        { label: "Net shear area", symbol: "A{nv}", value: Anv, quantity: "area", ref: "§J4.3" },
        { label: "Net tension area", symbol: "A{nt}", value: blk.Ant, quantity: "area", ref: "§J4.3" },
      ]);
      if (!best || r.nominal < best.nominal) best = r;
    }
    if (best) checks.push(connectionCheck("BS", "Plate block shear", P, best, method));
    // Bolts: per-bolt min(shear, bearing, tearout)
    const shear = boltShear({ bolt: at.bolt, planes: at.planes ?? 1 });
    const endBr = boltBearing({ d: at.bolt.d, t, Fu, lc: Le - dh / 2 });
    const intBr = boltBearing({ d: at.bolt.d, t, Fu, lc: s - dh });
    const rnEnd = Math.min(shear.nominal, endBr.nominal),
      rnInt = Math.min(shear.nominal, intBr.nominal);
    const total = cols * (rnEnd + (rows - 1) * rnInt);
    const group = connection("§J3.7, §J3.11 Bolt group: shear, bearing and tearout", [
      {
        ...state("BG", "Bolt group strength", total, "§J3.7; Eqs. J3-6a, J3-6c", "n{cols}[min(r{nv}, r{n,end}) + (n{rows} − 1)min(r{nv}, r{n,int})]"),
        steps: [
          { label: "Bolt shear per bolt", symbol: "r{nv}", value: shear.nominal, quantity: "force", ref: "Eq. J3-1" },
          { label: "Bearing/tearout, end bolt (l{c} = L{e} − d{h}/2)", symbol: "r{n,end}", value: endBr.nominal, quantity: "force", ref: "Eqs. J3-6a, J3-6c" },
          { label: "Bearing/tearout, interior bolt (l{c} = s − d{h})", symbol: "r{n,int}", value: intBr.nominal, quantity: "force", ref: "Eqs. J3-6a, J3-6c" },
          { label: "Bolt group nominal strength", symbol: "R{n}", value: total, quantity: "force", ref: "§J3" },
        ],
      },
    ]);
    checks.push(connectionCheck("BG", "Bolts: shear, bearing, tearout", P, group, method));
    if (Le < minEdgeDistance(at.bolt.d)) warnings.push("End distance below the Table J3.4 minimum.");
    warnings.push("Bearing/tearout is checked in the hanger plate only; check the connected ply separately.");
  } else {
    const l = positive(at.length, "Weld length");
    const weld = filletWeld({ w: at.w, length: l, FEXX: at.FEXX ?? 70 });
    const both = connection(weld.section + " — two longitudinal welds", [
      { ...weld.limitStates[0]!, nominal: 2 * weld.nominal, name: "Two longitudinal fillet welds", steps: [...weld.steps, ...weld.limitStates[0]!.steps, { label: "Two welds", symbol: "R{n}", value: 2 * weld.nominal, quantity: "force", ref: "§J2.4" }] },
    ], [], weld.warnings);
    checks.push(connectionCheck("W", "Longitudinal fillet welds", P, both, method));
    const lag = shearLagReport({ case: 4, xBar: t / 2, length: l, width: w });
    Ae = lag.U * Ag;
    steps.push(...lag.steps, { label: "Effective net area", symbol: "A{e}", value: Ae, quantity: "area", expr: "UA{g}", ref: "§D3" });
    checks.push(connectionCheck("TR", "Plate tension rupture", P, elementTensionRupture({ Fy, Fu, Ag, An: Ag, Ae }), method));
    const plateShear = elementShearRupture({ Fy, Fu, Agv: 2 * l * t, Anv: 2 * l * t });
    checks.push(connectionCheck("PSR", "Plate shear rupture along welds", P, plateShear, method));
    if (l < w) warnings.push("Longitudinal weld length is less than the plate width; §J2.2b recommends l ≥ w for end connections of plates.");
  }
  return { ...summarize(checks, steps, warnings), An, Ae };
}
