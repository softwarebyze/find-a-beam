/** Combined flexure and axial force — AISC 360-22 §H1.1 (doubly and singly symmetric members). */
import type { InteractionInput, InteractionResult } from "./types";

export function interaction({ Pr, Pc, Mrx, Mcx, Mry = 0, Mcy = 1 }: InteractionInput): InteractionResult {
  const pr = Math.abs(Pr) / Pc;
  const mx = Math.abs(Mrx) / Mcx;
  const my = Mcy > 0 ? Math.abs(Mry) / Mcy : 0;
  if (pr >= 0.2) {
    const ratio = pr + (8 / 9) * (mx + my);
    return { ratio, equation: "H1-1a", steps: [
      { label: "Axial ratio", symbol: "P{r}/P{c}", value: pr, quantity: "ratio", note: "≥ 0.2" },
      { label: "Interaction", expr: "P{r}/P{c} + 8/9 (M{rx}/M{cx} + M{ry}/M{cy}) ≤ 1.0", value: ratio, quantity: "ratio", ref: "Eq. H1-1a" },
    ] };
  }
  const ratio = pr / 2 + mx + my;
  return { ratio, equation: "H1-1b", steps: [
    { label: "Axial ratio", symbol: "P{r}/P{c}", value: pr, quantity: "ratio", note: "< 0.2" },
    { label: "Interaction", expr: "P{r}/2P{c} + (M{rx}/M{cx} + M{ry}/M{cy}) ≤ 1.0", value: ratio, quantity: "ratio", ref: "Eq. H1-1b" },
  ] };
}
