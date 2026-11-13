/**
 * §K4 Welds of plates and branches to rectangular HSS.
 *
 * Table K4.1 gives the EFFECTIVE weld length le: the branch corners are discounted by 1.2tb, and
 * the toe weld of a steeply inclined branch is not counted because the connection is too flexible
 * there to develop it. Weld strength then follows §J2.4 with Fnw = 0.60FEXX applied over le; §K4
 * does not permit the directional strength increase of §J2.4(a).
 *
 * `filletWeldStrengthPerIn` mirrors `filletWeld` from "@/aisc/connections"; it is implemented here
 * so the Chapter K engine does not depend on the §J2 module.
 */
import type { CalcStep, LimitState } from "../types";
import { UnsupportedError } from "../types";
import { branchSection, hssFamily, rectSection, roundSection } from "./params";
import { K_FACTORS, REF } from "./refs";
import { finish, sin, state, step } from "./result";
import type { BranchWeldInput, EffectiveWeldLength, HssConnectionResult } from "./types";

/** Available shear strength per inch of a fillet weld of leg w: Fnw × 0.707w, Fnw = 0.60FEXX. */
export const filletWeldStrengthPerIn = (w: number, FEXX = 70) => 0.6 * FEXX * 0.707 * w;

/**
 * Fraction of the branch toe weld that is effective: full below 50°, none at or above 60°, linear
 * between (Table K4.1).
 */
export function toeEffectiveness(theta: number): number {
  if (theta <= 50) return 1;
  if (theta >= 60) return 0;
  return (60 - theta) / 10;
}

/**
 * Table K4.1 effective weld length and the effective weld section moduli derived from it.
 *
 * Effective weld lines on the chord face: two of length L = (Hb − 1.2tb)/sin θ along the chord
 * axis, the heel of length W = Bb − 1.2tb, and the toe counted through `toeEffectiveness`. So
 *   θ ≤ 50°:  le = 2(Hb − 1.2tb)/sin θ + 2(Bb − 1.2tb)
 *   θ ≥ 60°:  le = 2(Hb − 1.2tb)/sin θ + (Bb − 1.2tb)
 * The section moduli are the standard line-element properties of that same weld group, with the
 * transverse welds taken symmetrically at their average effectiveness.
 */
export function effectiveWeldProperties(input: {
  Bb: number;
  Hb: number;
  tb: number;
  theta: number;
}): EffectiveWeldLength {
  const { Bb, Hb, tb, theta } = input;
  const s = sin(theta);
  const L = (Hb - 1.2 * tb) / s;
  const W = Bb - 1.2 * tb;
  if (L <= 0 || W <= 0) throw new RangeError("branch corner deduction 1.2tb exceeds the branch dimensions");
  const kToe = toeEffectiveness(theta);
  const le = 2 * L + (1 + kToe) * W;
  // Transverse welds share the effective count equally so the group stays symmetric.
  const nT = (1 + kToe) / 2;
  const Iip = (2 * L ** 3) / 12 + 2 * nT * W * (L / 2) ** 2;
  const Iop = 2 * L * (W / 2) ** 2 + (2 * nT * W ** 3) / 12;
  return {
    le,
    Sip: Iip / (L / 2),
    Sop: Iop / (W / 2),
    steps: [
      step("Effective weld length along the chord", "L", L, "length", REF.weldProps, "(H{b} − 1.2t{b})/sinθ"),
      step("Effective weld width across the chord", "W", W, "length", REF.weldProps, "B{b} − 1.2t{b}"),
      step("Toe weld effectiveness", "", kToe, "ratio", REF.weldProps, "1.0 at θ ≤ 50°, 0 at θ ≥ 60°"),
      step("Total effective weld length", "l{e}", le, "length", REF.weldProps, "2L + (1 + k{toe})W"),
      step("Effective in-plane section modulus", "S{ip}", Iip / (L / 2), "modulus", REF.weldSection),
      step("Effective out-of-plane section modulus", "S{op}", Iop / (W / 2), "modulus", REF.weldSection),
    ],
    warnings:
      kToe < 1 && kToe > 0
        ? ["The toe weld effectiveness is interpolated between 50° and 60° per Table K4.1."]
        : [],
  };
}

/** Round branches weld around the full saddle; the whole perimeter is effective under §J2. */
export function roundBranchWeldLength(Db: number, theta: number): EffectiveWeldLength {
  const s = sin(theta);
  // Saddle-curve perimeter of a cylinder cut at θ, to the usual (π/2)(a + b) ellipse approximation.
  const a = Db / 2;
  const bAx = Db / (2 * s);
  const le = (Math.PI / 2) * (a + bAx) * (1 + (3 * ((a - bAx) / (a + bAx)) ** 2) / (10 + Math.sqrt(4 - 3 * ((a - bAx) / (a + bAx)) ** 2)));
  return {
    le,
    steps: [
      step("Branch diameter", "D{b}", Db, "length", "§J2.4"),
      step("Weld length around the saddle", "l{e}", le, "length", "§J2.4", "elliptical footprint perimeter, D{b} × D{b}/sinθ"),
    ],
    warnings: ["§K4 tabulates effective weld lengths for rectangular HSS only; the full saddle length is used here."],
  };
}

/**
 * Weld and base-metal strength of a branch-to-chord weld over the §K4 effective length. Returns the
 * branch axial force the weld can deliver.
 */
export function branchWeld(input: BranchWeldInput): HssConnectionResult {
  const family = hssFamily(input.chord.shape);
  const theta = input.branch.theta;
  if (theta <= 0 || theta > 90) throw new RangeError("theta must be in (0°, 90°]");
  if (!Number.isFinite(input.w) || input.w <= 0) throw new RangeError("weld size w must be finite and positive");
  const FEXX = input.FEXX ?? 70;
  const b = branchSection(input.branch, input.chordFace);
  const chordT = family === "round" ? roundSection(input.chord).t : rectSection(input.chord, input.chordFace).t;
  const chordFu = input.chord.material.Fu;
  const props =
    family === "round" ? roundBranchWeldLength(b.Bb, theta) : effectiveWeldProperties({ ...b, theta });

  const throat = 0.707 * input.w;
  const params: CalcStep[] = [
    step("Fillet weld leg size", "w", input.w, "length", "§J2.2b"),
    step("Effective throat", "t{e}", throat, "length", "§J2.2a", "0.707w"),
    step("Filler metal strength", "F{EXX}", FEXX, "stress", "§J2.4"),
    ...props.steps,
  ];

  const limitStates: LimitState[] = [
    state("W", "Weld shear rupture", 0.6 * FEXX * throat * props.le, REF.weldStrength, K_FACTORS.weld, {
      expr: "R{n} = F{nw}t{e}l{e}, F{nw} = 0.60F{EXX}",
      note: "no §J2.4(a) directional strength increase",
    }),
    state("BMb", "Branch wall shear rupture at the weld", 0.6 * b.Fub * b.tb * props.le, "§J4.2(b)", K_FACTORS.weld, {
      expr: "R{n} = 0.60F{u}t{b}l{e}",
    }),
    state("BMc", "Chord wall shear rupture at the weld", 0.6 * chordFu * chordT * props.le, "§J4.2(b)", K_FACTORS.weld, {
      expr: "R{n} = 0.60F{u}tl{e}",
    }),
  ];

  if (family === "rect" && (input.joint === "T" || input.joint === "Y" || input.joint === "X") && b.Bb > 0) {
    const grossBranch = b.Ab * b.Fyb;
    params.push(step("Branch yield capacity", "A{b}F{yb}", grossBranch, "force", "§K4"));
  }

  return finish({
    section: `§K4 Branch-to-${family === "round" ? "round" : "rectangular"}-HSS weld, effective length basis`,
    quantity: "force",
    method: input.method,
    params,
    limitStates,
    applicability: [],
    warnings: [
      ...props.warnings,
      "§K4 requires welds that develop the branch wall strength unless the connection is designed for the computed forces only.",
    ],
  });
}

/** Weld strength in branch bending, using the Table K4.1 effective section moduli. */
export function branchWeldMoment(input: BranchWeldInput & { plane: "in-plane" | "out-of-plane" }): HssConnectionResult {
  if (hssFamily(input.chord.shape) !== "rect")
    throw new UnsupportedError("§K4 effective weld section moduli are tabulated for rectangular HSS only.");
  const b = branchSection(input.branch, input.chordFace);
  const props = effectiveWeldProperties({ ...b, theta: input.branch.theta });
  const S = (input.plane === "in-plane" ? props.Sip : props.Sop)!;
  const FEXX = input.FEXX ?? 70;
  const throat = 0.707 * input.w;
  return finish({
    section: `§K4 Branch-to-rectangular-HSS weld, ${input.plane} bending`,
    quantity: "moment",
    method: input.method,
    params: [
      step("Fillet weld leg size", "w", input.w, "length", "§J2.2b"),
      step("Effective throat", "t{e}", throat, "length", "§J2.2a", "0.707w"),
      ...props.steps,
    ],
    limitStates: [
      state("W", "Weld shear rupture in bending", 0.6 * FEXX * throat * S, REF.weldStrength, K_FACTORS.weld, {
        expr: "M{n} = F{nw}t{e}S{eff}",
        quantity: "moment",
      }),
    ],
    applicability: [],
    warnings: props.warnings,
  });
}
