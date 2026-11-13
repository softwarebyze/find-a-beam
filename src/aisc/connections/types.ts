/**
 * Connection design contract — AISC 360-22 Chapter J and Manual Parts 7–10.
 * Units: kip, in., ksi. Every function returns a cited StrengthResult (kind "connection")
 * so the UI can render it with <CalcReport/> and honor LRFD/ASD via available().
 *
 * SHARED CONTRACT: bolts.ts / welds.ts / groups.ts / elements.ts implement these signatures.
 * Other modules (shear connections, base plates, HSS connections) import from "@/aisc/connections".
 * Extend additively only.
 */
import type { StrengthResult } from "../types";

/** ASTM F3125 Grade A325/F1852 = Group 120 ("A"); A490/F2280 = Group 150 ("B"); F3043/F3111 = Group 200 ("C"). */
export type BoltGroup = "A307" | "A" | "B" | "C";
/** N = threads included in shear plane, X = excluded. */
export type ThreadCondition = "N" | "X";
/** Table J3.3 hole types: standard, oversized, short-slotted, long-slotted. */
export type HoleType = "STD" | "OVS" | "SSL" | "LSL";
/** Slot orientation relative to the load (for SSL/LSL). */
export type SlotOrientation = "parallel" | "perpendicular";

export interface BoltSpec {
  /** Nominal diameter, in. (1/2 … 1-1/2) */
  d: number;
  group: BoltGroup;
  threads: ThreadCondition;
}

export interface BoltShearInput {
  bolt: BoltSpec;
  /** Number of shear planes (1 = single shear, 2 = double shear) */
  planes?: number;
  /** §J3.7 filler reduction / long-joint notes are reported as warnings when applicable */
  fillerThickness?: number;
}

export interface BoltBearingInput {
  d: number;
  /** Thickness of the connected material, in. */
  t: number;
  /** Tensile strength of connected material, ksi */
  Fu: number;
  /** Clear distance in the direction of force between hole edges or hole edge and material edge, in. */
  lc: number;
  holeType?: HoleType;
  slot?: SlotOrientation;
  /** true (default): deformation at service load is a design consideration (Eq. J3-6a/J3-6c) */
  deformationConsidered?: boolean;
}

export interface SlipCriticalInput {
  bolt: BoltSpec;
  /** Class A (μ = 0.30) or Class B (μ = 0.50) faying surface */
  surface: "A" | "B";
  /** Number of slip planes */
  ns?: number;
  /** Filler factor hf (1.0 default; 0.85 for ≥ 2 fillers per §J3.9) */
  hf?: number;
  holeType?: HoleType;
  slot?: SlotOrientation;
}

export interface CombinedBoltInput {
  bolt: BoltSpec;
  /** Required shear stress, ksi (on the design method basis) */
  frv: number;
  method: "LRFD" | "ASD";
  planes?: number;
}

export interface FilletWeldInput {
  /** Leg size w, in. */
  w: number;
  /** Effective length, in. */
  length: number;
  /** Filler metal classification strength, ksi (default 70) */
  FEXX?: number;
  /** Angle of loading measured from the weld longitudinal axis, degrees (default 0); 90° gives the 1.5 increase (Eq. J2-5) */
  theta?: number;
}

export interface BoltCoord { x: number; y: number }

export interface EccentricBoltGroupInput {
  bolts: BoltCoord[];
  /** Eccentricity of the load from the group centroid, in. (measured perpendicular to the load line) */
  ex: number;
  /** Load angle from vertical, degrees (Manual Tables 7-6 to 7-13 use 0°, 15°, 30°, 45°, 60°, 75°) */
  angle?: number;
  method?: "IC" | "elastic";
}

export interface EccentricGroupResult {
  /** Coefficient C: available strength = C × (single-bolt or unit-weld strength) */
  C: number;
  method: "IC" | "elastic";
  /** IC method: location of instantaneous center relative to centroid, in. */
  ic?: BoltCoord;
  ref: string;
  steps: StrengthResult["steps"];
  warnings: string[];
}

export interface WeldSegment { x1: number; y1: number; x2: number; y2: number }

export interface EccentricWeldGroupInput {
  segments: WeldSegment[];
  /** Eccentricity of load from weld-group centroid, in. */
  ex: number;
  angle?: number;
  FEXX?: number;
  method?: "IC" | "elastic";
}

export interface ElementInput {
  Fy: number;
  Fu: number;
  /** Gross area Ag (tension/compression/shear yielding as applicable), in.² */
  Ag?: number;
  /** Net area, in.² */
  An?: number;
  /** Effective net area (tension rupture), in.² */
  Ae?: number;
  /** Gross / net shear area, in.² */
  Agv?: number;
  Anv?: number;
  /** For J4.4 compression: effective length KL, in., and radius of gyration r, in. */
  KL?: number;
  r?: number;
}

export type ConnectionResult = StrengthResult & { kind: "connection" };
