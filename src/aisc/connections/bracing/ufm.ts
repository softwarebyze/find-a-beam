/**
 * Uniform Force Method (UFM) — AISC Manual (16th Ed.) Part 13, "Vertical Bracing Connections".
 * Concentric corner gusset at a beam-to-column joint. Units: kip, in., kip-in.
 *
 * Coordinates: work point (WP) at the intersection of the beam and column centerlines; x horizontal
 * toward the gusset (away from the column), y vertical toward the gusset (away from the beam).
 * Column face at x = e{c}, beam flange at y = e{b}; brace direction u = (sin θ, cos θ), θ from vertical.
 *
 * Sign convention: P > 0 tension. Interface forces (H, V) are the forces the gusset delivers TO the
 * member (same sense as the brace pull for P > 0). Interface moments M are the moments the gusset
 * delivers to the member about the ACTUAL centroid of that interface, counterclockwise positive.
 */
import type { CalcStep } from "../../types";

export type UfmCase = "general" | "sc1" | "sc2" | "sc3";

export const UFM_CASES: { value: UfmCase; label: string; ref: string }[] = [
  { value: "general", label: "General case", ref: "Manual Part 13 · UFM general case" },
  { value: "sc1", label: "Special Case 1 — work point at gusset corner", ref: "Manual Part 13 · UFM Special Case 1" },
  { value: "sc2", label: "Special Case 2 — minimized beam-to-column shear", ref: "Manual Part 13 · UFM Special Case 2" },
  { value: "sc3", label: "Special Case 3 — no gusset-to-column connection", ref: "Manual Part 13 · UFM Special Case 3" },
];

export interface UfmInput {
  /** Brace axial force, kips (tension positive) */
  P: number;
  /** Brace angle measured from the vertical, degrees (0 < θ < 90) */
  theta: number;
  /** Half beam depth, in. */
  eb: number;
  /** Half column depth (flange connection) or half web thickness (web connection), in. */
  ec: number;
  /** Actual centroid of the gusset-to-beam connection from the column face, in. */
  alphaBar: number;
  /** Actual centroid of the gusset-to-column connection from the beam flange, in. */
  betaBar: number;
  case?: UfmCase;
  /**
   * General case and Special Case 2: which actual centroid the UFM geometry honors. "beta" (default):
   * β = β̄, α from the UFM constraint; any α ≠ ᾱ produces a gusset-to-beam moment. "alpha": α = ᾱ.
   */
  keep?: "alpha" | "beta";
  /** Special Case 2: portion ΔV{b} of V{b} moved to the gusset-to-column interface (default all of V{b}). */
  dVb?: number;
  /** Required beam end reaction R (magnitude), kips */
  R?: number;
  /** Required transfer (drag) force A at the beam-to-column connection (magnitude), kips */
  A?: number;
}

export interface InterfaceForce {
  /** Force parallel to the interface (shear), kips — signed */
  shear: number;
  /** Force normal to the interface, kips — signed, positive pulls the gusset away from the member */
  normal: number;
  /** Moment about the actual interface centroid, kip-in. — signed */
  moment: number;
  /** Interface centroid location in WP coordinates */
  at: { x: number; y: number };
}

export interface UfmResult {
  case: UfmCase;
  alpha: number;
  beta: number;
  r: number;
  Hb: number;
  Vb: number;
  Hc: number;
  Vc: number;
  /** Gusset-to-beam interface (shear = H{b}, normal = V{b}) */
  beam: InterfaceForce;
  /** Gusset-to-column interface (shear = V{c}, normal = H{c}) */
  column: InterfaceForce;
  /** Beam-to-column connection required forces (envelope magnitudes) */
  beamToColumn: { shear: number; axial: number };
  /** Moments induced in the frame members (Special Case 1 relocated work point), kip-in. */
  memberMoments: { beam: number; column: number };
  /** Point on the brace line in WP coordinates (the WP, or the gusset corner for Special Case 1) */
  braceThrough: { x: number; y: number };
  /** Residual of gusset free-body equilibrium [ΣFx, ΣFy, ΣM about WP] — ≈ 0 by construction */
  residual: [number, number, number];
  steps: CalcStep[];
  warnings: string[];
}

/**
 * Gusset free-body equilibrium residual about the WP. The brace line passes through `through`
 * (the WP, or the gusset corner for Special Case 1).
 */
export function gussetResidual(
  P: number,
  theta: number,
  beam: InterfaceForce,
  column: InterfaceForce,
  through: { x: number; y: number } = { x: 0, y: 0 },
): [number, number, number] {
  const t = (theta * Math.PI) / 180;
  // Reactions ON the gusset are opposite to the forces delivered TO the members.
  const bx = -beam.shear,
    by = -beam.normal,
    cx = -column.normal,
    cy = -column.shear;
  const fx = P * Math.sin(t) + bx + cx;
  const fy = P * Math.cos(t) + by + cy;
  const brace = through.x * P * Math.cos(t) - through.y * P * Math.sin(t);
  const m =
    brace +
    beam.at.x * by - beam.at.y * bx - beam.moment + (column.at.x * cy - column.at.y * cx) - column.moment;
  return [fx, fy, m];
}

export function uniformForceMethod(input: UfmInput): UfmResult {
  const { P, eb, ec, alphaBar, betaBar } = input;
  const theta = input.theta;
  if (!(theta > 0 && theta < 90)) throw new RangeError("Brace angle θ must be between 0° and 90° from vertical");
  if (!(eb > 0) || !(ec >= 0)) throw new RangeError("e{b} must be positive and e{c} nonnegative");
  if (!(alphaBar > 0) || !(betaBar > 0)) throw new RangeError("Gusset connection centroids ᾱ and β̄ must be positive");
  const kase = input.case ?? "general";
  const ref = UFM_CASES.find((c) => c.value === kase)!.ref;
  const tan = Math.tan((theta * Math.PI) / 180);
  const warnings: string[] = [];
  const steps: CalcStep[] = [
    { label: "Brace angle from vertical", symbol: "θ", value: theta, quantity: "ratio", ref: "Manual Part 13", note: "degrees" },
    { label: "Half beam depth", symbol: "e{b}", value: eb, quantity: "length", ref: "Manual Part 13" },
    { label: "Column eccentricity to face", symbol: "e{c}", value: ec, quantity: "length", ref: "Manual Part 13" },
  ];
  let alpha: number, beta: number, r: number, Hb: number, Vb: number, Hc: number, Vc: number;
  let memberBeam = 0,
    memberColumn = 0;
  const keep = input.keep ?? "beta";
  if (kase === "sc1") {
    // Work point relocated to the gusset corner: e{b} = e{c} = 0 for the gusset, α = β tan θ.
    beta = betaBar;
    alpha = beta * tan;
    r = Math.hypot(alpha, beta);
    Hb = (alpha / r) * P;
    Vb = 0;
    Hc = 0;
    Vc = (beta / r) * P;
    memberBeam = Hb * eb;
    memberColumn = Vc * ec;
    steps.push(
      { label: "UFM constraint with the work point at the gusset corner", symbol: "α", value: alpha, quantity: "length", expr: "β tan θ", ref },
      { label: "Distance from relocated work point to interface centroids", symbol: "r", value: r, quantity: "length", expr: "√(α² + β²)", ref },
      { label: "Beam moment from relocated work point", symbol: "M{b}", value: memberBeam, quantity: "moment", expr: "H{b}e{b}", ref },
      { label: "Column moment from relocated work point", symbol: "M{c}", value: memberColumn, quantity: "moment", expr: "V{c}e{c}", ref },
    );
    warnings.push("Special Case 1: the beam and column must be designed for the moments H{b}e{b} and V{c}e{c} induced by the relocated work point.");
  } else if (kase === "sc3") {
    // No gusset-to-column connection: β = 0, e{c} = 0 for the gusset; all force to the beam.
    beta = 0;
    alpha = eb * tan - ec;
    r = eb / Math.cos((theta * Math.PI) / 180);
    Hb = P * Math.sin((theta * Math.PI) / 180);
    Vb = P * Math.cos((theta * Math.PI) / 180);
    Hc = 0;
    Vc = 0;
    steps.push({ label: "Ideal gusset-to-beam centroid from column face", symbol: "α", value: alpha, quantity: "length", expr: "e{b} tan θ − e{c}", ref });
  } else {
    if (keep === "beta") {
      beta = betaBar;
      alpha = eb * tan - ec + beta * tan;
    } else {
      alpha = alphaBar;
      beta = (alpha + ec) / tan - eb;
    }
    if (alpha < 0 || beta < 0) throw new RangeError("UFM geometry yields a negative α or β; revise the gusset geometry or hold the other centroid");
    r = Math.hypot(alpha + ec, beta + eb);
    Hc = (ec / r) * P;
    Vc = (beta / r) * P;
    Hb = (alpha / r) * P;
    Vb = (eb / r) * P;
    steps.push(
      {
        label: keep === "beta" ? "UFM constraint solved for α (β = β̄)" : "UFM constraint solved for β (α = ᾱ)",
        symbol: keep === "beta" ? "α" : "β",
        value: keep === "beta" ? alpha : beta,
        quantity: "length",
        expr: keep === "beta" ? "e{b} tan θ − e{c} + β tan θ" : "(α + e{c})/tan θ − e{b}",
        ref,
      },
      { label: "Work point to interface centroids", symbol: "r", value: r, quantity: "length", expr: "√[(α + e{c})² + (β + e{b})²]", ref },
    );
  }
  let dV = 0;
  if (kase === "sc2") {
    dV = input.dVb === undefined ? Vb : Math.max(-Math.abs(Vb), Math.min(Math.abs(Vb), Math.sign(Vb || 1) * Math.abs(input.dVb)));
    steps.push({ label: "Vertical force moved to the gusset-to-column interface", symbol: "ΔV{b}", value: dV, quantity: "force", ref });
  }
  const VbI = Vb - dV,
    VcI = Vc + dV;
  // Actual interface centroids; the side not held by the UFM geometry carries the balancing moment.
  const beamAt = { x: ec + (kase === "sc1" || kase === "sc3" || keep === "beta" ? alphaBar : alpha), y: eb };
  const colAt = { x: ec, y: eb + (kase === "sc1" || keep === "beta" ? beta : betaBar) };
  const beam: InterfaceForce = { shear: Hb, normal: VbI, moment: 0, at: beamAt };
  const column: InterfaceForce = { shear: VcI, normal: Hc, moment: 0, at: colAt };
  if (kase === "sc3") column.at = { x: ec, y: eb };
  // Moment closing the gusset free body is assigned to the interface whose actual centroid is not held.
  const braceThrough = kase === "sc1" ? { x: ec, y: eb } : { x: 0, y: 0 };
  const res = gussetResidual(P, theta, beam, column, braceThrough);
  if (keep === "alpha" && kase !== "sc1" && kase !== "sc3" && kase !== "sc2") column.moment = res[2];
  else beam.moment = res[2];
  if (kase === "sc2") steps.push({ label: "Gusset-to-beam moment", symbol: "M{b}", value: beam.moment, quantity: "moment", expr: "ΔV{b}α (+ V{b}(α − ᾱ) if ᾱ ≠ α)", ref });
  else if (Math.abs(beam.moment) > 1e-9)
    steps.push({ label: "Gusset-to-beam moment (actual centroid ᾱ ≠ ideal)", symbol: "M{b}", value: beam.moment, quantity: "moment", expr: "V{b}(α − ᾱ)", ref });
  if (Math.abs(column.moment) > 1e-9)
    steps.push({ label: "Gusset-to-column moment (actual centroid β̄ ≠ ideal)", symbol: "M{c}", value: column.moment, quantity: "moment", expr: "H{c}(β − β̄)", ref });
  const residual = gussetResidual(P, theta, beam, column, braceThrough);
  steps.push(
    { label: "Gusset-to-column horizontal (normal) force", symbol: "H{c}", value: Hc, quantity: "force", expr: kase === "general" || kase === "sc2" ? "e{c}P/r" : "0", ref },
    { label: "Gusset-to-column vertical (shear) force", symbol: "V{c}", value: VcI, quantity: "force", expr: kase === "sc2" ? "βP/r + ΔV{b}" : kase === "sc3" ? "0" : "βP/r", ref },
    { label: "Gusset-to-beam horizontal (shear) force", symbol: "H{b}", value: Hb, quantity: "force", expr: kase === "sc3" ? "P sin θ" : "αP/r", ref },
    { label: "Gusset-to-beam vertical (normal) force", symbol: "V{b}", value: VbI, quantity: "force", expr: kase === "sc2" ? "e{b}P/r − ΔV{b}" : kase === "sc1" ? "0" : kase === "sc3" ? "P cos θ" : "e{b}P/r", ref },
  );
  const R = Math.abs(input.R ?? 0),
    A = Math.abs(input.A ?? 0);
  const beamToColumn = { shear: R + Math.abs(VbI), axial: A + Math.abs(Hc) };
  steps.push(
    { label: "Beam-to-column connection shear (envelope)", symbol: "V{bc}", value: beamToColumn.shear, quantity: "force", expr: "R + |V{b}|", ref },
    { label: "Beam-to-column connection axial (envelope)", symbol: "A{bc}", value: beamToColumn.axial, quantity: "force", expr: "A ± H{c}", ref },
  );
  if (kase === "sc3") warnings.push("Special Case 3: the beam-to-column connection must deliver R + V{b}; the gusset is not attached to the column.");
  if (kase === "sc2") warnings.push("Special Case 2: the beam and gusset-to-beam connection must resist M{b} = ΔV{b}α.");
  return { case: kase, alpha, beta, r, Hb, Vb: VbI, Hc, Vc: VcI, beam, column, beamToColumn, memberMoments: { beam: memberBeam, column: memberColumn }, braceThrough, residual, steps, warnings };
}
