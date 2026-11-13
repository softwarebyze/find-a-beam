/**
 * Simple shear connections and coped beams — Manual Parts 9 and 10, AISC 360-22 Chapters J and K.
 * Units: kip, in., ksi. Vertical positions are measured downward from the top of the supported beam.
 */
import type { Material } from "@/data/materials";
import type { Shape } from "@/data/shapes";
import type { DesignMethod } from "../../types";
import type { BoltSpec, ConnectionResult, HoleType } from "../types";

export type ShearConnectionType = "single-plate" | "double-angle" | "seated" | "end-plate";
export type SupportKind = "column-flange" | "column-web" | "girder-web";
export type CopeKind = "none" | "top" | "both";

export interface CopeInput {
  kind: CopeKind;
  /** Cope length measured from the beam end, in. */
  c: number;
  /** Top cope depth, in. */
  dct: number;
  /** Bottom cope depth, in. (kind "both") */
  dcb: number;
}

export interface SupportInput {
  kind: SupportKind;
  /** W-shape column or girder; omitted skips supporting-member checks. */
  shape?: Shape;
  material: Material;
}

export interface BoltLayout {
  bolt: BoltSpec;
  /** Applied to the connecting element and the beam web; slots are horizontal (perpendicular to the reaction). */
  hole: HoleType;
  /** Bolts per vertical row (2–12 for Manual Part 10 tables) */
  n: number;
  /** Vertical pitch s, in. */
  s: number;
  /** Top of beam to the top bolt, in. */
  top: number;
}

export interface WeldInput {
  /** Fillet leg size, in. */
  w: number;
  FEXX: number;
}

export interface SinglePlateInput {
  tp: number;
  material: Material;
  /** Vertical edge distance at top and bottom of plate, in. */
  Lev: number;
  /** Horizontal edge distance, outermost bolt line to free edge of plate, in. */
  Leh: number;
  /** Vertical bolt lines (1, or 2 for the extended configuration) */
  cols: 1 | 2;
  /** Gage between bolt lines, in. */
  gCols: number;
  /** "auto" uses the conventional configuration when its dimensional limits are met. */
  config: "auto" | "conventional" | "extended";
}

export interface DoubleAngleInput {
  /** Single angle (type L) used in pairs */
  angle: Shape;
  material: Material;
  /** Leg bolted or welded to the beam web */
  legOnBeam: "long" | "short";
  Lev: number;
  beamSide: "bolted" | "welded";
  /** Gage from heel to bolt line on the outstanding (support) legs, in. */
  gOSL: number;
}

export interface SeatedInput {
  angle: Shape;
  material: Material;
  /** Horizontal (seat) leg */
  horizontalLeg: "long" | "short";
  /** Angle length along the beam width, in. */
  La: number;
  attach: "bolted" | "welded";
  /** Bolt rows in the vertical leg (1 or 2), two bolts per row */
  rows: 1 | 2;
  /** Heel to first bolt row in the vertical leg, in. */
  g1: number;
  /** Gage between the two bolts of a row, in. */
  gw: number;
}

export interface EndPlateInput {
  tp: number;
  material: Material;
  /** Plate width, in. */
  width: number;
  /** Gage between the two bolt lines, in. */
  gage: number;
  Lev: number;
}

export interface ShearConnectionInput {
  type: ShearConnectionType;
  method: DesignMethod;
  /** Required end reaction on the design-method basis (Ru for LRFD, Ra for ASD), kips */
  R: number;
  beam: Shape;
  beamMaterial: Material;
  cope: CopeInput;
  support: SupportInput;
  bolts: BoltLayout;
  /** Gap between support face and beam end (beam end to plate face for end plates), in. */
  setback: number;
  /** Bolt line nearest the support to beam end, in. */
  LehBeam: number;
  weld: WeldInput;
  singlePlate?: SinglePlateInput;
  doubleAngle?: DoubleAngleInput;
  seated?: SeatedInput;
  endPlate?: EndPlateInput;
}

export type CheckGroup = "Bolts" | "Welds" | "Connecting element" | "Supported beam" | "Support";

/** One strength check: a cited result compared against the reaction. */
export interface ShearCheck {
  id: string;
  title: string;
  group: CheckGroup;
  result: ConnectionResult;
  /** Required strength compared with available(result, method), kips */
  demand: number;
  available: number;
  ratio: number;
}

/** Dimensional / detailing requirement. */
export interface DetailCheck {
  id: string;
  label: string;
  /** Provided value, engine units */
  value: number;
  limit: number;
  kind: "min" | "max";
  quantity: "length" | "ratio" | "force";
  ref: string;
  pass: boolean;
  /** Recommendation rather than a requirement */
  advisory?: boolean;
  note?: string;
}

/** Resolved geometry for drawing and dimensioning (in., y down from top of beam). */
export interface ConnectionGeometry {
  /** Bolt centers on the beam web or connecting element, x from support face */
  bolts: { x: number; y: number }[];
  /** Bolts into the support (end plate, angles OSL, seat), y only */
  supportBoltsY: number[];
  /** Connecting element vertical extent */
  top: number;
  bottom: number;
  /** Connecting element horizontal extent from support face */
  width: number;
  /** Horizontal distance support face → bolt group centroid */
  a: number;
  /** Bolt-group eccentricity used for design */
  e: number;
  /** Seat angle: bearing length */
  lb?: number;
  /** Seat angle: reaction location from support face */
  eSeat?: number;
  /** Double angle: weld group on beam leg */
  weldSegments?: { x1: number; y1: number; x2: number; y2: number }[];
  /** Thickness of the connecting element seen in elevation */
  t: number;
  /** Leg lengths (angles): beam/horizontal leg and support/vertical leg */
  legA?: number;
  legB?: number;
  config?: "conventional" | "extended";
}

export interface ShearConnectionReport {
  input: ShearConnectionInput;
  checks: ShearCheck[];
  detailing: DetailCheck[];
  geometry: ConnectionGeometry;
  /** Highest strength ratio */
  governing?: ShearCheck;
  maxRatio: number;
  pass: boolean;
  warnings: string[];
  /** Manual design procedure followed */
  procedure: string;
}
