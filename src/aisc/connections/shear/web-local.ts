/** Concentrated force at the end of a W-shape — AISC 360-22 §J10.2 and §J10.3 (Qf = 1.0 for wide-flange members). */
import { E } from "@/data/materials";
import { req, type Shape } from "@/data/shapes";
import type { Material } from "@/data/materials";
import type { LimitState } from "../../types";
import { limitState, PHI } from "./common";

/** §J10.2 web local yielding with the force applied within d of the member end (Eq. J10-3). */
export function webLocalYieldingAtEnd(beam: Shape, mat: Material, lb: number): LimitState {
  const tw = req(beam, "tw"),
    k = req(beam, "kdes");
  const Rn = mat.Fy * tw * (2.5 * k + lb);
  return limitState("WLY", "Web local yielding", "§J10.2", Rn, PHI.yield, [
    { label: "Bearing length", symbol: "l{b}", value: lb, quantity: "length" },
    { label: "Design distance to web toe of fillet", symbol: "k{des}", value: k, quantity: "length", ref: "Manual Table 1-1" },
    { label: "Force within d of the member end", symbol: "R{n}", expr: "F{y}t{w}(2.5k + l{b})", value: Rn, quantity: "force", ref: "Eq. J10-3" },
  ]);
}

/** §J10.3 web local crippling with the force applied less than d/2 from the member end (Eqs. J10-5a/b). */
export function webLocalCripplingAtEnd(beam: Shape, mat: Material, lb: number): LimitState {
  const tw = req(beam, "tw"),
    tf = req(beam, "tf"),
    d = req(beam, "d");
  const ratio = lb / d;
  const root = Math.sqrt((E * mat.Fy * tf) / tw);
  const shape = ratio <= 0.2 ? 1 + 3 * ratio * (tw / tf) ** 1.5 : 1 + (4 * ratio - 0.2) * (tw / tf) ** 1.5;
  const Rn = 0.4 * tw ** 2 * shape * root;
  return limitState("WCR", "Web local crippling", "§J10.3", Rn, PHI.rupture, [
    { label: "Bearing length ratio", symbol: "l{b}/d", value: ratio },
    {
      label: ratio <= 0.2 ? "Force within d/2 of the end, l{b}/d ≤ 0.2" : "Force within d/2 of the end, l{b}/d > 0.2",
      symbol: "R{n}",
      expr: ratio <= 0.2 ? "0.40t{w}²[1 + 3(l{b}/d)(t{w}/t{f})^1.5]√(EF{yw}t{f}/t{w}) Q{f}" : "0.40t{w}²[1 + (4l{b}/d − 0.2)(t{w}/t{f})^1.5]√(EF{yw}t{f}/t{w}) Q{f}",
      value: Rn,
      quantity: "force",
      ref: ratio <= 0.2 ? "Eq. J10-5a" : "Eq. J10-5b",
      note: "Q{f} = 1.0 for wide-flange members",
    },
  ]);
}
