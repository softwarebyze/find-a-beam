/** Tensile strength — AISC 360-22 Chapter D. */
import { req } from "@/data/shapes";
import { RESISTANCE } from "./common";
import type { LimitState, TensionFn } from "./types";

export const tensionStrength: TensionFn = (shape, mat, input = {}) => {
  const Ag = req(shape, "A");
  const An = input.An ?? Ag;
  const U = input.U ?? 1;
  const Ae = An * U;
  const ty: LimitState = { id: "TY", name: "Tensile yielding in the gross section", ref: "§D2(a)", nominal: mat.Fy * Ag, ...RESISTANCE.tensionYield,
    steps: [{ label: "Nominal strength, yielding", symbol: "P{n}", expr: "F{y}A{g}", value: mat.Fy * Ag, quantity: "force", ref: "Eq. D2-1" }] };
  const tr: LimitState = { id: "TR", name: "Tensile rupture in the net section", ref: "§D2(b)", nominal: mat.Fu * Ae, ...RESISTANCE.tensionRupture,
    steps: [
      { label: "Effective net area", symbol: "A{e}", expr: "A{n}U", value: Ae, quantity: "area", ref: "Eq. D3-1" },
      { label: "Nominal strength, rupture", symbol: "P{n}", expr: "F{u}A{e}", value: mat.Fu * Ae, quantity: "force", ref: "Eq. D2-2" },
    ] };
  // Governing by LRFD available strength
  const gov = ty.phi! * ty.nominal <= tr.phi! * tr.nominal ? ty : tr;
  return { kind: "tension", quantity: "force", nominal: gov.nominal, phi: gov.phi!, omega: gov.omega!, governing: gov.id, limitStates: [ty, tr],
    section: "§D2 Tensile strength", steps: [{ label: "Gross area", symbol: "A{g}", value: Ag, quantity: "area" }], warnings: [] };
};
