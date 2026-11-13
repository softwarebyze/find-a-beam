/**
 * §K1 Concentrated forces on HSS — plates welded to round HSS (Table K1.1) and to rectangular HSS
 * (Table K1.2), plus concentrated axial force on a capped HSS end.
 *
 * All table equations are written for the component normal to the chord face, `Rn sin θ = …`, so the
 * returned nominal strength is the force along the plate axis.
 */
import { E } from "@/data/materials";
import type { CalcStep, LimitState } from "../types";
import { UnsupportedError } from "../types";
import { angleCheck, aspectCheck, betaCheck, ductilityWarnings, materialChecks, slendernessCheck } from "./applicability";
import { chordStress, hssFamily, qfRect, qfRound, rectSection, roundSection } from "./params";
import { K_FACTORS, REF } from "./refs";
import { check, finish, sin, state, step } from "./result";
import type { ApplicabilityCheck, CapPlateInput, HssConnectionResult, PlateToHssInput } from "./types";

/**
 * Chord wall yield-line mechanism of a rectangular HSS face,
 * `Fy t² [2η/(1 − β) + 4/√(1 − β)] Qf`. Transverse plates use β = Bp/B and η = lb/B; longitudinal
 * plates use β = tp/B and η = lb/B; branches use β = Bb/B and η = Hb/B.
 */
export function wallYieldLine(Fy: number, t: number, eta: number, beta: number, Qf: number): number {
  if (beta >= 1) return NaN;
  return Fy * t ** 2 * ((2 * eta) / (1 - beta) + 4 / Math.sqrt(1 - beta)) * Qf;
}

/** Effective punching-shear width ratio βeop = 5β/γ ≤ β. */
export const betaEop = (beta: number, gamma: number) => Math.min(beta, (5 * beta) / gamma);

export function plateToHss(input: PlateToHssInput): HssConnectionResult {
  return hssFamily(input.chord.shape) === "round" ? plateToRoundHss(input) : plateToRectHss(input);
}

/* --------------------------------------------------------------- Table K1.1 */

function plateToRoundHss(input: PlateToHssInput): HssConnectionResult {
  const c = roundSection(input.chord);
  const theta = input.theta ?? 90;
  const { Bp, lb, tp, kind } = input;
  for (const [name, v] of [
    ["Bp", Bp],
    ["lb", lb],
    ["tp", tp],
  ] as const)
    if (!Number.isFinite(v) || v <= 0) throw new RangeError(`${name} must be finite and positive`);
  if (theta <= 0 || theta > 90) throw new RangeError("theta must be in (0°, 90°]");

  const beta = Bp / c.D;
  const cs = chordStress(input.chordLoads, c, input.method);
  const { Qf, steps: qfSteps } = qfRound(cs);
  const s = sin(theta);

  const params: CalcStep[] = [
    step("Chord diameter", "D", c.D, "length", REF.plateRound),
    step("Chord design wall thickness", "t", c.t, "length", "§B4.2"),
    step("Chord slenderness", "D/t", c.D / c.t, "ratio", REF.plateRound),
    ...(kind === "transverse" ? [step("Width ratio", "β", beta, "ratio", REF.plateRound, "B{p}/D")] : []),
    ...(kind !== "transverse" ? [step("Plate length ratio", "l{b}/D", lb / c.D, "ratio", REF.plateRound)] : []),
    ...qfSteps,
  ];

  const limitStates: LimitState[] = [];
  if (kind === "transverse") {
    // Rn sin θ = 5.5 Fy t² Qf /(1 − 0.81β)
    const Rn = (5.5 * c.Fy * c.t ** 2 * Qf) / ((1 - 0.81 * beta) * s);
    limitStates.push(
      state("LY", "HSS local yielding", Rn, REF.plateRound, K_FACTORS.roundLocalYielding, {
        expr: "R{n}sinθ = 5.5F{y}t²Q{f}/(1 − 0.81β)",
      }),
    );
  } else {
    // Rn sin θ = 5.5 Fy t² (1 + 0.25 lb/D) Qf; a through plate engages both walls.
    const factor = kind === "through" ? 2 : 1;
    const Rn = (factor * 5.5 * c.Fy * c.t ** 2 * (1 + (0.25 * lb) / c.D) * Qf) / s;
    limitStates.push(
      state("PL", "HSS plastification", Rn, REF.plateRound, K_FACTORS.wallPlastification, {
        expr: `R{n}sinθ = ${factor === 2 ? "2 × " : ""}5.5F{y}t²(1 + 0.25l{b}/D)Q{f}`,
        ...(factor === 2 ? { note: "through plate — both chord walls act" } : {}),
      }),
    );
  }

  const ref = REF.plateRoundLimits;
  const applicability: ApplicabilityCheck[] = [
    slendernessCheck("chord", "Chord wall slenderness", "D/t", c.D / c.t, input.cross ? 40 : 50, ref),
    ...(kind === "transverse"
      ? [betaCheck(beta, 0.2, 1.0, ref, true, "B{p}/D")]
      : [slendernessCheck("plate-length", "Plate length ratio", "l{b}/D", lb / c.D, 4, ref)]),
    angleCheck(theta, ref),
    ...materialChecks([{ ...c, role: "Chord" }], ref),
  ];

  return finish({
    section: `§K1 Plate-to-round-HSS ${kind} plate ${input.cross ? "cross" : "T/Y"}-connection`,
    quantity: "force",
    method: input.method,
    params,
    limitStates,
    applicability,
    warnings: ductilityWarnings([{ ...c, role: "Chord" }]),
  });
}

/* --------------------------------------------------------------- Table K1.2 */

function plateToRectHss(input: PlateToHssInput): HssConnectionResult {
  const c = rectSection(input.chord, input.chordFace);
  const theta = input.theta ?? 90;
  const { Bp, lb, tp, kind } = input;
  for (const [name, v] of [
    ["Bp", Bp],
    ["lb", lb],
    ["tp", tp],
  ] as const)
    if (!Number.isFinite(v) || v <= 0) throw new RangeError(`${name} must be finite and positive`);
  if (theta <= 0 || theta > 90) throw new RangeError("theta must be in (0°, 90°]");
  if (kind === "transverse" && Bp > c.B)
    throw new UnsupportedError(`Plate width Bp = ${Bp} in. exceeds the chord face width B = ${c.B} in.`);

  const gamma = c.B / (2 * c.t);
  // A transverse plate loads the face across Bp; a longitudinal plate loads it across its thickness.
  const beta = kind === "transverse" ? Bp / c.B : tp / c.B;
  const eta = lb / c.B;
  const cs = chordStress(input.chordLoads, c, input.method);
  const { Qf, steps: qfSteps } = qfRect(cs, beta);
  const s = sin(theta);
  const ref = REF.plateRectLimits;

  const params: CalcStep[] = [
    step("Chord face width", "B", c.B, "length", REF.plateRect),
    step("Chord sidewall depth", "H", c.H, "length", REF.plateRect),
    step("Chord design wall thickness", "t", c.t, "length", "§B4.2"),
    step("Chord slenderness", "γ", gamma, "ratio", REF.plateRect, "B/2t"),
    step("Width ratio", "β", beta, "ratio", REF.plateRect, kind === "transverse" ? "B{p}/B" : "t{p}/B"),
    step("Load length ratio", "η", eta, "ratio", REF.plateRect, "l{b}/B"),
    ...qfSteps,
  ];

  const limitStates: LimitState[] = [];
  const applicability: ApplicabilityCheck[] = [
    slendernessCheck("chord-b", "Chord face slenderness", "B/t", c.B / c.t, 35, ref),
    slendernessCheck("chord-h", "Chord sidewall slenderness", "H/t", c.H / c.t, 35, ref),
    aspectCheck("chord-aspect", "Chord aspect ratio", "H/B", c.H / c.B, ref),
    angleCheck(theta, ref),
    ...materialChecks([{ ...c, role: "Chord" }], ref),
  ];

  if (kind === "transverse") {
    applicability.splice(3, 0, betaCheck(beta, 0.25, 1.0, ref, false, "B{p}/B"));
    const punchLimit = 1 - 1 / gamma;
    if (beta <= 0.85) {
      limitStates.push(
        state("WP", "HSS wall plastification", wallYieldLine(c.Fy, c.t, eta, beta, Qf) / s, REF.plateRect, K_FACTORS.wallPlastification, {
          expr: "R{n}sinθ = F{y}t²[2η/(1 − β) + 4/√(1 − β)]Q{f}",
          note: "β ≤ 0.85",
        }),
      );
    }
    if (beta > 0.85 && beta <= punchLimit) {
      const be = betaEop(beta, gamma);
      // Rn sin θ = 0.6 Fy t B (2η + 2βeop): the two weld lines along the chord axis plus both plate ends.
      const Rn = (0.6 * c.Fy * c.t * c.B * (2 * eta + 2 * be)) / s;
      limitStates.push(
        state("PS", "HSS shear yielding (punching)", Rn, REF.plateRect, K_FACTORS.punchingShear, {
          expr: "R{n}sinθ = 0.6F{y}tB(2η + 2β{eop})",
          steps: [step("Effective punching width ratio", "β{eop}", be, "ratio", REF.plateRect, "5β/γ ≤ β")],
          note: "0.85 < β ≤ 1 − 1/γ",
        }),
      );
    }
    if (beta > 0.85) {
      // The plate bears over the sidewalls; the load spreads at 2.5:1 through the connecting wall.
      // Cross-connections take Fn = 0.8Fy for the reduced sidewall restraint.
      const Fn = input.cross ? 0.8 * c.Fy : c.Fy;
      limitStates.push(
        state("SWY", "HSS sidewall local yielding", (2 * Fn * c.t * (5 * c.t + lb)) / s, REF.plateRect, K_FACTORS.sidewallYielding, {
          expr: `R{n}sinθ = 2F{n}t(5t + l{b}), F{n} = ${input.cross ? "0.80F{y}" : "F{y}"}`,
          note: "β > 0.85",
        }),
      );
      if (input.plateForce === "compression")
        limitStates.push(
          state(
            "SWC",
            "HSS sidewall local crippling",
            (1.6 * c.t ** 2 * (1 + (3 * lb) / (c.H - 3 * c.t)) * Math.sqrt(E * c.Fy) * Qf) / s,
            REF.plateRect,
            K_FACTORS.sidewallCrippling,
            {
              expr: "R{n}sinθ = 1.6t²[1 + 3l{b}/(H − 3t)]√(EF{y})Q{f}",
              note: "β > 0.85, plate in compression",
            },
          ),
        );
    }
  } else {
    applicability.splice(3, 0, slendernessCheck("plate-length", "Plate length ratio", "l{b}/B", eta, 4, ref));
    const factor = kind === "through" ? 2 : 1;
    limitStates.push(
      state(
        "WP",
        "HSS wall plastification",
        (factor * wallYieldLine(c.Fy, c.t, eta, beta, Qf)) / s,
        REF.plateRect,
        K_FACTORS.wallPlastification,
        {
          expr: `R{n}sinθ = ${factor === 2 ? "2 × " : ""}[F{y}t²/(1 − t{p}/B)][2l{b}/B + 4√(1 − t{p}/B)]Q{f}`,
          ...(factor === 2 ? { note: "through plate — both chord walls act" } : {}),
        },
      ),
    );
  }

  return finish({
    section: `§K1 Plate-to-rectangular-HSS ${kind} plate ${input.cross ? "cross" : "T/Y"}-connection`,
    quantity: "force",
    method: input.method,
    params,
    limitStates,
    applicability,
    warnings: [
      ...(kind === "transverse" && beta > 0.85 && beta <= 1 - 1 / gamma
        ? [
            "For 0.85 < β < 1.0 the Specification tabulates punching shear and sidewall limit states over adjacent ranges; both are reported and the lesser governs.",
          ]
        : []),
      ...ductilityWarnings([{ ...c, role: "Chord" }]),
    ],
  });
}

/* ----------------------------------------------------------- Capped HSS end */

/**
 * Concentrated axial force on the end of an HSS through a cap plate. The force spreads through the
 * cap plate at 2.5:1 on each side, so the length bearing on each receiving wall is lb + 5tp; once
 * the spread covers the wall the full cross section yields. Both limit states are reported, and
 * the full-section state is simply Fy·Ag.
 */
export function capPlate(input: CapPlateInput): HssConnectionResult {
  const family = hssFamily(input.chord.shape);
  const { tp, lb } = input;
  for (const [name, v] of [
    ["tp", tp],
    ["lb", lb],
  ] as const)
    if (!Number.isFinite(v) || v <= 0) throw new RangeError(`${name} must be finite and positive`);

  const round = family === "round";
  const c = round ? roundSection(input.chord) : rectSection(input.chord, input.bearingAlong);
  const t = c.t;
  const Fy = c.Fy;
  const Ag = c.Ag;
  // Length of wall available to receive the dispersed load.
  const wall = round ? Math.PI * ((c as ReturnType<typeof roundSection>).D - t) : 2 * (c as ReturnType<typeof rectSection>).B;
  const spread = Math.min(2 * (lb + 5 * tp), wall);
  const ref = REF.capPlate;

  const params: CalcStep[] = [
    step("Cap plate thickness", "t{p}", tp, "length", ref),
    step("Bearing length of the applied load", "l{b}", lb, "length", ref),
    step("Design wall thickness", "t", t, "length", "§B4.2"),
    step("Dispersed bearing length on the HSS walls", "Σl{e}", spread, "length", ref, "min[2(l{b} + 5t{p}), wall length]"),
  ];

  const limitStates: LimitState[] = [
    state("WLY", "HSS wall local yielding", Fy * t * spread, ref, K_FACTORS.sidewallYielding, {
      expr: "R{n} = F{y}tΣl{e}",
      note: "2.5:1 dispersion through the cap plate",
    }),
    state("GY", "Gross-section yielding of the HSS", Fy * Ag, "§J4.4", K_FACTORS.plastification, {
      expr: "R{n} = F{y}A{g}",
    }),
  ];

  const applicability: ApplicabilityCheck[] = [
    ...(round
      ? [
          slendernessCheck(
            "chord",
            "HSS wall slenderness",
            "D/t",
            (c as ReturnType<typeof roundSection>).D / t,
            50,
            ref,
          ),
        ]
      : [
          slendernessCheck("chord-b", "HSS face slenderness", "B/t", (c as ReturnType<typeof rectSection>).B / t, 35, ref),
          slendernessCheck("chord-h", "HSS sidewall slenderness", "H/t", (c as ReturnType<typeof rectSection>).H / t, 35, ref),
        ]),
    check(
      "cap-thickness",
      "Cap plate at least as thick as the HSS wall",
      "t{p}/t",
      tp / t,
      "≥ 1.0",
      tp >= t - 1e-9,
      ref,
    ),
    ...materialChecks([{ ...c, role: "HSS" }], ref),
  ];

  return finish({
    section: "§K1 Concentrated axial force on a capped HSS end",
    quantity: "force",
    method: input.method,
    params,
    limitStates,
    applicability,
    warnings: [
      "Cap plate strengths use the 2.5:1 load dispersion model of §K1 with the §J10-form wall yielding equation; the cap plate itself must be checked for flexure and the weld to the HSS for the dispersed force.",
      ...ductilityWarnings([{ ...c, role: "HSS" }]),
    ],
  });
}
