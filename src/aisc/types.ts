/**
 * Design-engine contract (ANSI/AISC 360-22). Engine units: kip, in., ksi; moments in kip-in.
 * UI code converts at the boundary via src/lib/units.ts.
 *
 * THIS FILE IS THE SHARED CONTRACT between engine modules and UI. Extend it additively;
 * do not rename or remove fields.
 */
import type { Quantity } from "@/lib/units";
import type { Material } from "@/data/materials";
import type { Shape } from "@/data/shapes";

export type DesignMethod = "LRFD" | "ASD";

/** One line of a calculation report. */
export interface CalcStep {
  /** Plain-language description, e.g. "Limiting laterally unbraced length for yielding" */
  label: string;
  /** Symbol of the quantity computed, e.g. "L{p}" — braces mark subscripts (same convention as properties.ts). */
  symbol?: string;
  /** Symbolic expression, e.g. "1.76 r{y} √(E/F{y})" */
  expr?: string;
  /** Result in engine units */
  value?: number;
  quantity?: Quantity;
  /** Spec reference, e.g. "Eq. F2-5" or "Table B4.1b, Case 10" */
  ref?: string;
  note?: string;
}

export type FlexureClass = "compact" | "noncompact" | "slender";
export type CompressionClass = "nonslender" | "slender";

export interface ElementSlenderness<C extends string> {
  /** "Flange", "Web", "Wall", "Leg", "Stem", "Wall (long side)" … */
  element: string;
  /** Ratio symbol, e.g. "b{f}/2t{f}" */
  symbol: string;
  lambda: number;
  lambdaP?: number; // flexure only
  lambdaR: number;
  cls: C;
  /** e.g. "Table B4.1b, Case 10" */
  ref: string;
}

export interface SectionClassification<C extends string> {
  elements: ElementSlenderness<C>[];
  /** Worst element class */
  overall: C;
}

export interface LimitState {
  /** Short code: Y (yielding), LTB, FLB, WLB, TFY, LLB, FB (flexural buckling), TB, FTB, V (shear), TY, TR … */
  id: string;
  name: string;
  /** Governing section, e.g. "§F2.2" */
  ref: string;
  /** Nominal strength for this limit state (kip or kip-in) */
  nominal: number;
  /** Per-limit-state resistance factors when they differ (e.g. tension yielding vs. rupture, §D2). */
  phi?: number;
  omega?: number;
  steps: CalcStep[];
}

export interface StrengthResult {
  kind: "flexure" | "shear" | "compression" | "tension";
  /** "force" (kip) or "moment" (kip-in.) */
  quantity: "force" | "moment";
  /** Nominal strength (minimum of applicable limit states) */
  nominal: number;
  /** Resistance/safety factor of the governing limit state */
  phi: number;
  omega: number;
  /** id of the governing limit state (by AVAILABLE strength when per-limit-state factors differ) */
  governing: string;
  limitStates: LimitState[];
  /** Spec section used, e.g. "§F2 Doubly symmetric compact I-shaped members bent about their major axis" */
  section: string;
  /** Steps that precede the limit states (classification, constants) */
  steps: CalcStep[];
  warnings: string[];
}

export interface FlexureResult extends StrengthResult {
  kind: "flexure";
  classification: SectionClassification<FlexureClass>;
  /** Plastic moment, kip-in. */
  Mp: number;
  /** Limiting unbraced lengths (in.), when LTB applies */
  Lp?: number;
  Lr?: number;
}

export interface ShearResult extends StrengthResult {
  kind: "shear";
  Aw: number;
  Cv1?: number;
}

export interface CompressionResult extends StrengthResult {
  kind: "compression";
  classification: SectionClassification<CompressionClass>;
  /** Governing elastic buckling stress, ksi */
  Fe: number;
  /** Critical stress, ksi */
  Fcr: number;
  /** Governing slenderness Lc/r */
  slenderness: number;
}

export interface TensionResult extends StrengthResult {
  kind: "tension";
}

export interface FlexureInput {
  /** F9: true if the stem/web legs are in compression anywhere in the unbraced segment. */
  stemInCompression?: boolean;
  /** F10: continuous lateral-torsional restraint permits geometric-axis design. */
  continuousLateralRestraint?: boolean;
  /** F10: compression at the toe perpendicular to the geometric bending axis; default true. */
  toeInCompression?: boolean;
  /** F10.2(2)(ii): restraint at the point of maximum moment only. */
  restraintAtMaxMoment?: boolean;
  axis: "major" | "minor";
  /** Laterally unbraced length, in. */
  Lb: number;
  /** Lateral-torsional buckling modification factor (Eq. F1-1); default 1.0 */
  Cb?: number;
}

export interface ShearInput {
  /** G5: distance from maximum to zero shear, in.; omitted uses the long-length lower bound. */
  Lv?: number;
  axis: "major" | "minor";
  /** Clear distance between transverse stiffeners, in. (omit for unstiffened) */
  a?: number;
}

export interface CompressionInput {
  /** Effective lengths, in. (Lc = K·L) */
  Lcx: number;
  Lcy: number;
  /** Torsional effective length, in.; defaults to max(Lcx, Lcy) */
  Lcz?: number;
  /** §E5 opt-in. Lcx = Lcy = physical work-point length L (K is not applied). */
  singleAngle?: { connectedLeg: "long" | "short"; trussWeb?: boolean };
  /** §E6 intermediate connector spacing a, in.; omitted = ideal composite action. */
  connectorSpacing?: number;
  /** §E6 intermediate connectors; end connections must resist slip in either case. */
  connectorType?: "snug" | "welded-pretensioned";
}

export interface TensionInput {
  /** Net area, in.² (default Ag — no holes) */
  An?: number;
  /** Shear lag factor U, Table D3.1 (default 1.0) */
  U?: number;
}

export interface InteractionInput {
  /** Required strengths (same method basis as available strengths) */
  Pr: number;
  Pc: number;
  Mrx: number;
  Mcx: number;
  Mry?: number;
  Mcy?: number;
}

export interface InteractionResult {
  ratio: number;
  equation: "H1-1a" | "H1-1b";
  steps: CalcStep[];
}

export type FlexureFn = (shape: Shape, material: Material, input: FlexureInput) => FlexureResult;
export type ShearFn = (shape: Shape, material: Material, input: ShearInput) => ShearResult;
export type CompressionFn = (shape: Shape, material: Material, input: CompressionInput) => CompressionResult;
export type TensionFn = (shape: Shape, material: Material, input?: TensionInput) => TensionResult;

/** Thrown when a shape/axis combination is outside what the engine implements. */
export class UnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedError";
  }
}
