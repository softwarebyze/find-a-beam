/**
 * Quick-look design strengths for the shape detail and compare pages. Pure; no React.
 * Every engine call is isolated so an unsupported limit state hides one row, not the page.
 */
import {
  available, classifyCompression, classifyFlexure, compressionStrength, flexuralStrength, ltbCurve, shearStrength, tensionStrength,
  type CompressionClass, type CompressionResult, type DesignMethod, type FlexureClass, type FlexureResult, type LimitState,
  type SectionClassification, type ShearResult, type TensionResult,
} from "@/aisc";
import { preferredMaterial, type Material } from "@/data/materials";
import { familyOf, type Shape } from "@/data/shapes";

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

export function attempt<T>(fn: () => T): Outcome<T> {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Column effective lengths tabulated on the detail page, in. (0, 10, 20 ft). */
export const COLUMN_LENGTHS = [0, 120, 240];

export interface DesignSummary {
  material: Material;
  classFlexure: Outcome<SectionClassification<FlexureClass>>;
  classCompression: Outcome<SectionClassification<CompressionClass>>;
  /** Major-axis flexure at Lb = 0 (carries Lp / Lr when LTB applies) */
  flexX: Outcome<FlexureResult>;
  flexY: Outcome<FlexureResult>;
  shearX: Outcome<ShearResult>;
  compression: { Lc: number; result: Outcome<CompressionResult> }[];
  tension: Outcome<TensionResult>;
}

export function defaultMaterial(s: Shape): Material {
  return preferredMaterial(s.type, familyOf(s));
}

export function designSummary(s: Shape, material: Material = defaultMaterial(s)): DesignSummary {
  return {
    material,
    classFlexure: attempt(() => classifyFlexure(s, material, "major")),
    classCompression: attempt(() => classifyCompression(s, material)),
    flexX: attempt(() => flexuralStrength(s, material, { axis: "major", Lb: 0 })),
    flexY: attempt(() => flexuralStrength(s, material, { axis: "minor", Lb: 0 })),
    shearX: attempt(() => shearStrength(s, material, { axis: "major" })),
    compression: COLUMN_LENGTHS.map((Lc) => ({ Lc, result: attempt(() => compressionStrength(s, material, { Lcx: Lc, Lcy: Lc })) })),
    tension: attempt(() => tensionStrength(s, material)),
  };
}

/** Available strength of the gross-section yielding limit state alone (§D2(a), Eq. D2-1). */
export function tensionYielding(r: TensionResult, method: DesignMethod): { value: number; state: LimitState } | undefined {
  const ty = r.limitStates.find((l) => l.id === "TY");
  if (!ty || ty.phi === undefined || ty.omega === undefined) return undefined;
  return { value: available({ nominal: ty.nominal, phi: ty.phi, omega: ty.omega }, method), state: ty };
}

/** Governing limit state of a result. */
export function governingState(r: { governing: string; limitStates: LimitState[] }): LimitState | undefined {
  return r.limitStates.find((l) => l.id === r.governing);
}

/** Longest Lr (in.) for which the moment-vs-Lb chart is useful; beyond this LTB does not practically govern. */
const MAX_CHART_LR = 100 * 12;

/** Chart span (in.) for the available-moment vs Lb curve, or undefined when LTB does not apply. */
export function ltbChartSpan(r: FlexureResult): number | undefined {
  const { Lp, Lr } = r;
  if (Lp === undefined || Lr === undefined || !Number.isFinite(Lr) || Lr <= 0 || Lr > MAX_CHART_LR) return undefined;
  const fiveFt = 60;
  return Math.max(Math.ceil((1.6 * Lr) / fiveFt) * fiveFt, 240);
}

export interface MomentCurve {
  /** Lb (in.) and available moment (kip-in.) */
  points: { Lb: number; Mc: number }[];
  Lp: number;
  Lr: number;
  span: number;
}

/** Available major-axis moment vs unbraced length with Cb = 1. */
export function momentCurve(s: Shape, material: Material, base: FlexureResult, method: DesignMethod): Outcome<MomentCurve> | undefined {
  const span = ltbChartSpan(base);
  if (span === undefined) return undefined;
  return attempt(() => {
    const pts = ltbCurve(s, material, { axis: "major", Lmax: span, n: 61 });
    return {
      points: pts.map((p) => ({ Lb: p.Lb, Mc: available({ nominal: p.Mn, phi: base.phi, omega: base.omega }, method) })),
      Lp: base.Lp!,
      Lr: base.Lr!,
      span,
    };
  });
}
