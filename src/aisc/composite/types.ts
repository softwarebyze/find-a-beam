/**
 * Composite beam contract — ANSI/AISC 360-22 Chapter I (§I3 flexural members, §I8 steel anchors).
 * Engine units: kip, in., ksi, kip-in.; concrete unit weight in lb/ft³ (pcf) because Ec = wc^1.5 √f'c
 * (§I2.1b) is dimensional in those units.
 */
import type { CalcStep, StrengthResult } from "../types";

/** Concrete slab system. Deck orientation is relative to the beam axis. */
export type SlabKind = "solid" | "deck-perpendicular" | "deck-parallel";

export interface SlabGeometry {
  kind: SlabKind;
  /** Concrete thickness above the top of the deck (solid slab: total thickness), in. */
  tc: number;
  /** Nominal deck rib height hr, in. (0 for solid slabs) */
  hr: number;
  /** Average rib width wr, in. (§I8.2a: used for Rg with ribs parallel; §I3.2c(1): wr ≥ 2 in.) */
  wr: number;
  /** Rib pitch (center-to-center), in. */
  pitch: number;
}

export interface ConcreteProps {
  /** Specified compressive strength f'c, ksi */
  fc: number;
  /** Unit weight wc, lb/ft³ (90 ≤ wc ≤ 155 for Ec = wc^1.5 √f'c) */
  wc: number;
}

export interface StudSpec {
  /** Shank diameter d{sa}, in. */
  d: number;
  /** Length after installation, in. */
  length: number;
  /** Specified minimum tensile strength F{u} of the anchor, ksi (65 ksi, AWS D1.1 Type B) */
  Fu: number;
  /** Studs per deck rib (ribs perpendicular) or per transverse row (solid slab / ribs parallel) */
  perGroup: number;
  /** Ribs perpendicular: weak position (e{mid-ht} < 2 in., Rp = 0.6) or strong (e{mid-ht} ≥ 2 in., Rp = 0.75) */
  position: "weak" | "strong";
}

export interface EffectiveWidthInput {
  /** Span, center-to-center of supports, in. */
  L: number;
  position: "interior" | "edge";
  /** Center-to-center spacing to the adjacent beam(s), in. */
  spacing: number;
  /** Edge beam: distance from beam centerline to slab edge, in. */
  edge?: number;
}

export interface EffectiveWidth {
  b: number;
  left: number;
  right: number;
  /** Tributary width for area loads, in. */
  tributary: number;
  steps: CalcStep[];
}

export interface StudStrength {
  Qn: number;
  Asa: number;
  Ec: number;
  Rg: number;
  Rp: number;
  /** 0.5 Asa √(f'c Ec), kips */
  concreteLimit: number;
  /** Rg Rp Asa Fu, kips */
  steelLimit: number;
  governs: "concrete" | "anchor";
  steps: CalcStep[];
}

export type PnaLocation = "slab" | "flange" | "web";

/** Plastic stress distribution for a given concrete force C and lever Y2 (Manual Table 3-19 basis). */
export interface PlasticState {
  /** Compression force in the concrete, kips */
  C: number;
  /** Compression force in the steel section, kips */
  Cs: number;
  /** Tension force in the steel section, kips */
  T: number;
  /** Distance from the top of steel to the PNA, in. (0 when the PNA lies in the slab) */
  Y1: number;
  /** Distance from the top of steel to the concrete compression resultant, in. */
  Y2: number;
  /** Depth of the steel compression resultant below the top of steel, in. */
  yC: number;
  /** Depth of the steel tension resultant below the top of steel, in. */
  yT: number;
  pna: PnaLocation;
  /** Nominal flexural strength, kip-in. */
  Mn: number;
}

export interface CompositeFlexureResult extends StrengthResult {
  kind: "flexure";
  quantity: "moment";
  /** Concrete crushing limit 0.85 f'c Ac (Eq. I3-1a), kips */
  Cconc: number;
  /** Steel yielding limit Fy As (Eq. I3-1b), kips */
  Csteel: number;
  /** Anchor limit ΣQn (Eq. I3-1c), kips */
  sumQn: number;
  /** Full-composite force Cf = min(Cconc, Csteel), kips */
  Cf: number;
  /** Degree of composite action ΣQn / Cf (capped at 1) */
  ratio: number;
  controls: "concrete" | "steel" | "anchors";
  /** Depth of the concrete compression block, in. */
  a: number;
  /** Distance from top of steel to top of slab, in. */
  Ycon: number;
  plastic: PlasticState;
}

export interface PnaRow {
  /** Manual Table 3-19 PNA location */
  point: "TFL" | "2" | "3" | "4" | "BFL" | "6" | "7";
  Y1: number;
  sumQn: number;
}

export interface Table319Row extends PnaRow {
  /** Nominal moment Mn at each Y2, kip-in. */
  Mn: number[];
  /** Lower-bound moment of inertia at each Y2 (Manual Table 3-20), in.⁴ */
  ILB: number[];
}

export interface ElasticProps {
  /** Modular ratio n = E / Ec */
  n: number;
  /** Transformed (full composite, uncracked slab above ENA) moment of inertia, in.⁴ */
  Itr: number;
  /** Elastic neutral axis of the transformed section, measured below the top of slab, in. */
  ytr: number;
  /** Lower-bound moment of inertia, in.⁴ */
  ILB: number;
  /** ENA for ILB above the bottom of steel, in. */
  YENA: number;
  /** Effective moment of inertia for partial composite action, in.⁴ */
  Ieff: number;
  steps: CalcStep[];
}
