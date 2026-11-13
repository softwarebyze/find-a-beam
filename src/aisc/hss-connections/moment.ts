/**
 * §K3 HSS-to-HSS moment connections — round (Table K3.1) and rectangular (Table K3.2) chords, for
 * T, Y and cross joints under in-plane or out-of-plane branch bending, plus the §K3 interaction of
 * branch axial force with both bending components.
 */
import type { CalcStep, LimitState } from "../types";
import { UnsupportedError } from "../types";
import {
  angleCheck,
  aspectCheck,
  betaCheck,
  compressionBranchCheck,
  ductilityWarnings,
  materialChecks,
  slendernessCheck,
} from "./applicability";
import { branchSection, chordStress, hssFamily, qfRect, qfRound, rectSection, roundSection, WELD_NOTE } from "./params";
import { K_FACTORS, REF } from "./refs";
import { check, finish, sin, state, step } from "./result";
import type {
  ApplicabilityCheck,
  HssConnectionResult,
  MomentConnectionInput,
  MomentInteractionInput,
  MomentInteractionResult,
} from "./types";

export function momentConnection(input: MomentConnectionInput): HssConnectionResult {
  const family = hssFamily(input.chord.shape);
  if (family !== hssFamily(input.branch.shape))
    throw new UnsupportedError("Chapter K moment connections require the chord and branch to be the same HSS family.");
  return family === "round" ? roundMoment(input) : rectMoment(input);
}

/* --------------------------------------------------------------- Table K3.1 */

function roundMoment(input: MomentConnectionInput): HssConnectionResult {
  const c = roundSection(input.chord);
  const b = branchSection(input.branch);
  const theta = input.branch.theta;
  if (theta <= 0 || theta > 90) throw new RangeError("theta must be in (0°, 90°]");
  const inPlane = input.plane === "in-plane";

  const gamma = c.D / (2 * c.t);
  const beta = b.Bb / c.D;
  const cs = chordStress(input.chordLoads, c, input.method);
  const { Qf, steps: qfSteps } = qfRound(cs);
  const s = sin(theta);
  const roles = [
    { ...c, role: "Chord" },
    { Fy: b.Fyb, Fu: b.Fub, label: b.label, role: "Branch" },
  ];

  const params: CalcStep[] = [
    step("Chord diameter", "D", c.D, "length", REF.momentRound),
    step("Chord design wall thickness", "t", c.t, "length", "§B4.2"),
    step("Branch diameter", "D{b}", b.Bb, "length", REF.momentRound),
    step("Diameter ratio", "β", beta, "ratio", REF.momentRound, "D{b}/D"),
    step("Chord slenderness", "γ", gamma, "ratio", REF.momentRound, "D/2t"),
    ...qfSteps,
  ];

  const limitStates: LimitState[] = [];
  if (inPlane) {
    limitStates.push(
      state("CP", "Chord plastification", (5.39 * c.Fy * c.t ** 2 * Math.sqrt(gamma) * beta * b.Bb * Qf) / s, REF.momentRound, K_FACTORS.plastification, {
        expr: "M{n}sinθ = 5.39F{y}t²√γ βD{b}Q{f}",
        quantity: "moment",
      }),
    );
  } else {
    limitStates.push(
      state("CP", "Chord plastification", (c.Fy * c.t ** 2 * b.Bb * (3.0 / (1 - 0.81 * beta)) * Qf) / s, REF.momentRound, K_FACTORS.plastification, {
        expr: "M{n}sinθ = F{y}t²D{b}[3.0/(1 − 0.81β)]Q{f}",
        quantity: "moment",
      }),
    );
  }
  if (b.Bb < c.D - 2 * c.t) {
    const factor = inPlane ? (1 + 3 * s) / (4 * s ** 2) : (3 + s) / (4 * s ** 2);
    limitStates.push(
      state("PS", "Shear yielding (punching)", 0.6 * c.Fy * c.t * b.Bb ** 2 * factor, REF.momentRound, K_FACTORS.punchingShear, {
        expr: inPlane
          ? "M{n} = 0.6F{y}tD{b}²[(1 + 3sinθ)/(4sin²θ)]"
          : "M{n} = 0.6F{y}tD{b}²[(3 + sinθ)/(4sin²θ)]",
        quantity: "moment",
      }),
    );
  }

  const ref = REF.momentRoundLimits;
  const applicability: ApplicabilityCheck[] = [
    slendernessCheck("chord", "Chord wall slenderness", "D/t", c.D / c.t, input.joint === "X" ? 40 : 50, ref),
    slendernessCheck("branch", "Branch wall slenderness", "D{b}/t{b}", b.Bb / b.tb, 50, ref),
    compressionBranchCheck("round", b.Bb / b.tb, b.Fyb, ref),
    betaCheck(beta, 0.2, 1.0, ref, true, "D{b}/D"),
    angleCheck(theta, ref),
    ...materialChecks(roles, ref),
  ];

  return finish({
    section: `§K3 Round HSS-to-HSS ${input.joint === "X" ? "cross" : input.joint}-connection, ${input.plane} bending`,
    quantity: "moment",
    method: input.method,
    params,
    limitStates,
    applicability,
    warnings: [WELD_NOTE, ...ductilityWarnings(roles)],
  });
}

/* --------------------------------------------------------------- Table K3.2 */

function rectMoment(input: MomentConnectionInput): HssConnectionResult {
  const face = input.chordFace;
  const c = rectSection(input.chord, face);
  const b = branchSection(input.branch, face);
  const theta = input.branch.theta;
  if (theta <= 0 || theta > 90) throw new RangeError("theta must be in (0°, 90°]");
  const inPlane = input.plane === "in-plane";

  const gamma = c.B / (2 * c.t);
  const beta = b.Bb / c.B;
  const eta = b.Hb / c.B;
  const cs = chordStress(input.chordLoads, c, input.method);
  const { Qf, steps: qfSteps } = qfRect(cs, beta);
  const cross = input.joint === "X";
  const Fn = cross ? 0.8 * c.Fy : c.Fy;
  const be = Math.min(b.Bb, (10 / (c.B / c.t)) * ((c.Fy * c.t) / (b.Fyb * b.tb)) * b.Bb);
  const beStep = step("Effective branch width", "b{e}", be, "length", REF.momentRect, "[10/(B/t)][F{y}t/(F{yb}t{b})]B{b} ≤ B{b}");
  const roles = [
    { ...c, role: "Chord" },
    { Fy: b.Fyb, Fu: b.Fub, label: b.label, role: "Branch" },
  ];

  const params: CalcStep[] = [
    step("Chord face width", "B", c.B, "length", REF.momentRect),
    step("Chord sidewall depth", "H", c.H, "length", REF.momentRect),
    step("Chord design wall thickness", "t", c.t, "length", "§B4.2"),
    step("Branch width", "B{b}", b.Bb, "length", REF.momentRect),
    step("Branch depth", "H{b}", b.Hb, "length", REF.momentRect),
    step("Width ratio", "β", beta, "ratio", REF.momentRect, "B{b}/B"),
    step("Depth ratio", "η", eta, "ratio", REF.momentRect, "H{b}/B"),
    step("Chord slenderness", "γ", gamma, "ratio", REF.momentRect, "B/2t"),
    ...qfSteps,
  ];

  const limitStates: LimitState[] = [];
  if (inPlane) {
    if (beta <= 0.85)
      limitStates.push(
        state(
          "CWP",
          "Chord wall plastification",
          c.Fy * c.t ** 2 * b.Hb * (1 / (2 * eta) + 2 / Math.sqrt(1 - beta) + eta / (1 - beta)) * Qf,
          REF.momentRect,
          K_FACTORS.wallPlastification,
          {
            expr: "M{n} = F{y}t²H{b}[1/2η + 2/√(1 − β) + η/(1 − β)]Q{f}",
            note: "β ≤ 0.85",
            quantity: "moment",
          },
        ),
      );
    if (beta > 0.85) {
      limitStates.push(
        state("SWY", "Local yielding of chord sidewalls", 0.5 * Fn * c.t * (b.Hb + 5 * c.t) ** 2, REF.momentRect, K_FACTORS.sidewallYielding, {
          expr: `M{n} = 0.5F{n}t(H{b} + 5t)², F{n} = ${cross ? "0.80F{y}" : "F{y}"}`,
          note: "β > 0.85",
          quantity: "moment",
        }),
        state(
          "ULD",
          "Local yielding of the branch (uneven load distribution)",
          b.Fyb * (b.Zb - (1 - be / b.Bb) * b.Bb * b.Hb * b.tb),
          REF.momentRect,
          K_FACTORS.unevenLoad,
          {
            expr: "M{n} = F{yb}[Z{b} − (1 − b{e}/B{b})B{b}H{b}t{b}]",
            steps: [beStep],
            note: "β > 0.85",
            quantity: "moment",
          },
        ),
      );
    }
  } else {
    if (beta <= 0.85)
      limitStates.push(
        state(
          "CWP",
          "Chord wall plastification",
          c.Fy *
            c.t ** 2 *
            ((b.Hb * (1 + beta)) / (2 * (1 - beta)) + Math.sqrt((2 * c.B * b.Bb * (1 + beta)) / (1 - beta))) *
            Qf,
          REF.momentRect,
          K_FACTORS.wallPlastification,
          {
            expr: "M{n} = F{y}t²[H{b}(1 + β)/2(1 − β) + √(2BB{b}(1 + β)/(1 − β))]Q{f}",
            note: "β ≤ 0.85",
            quantity: "moment",
          },
        ),
      );
    if (beta > 0.85)
      limitStates.push(
        state("SWY", "Local yielding of chord sidewalls", Fn * c.t * (c.B - c.t) * (b.Hb + 5 * c.t), REF.momentRect, K_FACTORS.sidewallYielding, {
          expr: `M{n} = F{n}t(B − t)(H{b} + 5t), F{n} = ${cross ? "0.80F{y}" : "F{y}"}`,
          note: "β > 0.85",
          quantity: "moment",
        }),
        state(
          "ULD",
          "Local yielding of the branch (uneven load distribution)",
          b.Fyb * (b.Zb - 0.5 * (1 - be / b.Bb) ** 2 * b.Bb ** 2 * b.tb),
          REF.momentRect,
          K_FACTORS.unevenLoad,
          {
            expr: "M{n} = F{yb}[Z{b} − 0.5(1 − b{e}/B{b})²B{b}²t{b}]",
            steps: [beStep],
            note: "β > 0.85",
            quantity: "moment",
          },
        ),
      );
    // Chord distortional failure applies to T-connections unless the chord is restrained by plates.
    if (input.joint === "T" || input.joint === "Y")
      limitStates.push(
        state(
          "CDF",
          "Chord distortional failure",
          2 * c.Fy * c.t * (b.Hb * c.t + Math.sqrt(c.B * c.H * c.t * (c.B + c.H))),
          REF.momentRect,
          K_FACTORS.distortional,
          {
            expr: "M{n} = 2F{y}t[H{b}t + √(BHt(B + H))]",
            note: "T/Y connections, unless chord distortion is prevented",
            quantity: "moment",
          },
        ),
      );
  }

  const ref = REF.momentRectLimits;
  const applicability: ApplicabilityCheck[] = [
    slendernessCheck("chord-b", "Chord face slenderness", "B/t", c.B / c.t, 35, ref),
    slendernessCheck("chord-h", "Chord sidewall slenderness", "H/t", c.H / c.t, 35, ref),
    slendernessCheck("branch-b", "Branch wall slenderness", "B{b}/t{b}", b.Bb / b.tb, 35, ref),
    slendernessCheck("branch-h", "Branch wall slenderness", "H{b}/t{b}", b.Hb / b.tb, 35, ref),
    compressionBranchCheck("rect", b.Bb / b.tb, b.Fyb, ref),
    betaCheck(beta, 0.25, 1.0, ref, false, "B{b}/B"),
    aspectCheck("chord-aspect", "Chord aspect ratio", "H/B", c.H / c.B, ref),
    aspectCheck("branch-aspect", "Branch aspect ratio", "H{b}/B{b}", b.Hb / b.Bb, ref),
    check("theta90", "Branch angle to the chord", "θ", theta, "= 90°", Math.abs(theta - 90) < 1e-9, ref),
    ...materialChecks(roles, ref),
  ];

  return finish({
    section: `§K3 Rectangular HSS-to-HSS ${cross ? "cross" : input.joint}-connection, ${input.plane} bending`,
    quantity: "moment",
    method: input.method,
    params,
    limitStates,
    applicability,
    warnings: [WELD_NOTE, ...ductilityWarnings(roles)],
  });
}

/**
 * §K3 interaction of branch axial force with in-plane and out-of-plane bending:
 * `Pr/Pc + (Mr-ip/Mc-ip)² + Mr-op/Mc-op ≤ 1.0`. All demands and capacities share one method basis.
 */
export function momentInteraction(input: MomentInteractionInput): MomentInteractionResult {
  const ratioP = input.Pc > 0 ? Math.abs(input.Pr) / input.Pc : 0;
  const ratioIp = input.McIp > 0 ? Math.abs(input.MrIp) / input.McIp : 0;
  const ratioOp = input.McOp > 0 ? Math.abs(input.MrOp) / input.McOp : 0;
  const ratio = ratioP + ratioIp ** 2 + ratioOp;
  const ref = input.family === "round" ? REF.momentRound : REF.momentRect;
  return {
    ratio,
    ref,
    steps: [
      step("Axial force ratio", "P{r}/P{c}", ratioP, "ratio", ref),
      step("In-plane bending ratio", "M{r-ip}/M{c-ip}", ratioIp, "ratio", ref),
      step("Out-of-plane bending ratio", "M{r-op}/M{c-op}", ratioOp, "ratio", ref),
      step("Interaction", "", ratio, "ratio", ref, "P{r}/P{c} + (M{r-ip}/M{c-ip})² + M{r-op}/M{c-op} ≤ 1.0"),
    ],
  };
}
