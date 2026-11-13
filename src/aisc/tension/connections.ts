/** Tension connection geometry, ANSI/AISC 360-22 §§B4.3b, D3, J4.3. */
import { req, type Shape } from "@/data/shapes";
import type { CalcStep, DesignMethod, LimitState } from "../types";

function positive(v: number, name: string): number {
  if (!(v > 0) || !Number.isFinite(v)) throw new RangeError(`${name} must be finite and positive`);
  return v;
}
function nonnegative(v: number, name: string): number {
  if (v < 0 || !Number.isFinite(v)) throw new RangeError(`${name} must be finite and nonnegative`);
  return v;
}

export type ShearLagInput =
  | { case: 1 }
  | { case: 3 }
  | { case: 5; section: "round"; D: number; gussetThickness: number; length: number }
  | { case: 5; section: "rectangular"; B: number; H: number; t: number; gussetThickness: number; length: number }
  | { case: 6; B: number; H: number; length: number }
  | { case: 2; xBar: number; length: number; connectedAreaRatio?: number }
  | { case: 4; xBar: number; length: number; width: number; connectedAreaRatio?: number }
  | {
      case: 7;
      connection: "flange" | "web";
      fastenersPerLine: number;
      bf: number;
      d: number;
      xBar?: number;
      length?: number;
      connectedAreaRatio?: number;
    }
  | { case: 8; fastenersPerLine: number; xBar?: number; length?: number; connectedAreaRatio?: number };

/** U only; use shearLagReport for the associated report steps and applicability notes. */
export function shearLagU(input: ShearLagInput): number {
  return shearLagReport(input).U;
}
export function shearLagReport(input: ShearLagInput): { U: number; steps: CalcStep[] } {
  let U: number, expr: string;
  const geometrySteps: CalcStep[] = [];
  const ref = `Table D3.1, Case ${input.case}`;
  const case2 = (x: number, l: number) => 1 - nonnegative(x, "xBar") / positive(l, "length");
  if (input.case === 1 || input.case === 3) {
    U = 1;
    expr = "1.0";
  } else if (input.case === 2) {
    U = case2(input.xBar, input.length);
    expr = "1 − x{bar}/l";
  } else if (input.case === 5) {
    positive(input.length, "length");
    nonnegative(input.gussetThickness, "gusset thickness");
    let xBar: number;
    if (input.section === "round") {
      const R = positive(input.D, "D") / 2;
      if (input.gussetThickness >= input.D) throw new RangeError("Gusset must fit inside diameter");
      const theta = Math.acos(input.gussetThickness / (2 * R));
      xBar = (R * Math.sin(theta)) / theta - input.gussetThickness / 2;
      U = (1 + (xBar / input.length) ** 3.2) ** -10;
      expr = "[1 + (x{bar}/l)^3.2]^−10";
    } else {
      const { B, H, t } = input;
      positive(B, "B");
      positive(H, "H");
      positive(t, "t");
      if (2 * t >= Math.min(B, H) || input.gussetThickness >= B - 2 * t)
        throw new RangeError("Invalid HSS/gusset dimensions");
      const b = (B - input.gussetThickness) / 2;
      xBar = b - (2 * b ** 2 + H * t - 2 * t ** 2) / (4 * b + 2 * H - 4 * t);
      U = case2(xBar, input.length);
      expr = "1 − x{bar}/l";
    }
    geometrySteps.push({
      label: "Eccentricity of half-section from gusset face",
      symbol: "x{bar}",
      value: xBar,
      quantity: "length",
      ref,
    });
  } else if (input.case === 6) {
    const { B, H, length: l } = input;
    positive(B, "B");
    positive(H, "H");
    positive(l, "length");
    const UB = (3 * l * l) / (3 * l * l + B * B),
      UH = (3 * l * l) / (3 * l * l + H * H);
    U = (B * UB + H * UH) / (B + H);
    expr = "(BU{B} + HU{H})/(H+B)";
  } else if (input.case === 4) {
    positive(input.width, "width");
    U = ((3 * input.length ** 2) / (3 * input.length ** 2 + input.width ** 2)) * case2(input.xBar, input.length);
    expr = "[3l²/(3l²+w²)](1 − x{bar}/l)";
  } else {
    if (!Number.isInteger(input.fastenersPerLine) || input.fastenersPerLine < 1)
      throw new RangeError("fastenersPerLine must be a positive integer");
    if (input.case === 7) {
      positive(input.bf, "bf");
      positive(input.d, "d");
      const minimum = input.connection === "web" ? 4 : 3;
      if (input.fastenersPerLine < minimum)
        throw new RangeError(
          `Case 7 ${input.connection} connection requires ≥${minimum} fasteners per line; use Case 2`,
        );
      U = input.connection === "web" ? 0.7 : input.bf >= (2 * input.d) / 3 ? 0.9 : 0.85;
    } else {
      if (input.fastenersPerLine < 3 && (input.xBar === undefined || input.length === undefined))
        throw new RangeError("Case 8 with <3 fasteners requires Case 2 xBar and length");
      U = input.fastenersPerLine >= 4 ? 0.8 : input.fastenersPerLine === 3 ? 0.6 : 0;
    }
    expr = "Tabulated U (or larger Case 2 value)";
    if ((input.xBar === undefined) !== (input.length === undefined))
      throw new RangeError("Provide both xBar and length");
    if (input.xBar !== undefined && input.length !== undefined) U = Math.max(U, case2(input.xBar, input.length));
  }
  if ("connectedAreaRatio" in input && input.connectedAreaRatio !== undefined) {
    const floor = input.connectedAreaRatio;
    if (!(floor > 0 && floor <= 1)) throw new RangeError("connectedAreaRatio must be in (0, 1]");
    U = Math.max(U, floor);
  }
  if (!(U > 0 && U <= 1)) throw new RangeError("Connection geometry produces U outside (0, 1]; review the connection");
  return {
    U,
    steps: [
      ...geometrySteps,
      {
        label: "Shear lag factor",
        symbol: "U",
        expr,
        value: U,
        quantity: "ratio",
        ref,
        note:
          input.case === 3
            ? "An must be the area of the directly connected elements, not the full section."
            : input.case === 4
              ? "360-22 longitudinal welds only: l = (l1+l2)/2; each weld length ≥4 times weld size. Connected-area floor is for open sections only (§D3)."
              : input.case === 7
                ? "For a tee, d is the depth of the parent shape from which the tee was cut. Connected-area floor is for open sections only (§D3)."
                : "Verify case applicability. A connected-area floor is permitted for open sections only (§D3).",
      },
    ],
  };
}

export interface BoltHole {
  /** Actual nominal HOLE diameter/slot width perpendicular to force, not bolt diameter, in. */
  diameter: number;
  /** Thickness of the penetrated material, in.; specify one entry per ply crossed by the path. */
  thickness: number;
  count?: number;
}
export interface NetAreaInput {
  holes: readonly BoltHole[];
  /** Stagger segments along this one candidate path, s parallel and g perpendicular to force. */
  stagger?: readonly { s: number; g: number; thickness: number }[];
}
/** Net area for ONE candidate failure path; caller must check every feasible path. */
export function netArea(shape: Shape, input: readonly BoltHole[] | NetAreaInput): number {
  return netAreaReport(shape, input).An;
}
export function netAreaReport(
  shape: Shape,
  input: readonly BoltHole[] | NetAreaInput,
): { An: number; steps: CalcStep[] } {
  const config: NetAreaInput = "holes" in input ? input : { holes: input };
  const Ag = positive(req(shape, "A"), "Ag");
  let deduction = 0,
    addition = 0;
  for (const hole of config.holes) {
    const n = hole.count ?? 1;
    if (!Number.isInteger(n) || n < 1) throw new RangeError("Hole count must be a positive integer");
    deduction += n * (positive(hole.diameter, "hole diameter") + 1 / 16) * positive(hole.thickness, "thickness");
  }
  for (const segment of config.stagger ?? [])
    addition +=
      (nonnegative(segment.s, "stagger s") ** 2 / (4 * positive(segment.g, "gage g"))) *
      positive(segment.thickness, "thickness");
  const An = Math.min(Ag, Ag - deduction + addition);
  if (!(An > 0)) throw new RangeError("Hole deductions leave no net area");
  return {
    An,
    steps: [
      {
        label: "Hole area deduction",
        symbol: "A{holes}",
        expr: "Σn(d{hole}+1/16)t",
        value: deduction,
        quantity: "area",
        ref: "§B4.3b",
      },
      {
        label: "Stagger allowance",
        symbol: "A{stagger}",
        expr: "Σ[s²/(4g)]t",
        value: addition,
        quantity: "area",
        ref: "§B4.3b",
      },
      {
        label: "Net area of candidate path",
        symbol: "A{n}",
        expr: "min(A{g}, A{g} − A{holes} + A{stagger})",
        value: An,
        quantity: "area",
        ref: "§B4.3b",
        note: "Evaluate all candidate paths; stagger across an angle heel uses g = sum of back gages minus thickness (§B4.3b).",
      },
    ],
  };
}

export interface BlockShearInput {
  Agv: number;
  Anv: number;
  Ant: number;
  Fy: number;
  Fu: number;
  Ubs?: number;
  method?: DesignMethod;
}
export interface BlockShearResult {
  nominal: number;
  phi: number;
  omega: number;
  available: number;
  quantity: "force";
  ref: string;
  governing: string;
  limitStates: (LimitState & { quantity: "force" })[];
  steps: CalcStep[];
}
export function blockShear({ Agv, Anv, Ant, Fy, Fu, Ubs = 1, method = "LRFD" }: BlockShearInput): BlockShearResult {
  for (const [k, v] of Object.entries({ Agv, Anv, Ant, Fy, Fu })) positive(v, k);
  if (Anv > Agv) throw new RangeError("Anv cannot exceed Agv");
  if (Ubs !== 1 && Ubs !== 0.5) throw new RangeError("Ubs must be 1.0 (uniform) or 0.5 (nonuniform tension)");
  const rupture = 0.6 * Fu * Anv + Ubs * Fu * Ant,
    yielding = 0.6 * Fy * Agv + Ubs * Fu * Ant;
  const nominal = Math.min(rupture, yielding),
    ref = "Eq. J4-5",
    phi = 0.75,
    omega = 2;
  const steps: CalcStep[] = [
    {
      label: "Shear rupture plus tension rupture",
      symbol: "R{n1}",
      expr: "0.6F{u}A{nv} + U{bs}F{u}A{nt}",
      value: rupture,
      quantity: "force",
      ref,
    },
    {
      label: "Shear yielding plus tension rupture",
      symbol: "R{n2}",
      expr: "0.6F{y}A{gv} + U{bs}F{u}A{nt}",
      value: yielding,
      quantity: "force",
      ref,
    },
    {
      label: "Nominal block shear strength",
      symbol: "R{n}",
      expr: "min(R{n1}, R{n2})",
      value: nominal,
      quantity: "force",
      ref,
    },
  ];
  return {
    nominal,
    phi,
    omega,
    available: method === "LRFD" ? phi * nominal : nominal / omega,
    quantity: "force",
    ref,
    governing: "BS",
    steps,
    limitStates: [{ id: "BS", name: "Block shear rupture", nominal, phi, omega, quantity: "force", ref, steps }],
  };
}
