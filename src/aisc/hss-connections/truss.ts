/**
 * §K2 HSS-to-HSS truss connections — round chords and branches (Table K2.1) and rectangular
 * chords and branches (Table K2.2), for T, Y, cross and K (gapped or overlapped) joints.
 *
 * Table equations give the component normal to the chord face, `Pn sin θ = …`; the returned nominal
 * strength is the branch axial force.
 */
import { E } from "@/data/materials";
import type { CalcStep, LimitState } from "../types";
import { UnsupportedError } from "../types";
import {
  angleCheck,
  aspectCheck,
  betaCheck,
  compressionBranchCheck,
  ductilityWarnings,
  gapCheck,
  materialChecks,
  overlapChecks,
  slendernessCheck,
  zetaCheck,
} from "./applicability";
import { branchSection, chordStress, hssFamily, qfRect, qfRound, rectSection, roundSection, WELD_NOTE } from "./params";
import { betaEop, wallYieldLine } from "./plate";
import { K_FACTORS, REF } from "./refs";
import { check, finish, sin, state, step } from "./result";
import type { ApplicabilityCheck, Branch, HssConnectionResult, TrussConnectionInput } from "./types";

const isK = (joint: TrussConnectionInput["joint"]) => joint === "K-gap" || joint === "K-overlap";

/** Branch force sign (+ tension) picks the compression branch of a K joint; branch 1 is the default. */
function kPair(input: TrussConnectionInput): { compression: Branch; tension: Branch; other: Branch } {
  const other = input.otherBranch;
  if (!other) throw new UnsupportedError("A K-connection needs two branches.");
  const firstIsCompression = (input.branch.force ?? -1) < 0;
  return firstIsCompression
    ? { compression: input.branch, tension: other, other }
    : { compression: other, tension: input.branch, other };
}

/**
 * Gap along the chord face, in. Negative for an overlapped joint, where the magnitude is the
 * overlap length q = Ov/100 × p and p is the through-chord footprint of the overlapping branch.
 */
function gapOf(input: TrussConnectionInput, HbOverlapping: number): number {
  if (input.joint === "K-gap") return input.gap ?? 0;
  const p = HbOverlapping / sin(input.branch.theta);
  return -((input.overlap ?? 0) / 100) * p;
}

export function trussConnection(input: TrussConnectionInput): HssConnectionResult {
  const family = hssFamily(input.chord.shape);
  if (family !== hssFamily(input.branch.shape))
    throw new UnsupportedError("Chapter K truss connections require the chord and branch to be the same HSS family.");
  return family === "round" ? roundTruss(input) : rectTruss(input);
}

/* --------------------------------------------------------------- Table K2.1 */

function roundTruss(input: TrussConnectionInput): HssConnectionResult {
  const c = roundSection(input.chord);
  const b = branchSection(input.branch);
  const theta = input.branch.theta;
  if (theta <= 0 || theta > 90) throw new RangeError("theta must be in (0°, 90°]");

  const gamma = c.D / (2 * c.t);
  const beta = b.Bb / c.D;
  const cs = chordStress(input.chordLoads, c, input.method);
  const { Qf, steps: qfSteps } = qfRound(cs);
  const s = sin(theta);
  const compressionBranch = (input.branch.force ?? -1) < 0;
  const roles = [
    { ...c, role: "Chord" },
    { Fy: b.Fyb, Fu: b.Fub, label: b.label, role: "Branch" },
  ];

  const params: CalcStep[] = [
    step("Chord diameter", "D", c.D, "length", REF.trussRound),
    step("Chord design wall thickness", "t", c.t, "length", "§B4.2"),
    step("Branch diameter", "D{b}", b.Bb, "length", REF.trussRound),
    step("Branch design wall thickness", "t{b}", b.tb, "length", "§B4.2"),
    step("Diameter ratio", "β", beta, "ratio", REF.trussRound, "D{b}/D"),
    step("Chord slenderness", "γ", gamma, "ratio", REF.trussRound, "D/2t"),
    ...qfSteps,
  ];

  const limitStates: LimitState[] = [];
  if (input.joint === "T" || input.joint === "Y") {
    const Pn = (c.Fy * c.t ** 2 * (3.1 + 15.6 * beta ** 2) * gamma ** 0.2 * Qf) / s;
    limitStates.push(
      state("CP", "Chord plastification", Pn, REF.roundTY, K_FACTORS.plastification, {
        expr: "P{n}sinθ = F{y}t²(3.1 + 15.6β²)γ^0.2 Q{f}",
      }),
    );
  } else if (input.joint === "X") {
    const Pn = (c.Fy * c.t ** 2 * (5.7 / (1 - 0.81 * beta)) * Qf) / s;
    limitStates.push(
      state("CP", "Chord plastification", Pn, REF.roundCross, K_FACTORS.plastification, {
        expr: "P{n}sinθ = F{y}t²[5.7/(1 − 0.81β)]Q{f}",
      }),
    );
  } else {
    const { compression } = kPair(input);
    const comp = branchSection(compression);
    const g = gapOf(input, comp.Hb);
    // Eq. K2-5: the gap factor Qg; g is negative for an overlapped joint.
    const Qg = gamma ** 0.2 * (1 + (0.024 * gamma ** 1.2) / (1 + Math.exp((0.5 * g) / c.t - 1.33)));
    // Eq. K2-3 is written for the compression branch; Eq. K2-4 gives the tension branch the same value.
    const Pn = (c.Fy * c.t ** 2 * (2.0 + (11.33 * comp.Bb) / c.D) * Qg * Qf) / sin(compression.theta);
    params.push(
      step("Gap along the chord", "g", g, "length", REF.trussRound, input.joint === "K-overlap" ? "−q (overlap)" : undefined),
      step("Gap factor", "Q{g}", Qg, "ratio", REF.roundQg, "γ^0.2[1 + 0.024γ^1.2/(1 + e^(0.5g/t − 1.33))]"),
    );
    limitStates.push(
      state("CP", "Chord plastification", Pn, compressionBranch ? REF.roundKComp : REF.roundKTens, K_FACTORS.plastification, {
        expr: "P{n}sinθ = F{y}t²(2.0 + 11.33D{b}/D)Q{g}Q{f}",
        note: compressionBranch
          ? "compression branch"
          : "tension branch — equal to the compression branch strength",
      }),
    );
  }

  // Eq. K2-6: punching shear only arises when the branch footprint lies inside the chord wall.
  if (b.Bb < c.D - 2 * c.t) {
    const Pn = (0.6 * c.Fy * c.t * Math.PI * b.Bb * (1 + s)) / (2 * s ** 2);
    limitStates.push(
      state("PS", "Shear yielding (punching)", Pn, REF.roundPunch, K_FACTORS.punchingShear, {
        expr: "P{n} = 0.6F{y}tπD{b}(1 + sinθ)/(2sin²θ)",
      }),
    );
  }

  const ref = REF.trussRoundLimits;
  const applicability: ApplicabilityCheck[] = [
    slendernessCheck("chord", "Chord wall slenderness", "D/t", c.D / c.t, input.joint === "X" ? 40 : 50, ref),
    compressionBranch
      ? compressionBranchCheck("round", b.Bb / b.tb, b.Fyb, ref)
      : slendernessCheck("branch", "Tension branch wall slenderness", "D{b}/t{b}", b.Bb / b.tb, 50, ref),
    betaCheck(beta, 0.2, 1.0, ref, true, "D{b}/D"),
    angleCheck(theta, ref),
    ...materialChecks(roles, ref),
  ];
  if (isK(input.joint)) applicability.push(...kApplicability(input, ref));

  return finish({
    section: `§K2 Round HSS-to-HSS ${jointName(input.joint)} truss connection`,
    quantity: "force",
    method: input.method,
    params,
    limitStates,
    applicability,
    warnings: [WELD_NOTE, ...ductilityWarnings(roles)],
  });
}

/* --------------------------------------------------------------- Table K2.2 */

function rectTruss(input: TrussConnectionInput): HssConnectionResult {
  const face = input.chordFace;
  const c = rectSection(input.chord, face);
  const b = branchSection(input.branch, face);
  const theta = input.branch.theta;
  if (theta <= 0 || theta > 90) throw new RangeError("theta must be in (0°, 90°]");

  const gamma = c.B / (2 * c.t);
  const beta = b.Bb / c.B;
  const eta = b.Hb / c.B;
  const s = sin(theta);
  const lb = b.Hb / s;
  const compressionBranch = (input.branch.force ?? -1) < 0;
  const ref = REF.trussRectLimits;
  const roles = [
    { ...c, role: "Chord" },
    { Fy: b.Fyb, Fu: b.Fub, label: b.label, role: "Branch" },
  ];

  // βeff averages all four branch walls for a K connection and drives Qf there.
  const other = input.otherBranch ? branchSection(input.otherBranch, face) : undefined;
  const betaEff = other ? (b.Bb + b.Hb + other.Bb + other.Hb) / (4 * c.B) : beta;
  const cs = chordStress(input.chordLoads, c, input.method);
  const { Qf, steps: qfSteps } = qfRect(cs, isK(input.joint) ? betaEff : beta);

  const params: CalcStep[] = [
    step("Chord face width", "B", c.B, "length", REF.trussRect),
    step("Chord sidewall depth", "H", c.H, "length", REF.trussRect),
    step("Chord design wall thickness", "t", c.t, "length", "§B4.2"),
    step("Branch width", "B{b}", b.Bb, "length", REF.trussRect),
    step("Branch depth", "H{b}", b.Hb, "length", REF.trussRect),
    step("Branch design wall thickness", "t{b}", b.tb, "length", "§B4.2"),
    step("Width ratio", "β", beta, "ratio", REF.trussRect, "B{b}/B"),
    step("Depth ratio", "η", eta, "ratio", REF.trussRect, "H{b}/B"),
    step("Chord slenderness", "γ", gamma, "ratio", REF.trussRect, "B/2t"),
    ...(isK(input.joint) ? [step("Effective width ratio", "β{eff}", betaEff, "ratio", REF.rectKPlast, "(B{b1} + H{b1} + B{b2} + H{b2})/4B")] : []),
    ...qfSteps,
  ];

  // be: effective width of a branch wall transverse to the chord, from uneven load distribution.
  const be = Math.min(b.Bb, (10 / (c.B / c.t)) * ((c.Fy * c.t) / (b.Fyb * b.tb)) * b.Bb);
  const beStep = step("Effective branch width", "b{e}", be, "length", REF.trussRect, "[10/(B/t)][F{y}t/(F{yb}t{b})]B{b} ≤ B{b}");

  const limitStates: LimitState[] = [];
  const applicability: ApplicabilityCheck[] = [
    slendernessCheck("chord-b", "Chord face slenderness", "B/t", c.B / c.t, input.joint === "K-overlap" ? 30 : 35, ref),
    slendernessCheck("chord-h", "Chord sidewall slenderness", "H/t", c.H / c.t, input.joint === "K-overlap" ? 30 : 35, ref),
    slendernessCheck("branch-b", "Branch wall slenderness", "B{b}/t{b}", b.Bb / b.tb, 35, ref),
    slendernessCheck("branch-h", "Branch wall slenderness", "H{b}/t{b}", b.Hb / b.tb, 35, ref),
    ...(compressionBranch ? [compressionBranchCheck("rect", b.Bb / b.tb, b.Fyb, ref)] : []),
    aspectCheck("chord-aspect", "Chord aspect ratio", "H/B", c.H / c.B, ref),
    aspectCheck("branch-aspect", "Branch aspect ratio", "H{b}/B{b}", b.Hb / b.Bb, ref),
    angleCheck(theta, ref),
    ...materialChecks(roles, ref),
  ];

  if (!isK(input.joint)) {
    applicability.splice(5, 0, betaCheck(beta, 0.25, 1.0, ref, false, "B{b}/B"));
    const punchLimit = 1 - 1 / gamma;
    if (beta <= 0.85)
      limitStates.push(
        state("CWP", "Chord wall plastification", wallYieldLine(c.Fy, c.t, eta, beta, Qf) / s, REF.rectTYPlast, K_FACTORS.wallPlastification, {
          expr: "P{n}sinθ = F{y}t²[2η/(1 − β) + 4/√(1 − β)]Q{f}",
          note: "β ≤ 0.85",
        }),
      );
    if (beta >= 0.85 && beta <= punchLimit && b.Bb < c.B - 2 * c.t) {
      const bop = betaEop(beta, gamma);
      limitStates.push(
        state("PS", "Shear yielding (punching)", (0.6 * c.Fy * c.t * c.B * (2 * eta + 2 * bop)) / s, REF.rectTYPunch, K_FACTORS.punchingShear, {
          expr: "P{n}sinθ = 0.6F{y}tB(2η + 2β{eop})",
          steps: [step("Effective punching width ratio", "β{eop}", bop, "ratio", REF.rectTYPunch, "5β/γ ≤ β")],
          note: "0.85 ≤ β ≤ 1 − 1/γ",
        }),
      );
    }
    if (beta > 0.85) {
      // Cross-connections lose the restraint a T/Y chord provides, so Fn drops to 0.8Fy.
      const Fn = input.joint === "X" ? 0.8 * c.Fy : c.Fy;
      limitStates.push(
        state("SWY", "Local yielding of chord sidewalls", (2 * Fn * c.t * (5 * c.t + lb)) / s, REF.rectSidewallYield, K_FACTORS.sidewallYielding, {
          expr: `P{n}sinθ = 2F{n}t(5t + l{b}), l{b} = H{b}/sinθ, F{n} = ${input.joint === "X" ? "0.80F{y}" : "F{y}"}`,
          steps: [step("Bearing length along the chord", "l{b}", lb, "length", REF.rectSidewallYield, "H{b}/sinθ")],
          note: "β > 0.85",
        }),
      );
      if (compressionBranch)
        limitStates.push(
          input.joint === "X"
            ? state(
                "SWB",
                "Local buckling of chord sidewalls",
                ((48 * c.t ** 3) / (c.H - 3 * c.t)) * Math.sqrt(E * c.Fy) * Qf / s,
                REF.rectSidewallCripple,
                K_FACTORS.plastification,
                { expr: "P{n}sinθ = [48t³/(H − 3t)]√(EF{y})Q{f}", note: "cross-connection, branch in compression" },
              )
            : state(
                "SWC",
                "Local crippling of chord sidewalls",
                (1.6 * c.t ** 2 * (1 + (3 * lb) / (c.H - 3 * c.t)) * Math.sqrt(E * c.Fy) * Qf) / s,
                REF.rectSidewallCripple,
                K_FACTORS.sidewallCrippling,
                { expr: "P{n}sinθ = 1.6t²[1 + 3l{b}/(H − 3t)]√(EF{y})Q{f}", note: "T/Y connection, branch in compression" },
              ),
        );
      limitStates.push(
        state("ULD", "Local yielding of the branch (uneven load distribution)", b.Fyb * b.tb * (2 * b.Hb + 2 * be - 4 * b.tb), REF.rectTYUneven, K_FACTORS.unevenLoad, {
          expr: "P{n} = F{yb}t{b}(2H{b} + 2b{e} − 4t{b})",
          steps: [beStep],
          note: "β ≥ 0.85",
        }),
      );
    }
  } else if (input.joint === "K-gap") {
    const g = input.gap ?? 0;
    const zeta = g / c.B;
    applicability.splice(
      5,
      0,
      betaCheck(beta, 0.1 + gamma / 50, 1.0, ref, false, "B{b}/B"),
      gapCheck(g, b.tb, other?.tb ?? b.tb, ref),
      zetaCheck(zeta, betaEff, ref),
    );
    params.push(step("Gap along the chord face", "g", g, "length", REF.trussRect), step("Gap ratio", "ζ", zeta, "ratio", REF.trussRect, "g/B"));
    // Eq. K2-12 is written for the branch under consideration with the joint-wide βeff.
    limitStates.push(
      state("CWP", "Chord wall plastification", (c.Fy * c.t ** 2 * 9.8 * betaEff * Math.sqrt(gamma) * Qf) / s, REF.rectKPlast, K_FACTORS.plastification, {
        expr: "P{n}sinθ = 9.8F{y}t²β{eff}√γ Q{f}",
      }),
    );
    if (beta <= 1 - 1 / gamma && b.Bb < c.B - 2 * c.t) {
      const bop = betaEop(beta, gamma);
      limitStates.push(
        state("PS", "Shear yielding (punching)", (0.6 * c.Fy * c.t * c.B * (2 * eta + beta + bop)) / s, REF.rectKPunch, K_FACTORS.punchingShear, {
          expr: "P{n}sinθ = 0.6F{y}tB(2η + β + β{eop})",
          steps: [step("Effective punching width ratio", "β{eop}", bop, "ratio", REF.rectKPunch, "5β/γ ≤ β")],
          note: "β ≤ 1 − 1/γ",
        }),
      );
    }
    limitStates.push(
      state("ULD", "Local yielding of the branch (uneven load distribution)", b.Fyb * b.tb * (2 * b.Hb + b.Bb + be - 4 * b.tb), REF.rectKUneven, K_FACTORS.unevenLoad, {
        expr: "P{n} = F{yb}t{b}(2H{b} + B{b} + b{e} − 4t{b})",
        steps: [beStep],
      }),
    );
    // Chapter G shear of the chord sidewalls across the gap; Cv2 = 1.0 for a compact wall.
    const h = c.H - 3 * c.t;
    const Vn = 0.6 * c.Fy * (2 * h * c.t);
    limitStates.push(
      state("CS", "Shear yielding of the chord sidewalls across the gap", Vn / s, REF.chordShear, K_FACTORS.chordShear, {
        expr: "V{n} = 0.60F{y}A{w}C{v2}, A{w} = 2ht",
        steps: [step("Chord shear area across the gap", "A{w}", 2 * h * c.t, "area", REF.chordShear, "2(H − 3t)t")],
        note: "the chord must also carry the gap axial force and shear together under Chapter H",
      }),
    );
  } else {
    // Overlapped K: branch i (input.branch) overlaps branch j (input.otherBranch).
    if (!other) throw new UnsupportedError("An overlapped K-connection needs both branches.");
    const Ov = input.overlap ?? 0;
    const beOv = Math.min(b.Bb, (10 / (other.Bb / other.tb)) * ((other.Fyb * other.tb) / (b.Fyb * b.tb)) * b.Bb);
    applicability.splice(
      5,
      0,
      betaCheck(beta, 0.25, 1.0, ref, false, "B{bi}/B"),
      ...overlapChecks(Ov, b.Bb / other.Bb, b.tb / other.tb, ref),
    );
    params.push(
      step("Overlap", "O{v}", Ov, "ratio", REF.trussRect, "q/p × 100%"),
      step("Effective width at the chord", "b{eoi}", be, "length", REF.trussRect, "[10/(B/t)][F{y}t/(F{ybi}t{bi})]B{bi} ≤ B{bi}"),
      step("Effective width at the overlapped branch", "b{eov}", beOv, "length", REF.trussRect, "[10/(B{bj}/t{bj})][F{ybj}t{bj}/(F{ybi}t{bi})]B{bi} ≤ B{bi}"),
    );
    const core = 2 * b.Hb - 4 * b.tb;
    const [Pn, eqRef, expr, note] =
      Ov < 50
        ? [
            b.Fyb * b.tb * ((Ov / 50) * core + be + beOv),
            REF.rectOverlapLow,
            "P{n} = F{ybi}t{bi}[(O{v}/50)(2H{bi} − 4t{bi}) + b{eoi} + b{eov}]",
            "25% ≤ O{v} < 50%",
          ]
        : Ov < 80
          ? [
              b.Fyb * b.tb * (core + be + beOv),
              REF.rectOverlapMid,
              "P{n} = F{ybi}t{bi}[2H{bi} − 4t{bi} + b{eoi} + b{eov}]",
              "50% ≤ O{v} < 80%",
            ]
          : [
              b.Fyb * b.tb * (core + b.Bb + beOv),
              REF.rectOverlapHigh,
              "P{n} = F{ybi}t{bi}[2H{bi} − 4t{bi} + B{bi} + b{eov}]",
              "80% ≤ O{v} ≤ 100%",
            ];
    limitStates.push(
      state("ULD", "Local yielding of the overlapping branch (uneven load distribution)", Pn as number, eqRef as string, K_FACTORS.unevenLoad, {
        expr: expr as string,
        note: note as string,
      }),
    );
    // The overlapped branch is limited in proportion to its own yield capacity.
    const scale = (other.Ab * other.Fyb) / (b.Ab * b.Fyb);
    limitStates.push(
      state("ULDj", "Local yielding of the overlapped branch", (Pn as number) * scale, REF.trussRect, K_FACTORS.unevenLoad, {
        expr: "P{n,j} ≤ P{n,i}(A{bj}F{ybj})/(A{bi}F{ybi})",
        steps: [step("Branch capacity ratio", "A{bj}F{ybj}/A{bi}F{ybi}", scale, "ratio", REF.trussRect)],
      }),
    );
  }

  return finish({
    section: `§K2 Rectangular HSS-to-HSS ${jointName(input.joint)} truss connection`,
    quantity: "force",
    method: input.method,
    params,
    limitStates,
    applicability,
    warnings: [WELD_NOTE, ...ductilityWarnings(roles)],
  });
}

function kApplicability(input: TrussConnectionInput, ref: string): ApplicabilityCheck[] {
  const b = branchSection(input.branch);
  const other = input.otherBranch ? branchSection(input.otherBranch) : undefined;
  if (!other) return [];
  if (input.joint === "K-gap") return [gapCheck(input.gap ?? 0, b.tb, other.tb, ref)];
  return overlapChecks(input.overlap ?? 0, b.Bb / other.Bb, b.tb / other.tb, ref);
}

const jointName = (joint: TrussConnectionInput["joint"]): string =>
  joint === "K-gap" ? "gapped K" : joint === "K-overlap" ? "overlapped K" : joint === "X" ? "cross" : joint;

/** Eccentricity of a K joint, in.: positive away from the chord centerline (§K2 user note). */
export function kEccentricity(input: {
  H: number;
  Hb1: number;
  Hb2: number;
  theta1: number;
  theta2: number;
  gap: number;
}): { e: number; steps: CalcStep[] } {
  const { H, Hb1, Hb2, theta1, theta2, gap } = input;
  const s1 = sin(theta1);
  const s2 = sin(theta2);
  const t1 = Math.tan((theta1 * Math.PI) / 180);
  const t2 = Math.tan((theta2 * Math.PI) / 180);
  // Noding eccentricity from the branch centerlines meeting off the chord axis (CIDECT geometry).
  const e =
    (Hb1 / (2 * s1) + Hb2 / (2 * s2) + gap) * ((s1 * s2) / Math.sin(((theta1 + theta2) * Math.PI) / 180)) - H / 2;
  return {
    e,
    steps: [
      step("Noding eccentricity", "e", e, "length", REF.trussRect, "[H{b1}/2sinθ{1} + H{b2}/2sinθ{2} + g]·sinθ{1}sinθ{2}/sin(θ{1}+θ{2}) − H/2"),
      step("Eccentricity ratio", "e/H", e / H, "ratio", REF.trussRect, undefined, `tanθ ratio ${(t1 / t2).toFixed(3)}`),
    ],
  };
}

export const gapForEccentricity = (input: {
  H: number;
  Hb1: number;
  Hb2: number;
  theta1: number;
  theta2: number;
  e: number;
}): number => {
  const { H, Hb1, Hb2, theta1, theta2, e } = input;
  const s1 = sin(theta1);
  const s2 = sin(theta2);
  const k = (s1 * s2) / Math.sin(((theta1 + theta2) * Math.PI) / 180);
  return (e + H / 2) / k - Hb1 / (2 * s1) - Hb2 / (2 * s2);
};

export { check as applicabilityCheck };
