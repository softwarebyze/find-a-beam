/**
 * HSS and box-section connections — ANSI/AISC 360-22 Chapter K. Units: kip, in., ksi; moments kip-in.
 *
 * Section numbering follows 360-22: §K1 concentrated forces on HSS, §K2 HSS-to-HSS truss
 * connections, §K3 HSS-to-HSS moment connections, §K4 welds of plates and branches to
 * rectangular HSS. (The same provisions were §K2–§K5 in 360-16.) See `refs.ts`.
 *
 * Every function returns an `HssConnectionResult` (a `StrengthResult` of kind "connection") so the
 * UI renders it with <CalcReport/> and honors LRFD/ASD through `available()`. Chapter K carries a
 * different φ/Ω for each limit state, so each limit state always sets both.
 */
import type { Material } from "@/data/materials";
import type { Shape } from "@/data/shapes";
import type { CalcStep, DesignMethod, StrengthResult } from "../types";

export type HssFamily = "round" | "rect";

/**
 * Which chord wall receives the branch or plate. "B" (default) welds to the width face, so the
 * sidewalls are Ht deep; "Ht" rotates the chord 90° about its axis.
 */
export type ChordFace = "B" | "Ht";

/** Required forces in the chord at the joint, used only for the chord-stress parameter Qf. */
export interface ChordLoads {
  /** Required chord axial force, kip. Signed: + = tension. */
  axial?: number;
  /** Required chord bending moment, kip-in. Signed so + puts the CONNECTING FACE in tension. */
  moment?: number;
}

/**
 * One limit of applicability from a Table K_.A. Chapter K strengths are only valid inside the
 * tested parameter ranges, so a failing check invalidates the whole result rather than silently
 * returning a number.
 */
export interface ApplicabilityCheck {
  id: string;
  /** Plain-language name, e.g. "Chord wall slenderness" */
  label: string;
  /** Parameter symbol, e.g. "D/t" or "\u03b2" */
  symbol?: string;
  value: number;
  /** Rendered requirement, e.g. "≤ 50" or "0.2 < β ≤ 1.0" */
  limit: string;
  ok: boolean;
  ref: string;
}

export interface HssConnectionResult extends StrengthResult {
  kind: "connection";
  /** Limits of applicability of the governing table. All must pass for the strengths to be valid. */
  applicability: ApplicabilityCheck[];
  /** True when every applicability check passes. */
  applicable: boolean;
  /** Joint parameters (β, γ, η, ζ, Ov, Qf …) reported ahead of the limit states. */
  params: CalcStep[];
}

/** Chord (or plate-supporting) member. */
export interface Member {
  shape: Shape;
  material: Material;
}

/** A welded branch of an HSS-to-HSS connection. */
export interface Branch extends Member {
  /** Acute angle between the branch and chord axes, degrees. 90° = T or cross. */
  theta: number;
  /** Required branch axial force, kip. Signed: + = tension. Used for demand and sense-dependent states. */
  force?: number;
}

export interface ChordInput {
  chord: Member;
  method: DesignMethod;
  chordLoads?: ChordLoads;
  chordFace?: ChordFace;
}

/* ------------------------------------------------------------------ §K1 */

/**
 * - "transverse": plate normal to the chord axis, loaded in its own plane (Bp across the face).
 * - "longitudinal": plate in the plane containing the chord axis, lb along the axis.
 * - "through": longitudinal plate slotted through both chord walls.
 */
export type PlateKind = "transverse" | "longitudinal" | "through";

export interface PlateToHssInput extends ChordInput {
  kind: PlateKind;
  /** Plate width across the chord face, in. (transverse plates). */
  Bp: number;
  /** Plate bearing length along the chord axis, in. Transverse plates: the plate thickness. */
  lb: number;
  /** Plate thickness, in. */
  tp: number;
  /** Angle between the plate and the chord axis, degrees (90 = T-connection). */
  theta?: number;
  /** Plates welded to opposite faces (cross-connection); changes the applicable limits. */
  cross?: boolean;
  /** Sense of the plate force. Compression adds the sidewall local crippling limit state. */
  plateForce?: "tension" | "compression";
  /** Required plate force, kip (magnitude), for the demand/capacity ratio. */
  demand?: number;
}

export interface CapPlateInput extends ChordInput {
  /** Cap plate thickness, in. */
  tp: number;
  /** Bearing length of the applied load on the cap plate, in., measured along `bearingAlong`. */
  lb: number;
  /** Chord dimension the bearing length runs along; the load spreads onto the other two walls. */
  bearingAlong?: ChordFace;
  demand?: number;
}

/* ------------------------------------------------------------------ §K2 */

/** T, Y and cross (X) have one branch; K connections have two, gapped or overlapped. */
export type TrussJoint = "T" | "Y" | "X" | "K-gap" | "K-overlap";

export interface TrussConnectionInput extends ChordInput {
  joint: TrussJoint;
  /** The branch being checked. For overlapped K this is the OVERLAPPING (thinner) branch i. */
  branch: Branch;
  /** The second branch of a K connection. For overlapped K this is the OVERLAPPED branch j. */
  otherBranch?: Branch;
  /** Gap g between branch toes measured along the chord face, in. (K-gap). */
  gap?: number;
  /** Overlap Ov = q/p, percent (K-overlap). */
  overlap?: number;
  /** Chord shear/axial check across the gap of a gapped K uses the chord forces on both sides. */
  gapChordForce?: number;
}

/* ------------------------------------------------------------------ §K3 */

export type MomentJoint = "T" | "Y" | "X";
export type BendingPlane = "in-plane" | "out-of-plane";

export interface MomentConnectionInput extends ChordInput {
  joint: MomentJoint;
  branch: Branch;
  plane: BendingPlane;
  /** Required branch moment, kip-in. (magnitude), for the demand/capacity ratio. */
  demand?: number;
}

/** §K3 combined axial force and bending on the branch. Demands and capacities share a method basis. */
export interface MomentInteractionInput {
  family: HssFamily;
  Pr: number;
  Pc: number;
  MrIp: number;
  McIp: number;
  MrOp: number;
  McOp: number;
}

export interface MomentInteractionResult {
  ratio: number;
  ref: string;
  steps: CalcStep[];
}

/* ------------------------------------------------------------------ §K4 */

export interface BranchWeldInput extends ChordInput {
  joint: TrussJoint;
  branch: Branch;
  /** Fillet weld leg size w, in. */
  w: number;
  /** Filler metal classification strength, ksi (default 70). */
  FEXX?: number;
  /** Required branch force, kip (magnitude). */
  demand?: number;
}

export interface EffectiveWeldLength {
  /** Total effective weld length le, in. */
  le: number;
  /** Effective weld section modulus for in-plane bending, in.³ per unit throat. */
  Sip?: number;
  /** Effective weld section modulus for out-of-plane bending, in.³ per unit throat. */
  Sop?: number;
  steps: CalcStep[];
  warnings: string[];
}
