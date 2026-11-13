import type { CalcStep, DesignMethod } from "../types";
export interface StoryInput {
  Pstory: number;
  Pmf?: number;
  H: number;
  L: number;
  drift: number;
  method?: DesignMethod;
}
/** Appendix 8, Eqs. A-8-6 through A-8-8; drift and shear from the same first-order analysis. */
export function storyAmplification({ Pstory, Pmf = 0, H, L, drift, method = "LRFD" }: StoryInput): {
  B2: number;
  PeStory: number;
  RM: number;
  steps: CalcStep[];
} {
  if (
    ![Pstory, Pmf, H, L, drift].every(Number.isFinite) ||
    Pstory < 0 ||
    Pmf < 0 ||
    Pmf > Pstory ||
    H <= 0 ||
    L <= 0 ||
    drift < 0
  )
    throw new RangeError("Require Pstory ≥ Pmf ≥ 0, H and L > 0, drift ≥ 0");
  const RM = Pstory === 0 ? 1 : 1 - (0.15 * Pmf) / Pstory;
  const PeStory = drift === 0 ? Infinity : (RM * H * L) / drift;
  const denominator = 1 - ((method === "LRFD" ? 1 : 1.6) * Pstory) / PeStory;
  const B2 = denominator <= 0 ? Infinity : Math.max(1, 1 / denominator);
  return {
    B2,
    PeStory,
    RM,
    steps: [
      {
        label: "Moment-frame stiffness adjustment",
        symbol: "R{M}",
        expr: "1 − 0.15P{mf}/P{story}",
        value: RM,
        quantity: "ratio",
        ref: "Eq. A-8-8",
      },
      {
        label: "Elastic story buckling strength",
        symbol: "P{e,story}",
        expr: "R{M}HL/Δ{H}",
        value: PeStory,
        quantity: "force",
        ref: "Eq. A-8-7",
      },
      {
        label: "Story moment and force amplifier",
        symbol: "B{2}",
        expr: "1/(1 − αP{story}/P{e,story}) ≥ 1",
        value: B2,
        quantity: "ratio",
        ref: "Eq. A-8-6",
        note: "Apply only to sidesway effects: Mr = B1 Mnt + B2 Mlt. Include leaning-column loads and diaphragm drift. Infinity denotes elastic instability.",
      },
    ],
  };
}
export const B2 = (input: StoryInput) => storyAmplification(input).B2;
