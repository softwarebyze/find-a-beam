/**
 * Joint geometry and the chord-stress interaction parameter Qf (§K1).
 *
 * Chapter K uses the DESIGN wall thickness (`tdes`) throughout, and measures the chord in the plane
 * of the joint: B is the width of the connecting face, H the depth of the two sidewalls.
 */
import { familyOf, req, type Shape } from "@/data/shapes";
import type { CalcStep, DesignMethod } from "../types";
import { UnsupportedError } from "../types";
import { REF } from "./refs";
import { step } from "./result";
import type { ChordFace, ChordLoads, HssFamily, Member } from "./types";

export function hssFamily(s: Shape): HssFamily {
  const f = familyOf(s);
  if (f === "hss-rect") return "rect";
  if (f === "hss-round" || f === "pipe") return "round";
  throw new UnsupportedError(`${s.label} is not an HSS or pipe. Chapter K applies to HSS and box sections.`);
}

export interface RoundSection {
  D: number;
  t: number;
  Ag: number;
  /** Elastic section modulus used for the chord-face bending stress. */
  S: number;
  Fy: number;
  Fu: number;
  label: string;
}

export interface RectSection {
  /** Overall width of the connecting face, in. */
  B: number;
  /** Overall depth of the sidewalls (in the plane of the joint), in. */
  H: number;
  t: number;
  Ag: number;
  S: number;
  Z: number;
  Fy: number;
  Fu: number;
  label: string;
}

export function roundSection(m: Member): RoundSection {
  if (hssFamily(m.shape) !== "round") throw new UnsupportedError(`${m.shape.label} is not a round HSS or pipe.`);
  return {
    D: req(m.shape, "OD"),
    t: req(m.shape, "tdes"),
    Ag: req(m.shape, "A"),
    S: req(m.shape, "Sx"),
    Fy: m.material.Fy,
    Fu: m.material.Fu,
    label: m.shape.label,
  };
}

/**
 * `face` selects the welded wall: "B" keeps the database width as the connecting face (sidewalls
 * Ht deep), "Ht" rotates the member 90° about its own axis.
 */
export function rectSection(m: Member, face: ChordFace = "B"): RectSection {
  if (hssFamily(m.shape) !== "rect") throw new UnsupportedError(`${m.shape.label} is not a rectangular HSS.`);
  const onB = face === "B";
  return {
    B: req(m.shape, onB ? "B" : "Ht"),
    H: req(m.shape, onB ? "Ht" : "B"),
    t: req(m.shape, "tdes"),
    Ag: req(m.shape, "A"),
    // Chord bending acts in the plane of the joint, i.e. about the axis normal to that plane.
    S: req(m.shape, onB ? "Sx" : "Sy"),
    Z: req(m.shape, onB ? "Zx" : "Zy"),
    Fy: m.material.Fy,
    Fu: m.material.Fu,
    label: m.shape.label,
  };
}

/** Branch section properties needed by §K2/§K3, for either family. */
export interface BranchSection {
  /** Round: diameter. Rectangular: width across the chord face. */
  Bb: number;
  /** Round: diameter. Rectangular: depth in the plane of the joint. */
  Hb: number;
  tb: number;
  Ab: number;
  Zb: number;
  Sb: number;
  Fyb: number;
  Fub: number;
  family: HssFamily;
  label: string;
}

export function branchSection(m: Member, plane: ChordFace = "B"): BranchSection {
  const family = hssFamily(m.shape);
  const tb = req(m.shape, "tdes");
  if (family === "round") {
    const D = req(m.shape, "OD");
    return {
      Bb: D,
      Hb: D,
      tb,
      Ab: req(m.shape, "A"),
      Zb: req(m.shape, "Zx"),
      Sb: req(m.shape, "Sx"),
      Fyb: m.material.Fy,
      Fub: m.material.Fu,
      family,
      label: m.shape.label,
    };
  }
  const onB = plane === "B";
  return {
    Bb: req(m.shape, onB ? "B" : "Ht"),
    Hb: req(m.shape, onB ? "Ht" : "B"),
    tb,
    Ab: req(m.shape, "A"),
    Zb: req(m.shape, onB ? "Zx" : "Zy"),
    Sb: req(m.shape, onB ? "Sx" : "Sy"),
    Fyb: m.material.Fy,
    Fub: m.material.Fu,
    family,
    label: m.shape.label,
  };
}

export interface ChordStress {
  /** Chord utilization ratio U at the joint. */
  U: number;
  /** Fy for LRFD, 0.6Fy for ASD. */
  Fc: number;
  /** True when the connecting face is in compression, which is when Qf < 1. */
  compression: boolean;
  steps: CalcStep[];
}

/**
 * Chord utilization U = |Pr/(Ag·Fc) + Mr/(S·Fc)| with Fc = Fy (LRFD) or 0.6Fy (ASD). Pr and Mr are
 * the required chord forces on the side of the joint with the larger compression stress; the sign
 * convention puts the connecting face in tension for positive values, where Qf = 1.0.
 */
export function chordStress(
  loads: ChordLoads | undefined,
  s: { Ag: number; S: number; Fy: number },
  method: DesignMethod,
): ChordStress {
  const Fc = method === "LRFD" ? s.Fy : 0.6 * s.Fy;
  const P = loads?.axial ?? 0;
  const M = loads?.moment ?? 0;
  const fromAxial = P / (s.Ag * Fc);
  const fromMoment = M / (s.S * Fc);
  const U = Math.abs(fromAxial + fromMoment);
  return {
    U,
    Fc,
    compression: fromAxial + fromMoment < 0,
    steps: [
      step("Limiting chord stress", "F{c}", Fc, "stress", REF.qf, method === "LRFD" ? "F{y}" : "0.60F{y}"),
      step("Chord utilization", "U", U, "ratio", REF.qf, "|P{r}/(A{g}F{c}) + M{r}/(SF{c})|"),
    ],
  };
}

export interface QfResult {
  Qf: number;
  steps: CalcStep[];
}

/** Round HSS: Qf = 1 with the connecting face in tension, otherwise 1 − 0.3U(1 + U). */
export function qfRound(cs: ChordStress): QfResult {
  const Qf = cs.compression ? Math.max(0, 1 - 0.3 * cs.U * (1 + cs.U)) : 1;
  return {
    Qf,
    steps: [
      ...cs.steps,
      step(
        "Chord-stress interaction parameter",
        "Q{f}",
        Qf,
        "ratio",
        REF.qf,
        cs.compression ? "1 − 0.3U(1 + U)" : "1.0",
        cs.compression ? "connecting face in compression" : "connecting face in tension",
      ),
    ],
  };
}

/** Rectangular HSS: Qf = 1 with the connecting face in tension, otherwise 1.3 − 0.4U/β ≤ 1. */
export function qfRect(cs: ChordStress, beta: number): QfResult {
  const Qf = cs.compression ? Math.max(0, Math.min(1, 1.3 - (0.4 * cs.U) / beta)) : 1;
  return {
    Qf,
    steps: [
      ...cs.steps,
      step(
        "Chord-stress interaction parameter",
        "Q{f}",
        Qf,
        "ratio",
        REF.qf,
        cs.compression ? "1.3 − 0.4U/β ≤ 1.0" : "1.0",
        cs.compression ? "connecting face in compression" : "connecting face in tension",
      ),
    ],
  };
}

/** Branch forces reach the chord through the weld; Chapter K assumes a matched-strength weld. */
export const WELD_NOTE =
  "Chapter K strengths assume the branch-to-chord weld develops the branch force; check the weld under §K4.";
