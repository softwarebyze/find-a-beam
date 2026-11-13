/** Tensile strength — ANSI/AISC 360-22 §§D2–D3. */
import { req } from "@/data/shapes";
import type { Material } from "@/data/materials";
import { RESISTANCE } from "./common";
import type { DesignMethod, LimitState, TensionInput, TensionResult } from "./types";
import type { Shape } from "@/data/shapes";
export { shearLagU, shearLagReport, netArea, netAreaReport, blockShear } from "./tension/connections";
export type { ShearLagInput, BoltHole, NetAreaInput, BlockShearInput, BlockShearResult } from "./tension/connections";

export interface TensionDesignInput extends TensionInput {
  /** Controls the reported governing state; available(result, method) always checks both. */
  method?: DesignMethod;
}
export function tensionStrength(shape: Shape, mat: Material, input: TensionDesignInput = {}): TensionResult {
  const Ag = req(shape, "A"),
    An = input.An ?? Ag,
    U = input.U ?? 1;
  if (!(An > 0 && An <= Ag) || !Number.isFinite(An)) throw new RangeError("An must be finite and in (0, Ag]");
  if (!(U > 0 && U <= 1)) throw new RangeError("U must be in (0, 1]");
  if (!(mat.Fy > 0) || !(mat.Fu >= mat.Fy) || !Number.isFinite(mat.Fy + mat.Fu))
    throw new RangeError("Material must have finite Fu ≥ Fy > 0");
  const Ae = An * U;
  const ty: LimitState & { quantity: "force" } = {
    id: "TY",
    name: "Tensile yielding in the gross section",
    ref: "§D2(a)",
    quantity: "force",
    nominal: mat.Fy * Ag,
    ...RESISTANCE.tensionYield,
    steps: [
      {
        label: "Nominal strength, yielding",
        symbol: "P{n}",
        expr: "F{y}A{g}",
        value: mat.Fy * Ag,
        quantity: "force",
        ref: "Eq. D2-1",
      },
    ],
  };
  const tr: LimitState & { quantity: "force" } = {
    id: "TR",
    name: "Tensile rupture in the net section",
    ref: "§D2(b)",
    quantity: "force",
    nominal: mat.Fu * Ae,
    ...RESISTANCE.tensionRupture,
    steps: [
      { label: "Effective net area", symbol: "A{e}", expr: "A{n}U", value: Ae, quantity: "area", ref: "Eq. D3-1" },
      {
        label: "Nominal strength, rupture",
        symbol: "P{n}",
        expr: "F{u}A{e}",
        value: mat.Fu * Ae,
        quantity: "force",
        ref: "Eq. D2-2",
      },
    ],
  };
  const method = input.method ?? "LRFD";
  const strength = (l: typeof ty) => (method === "LRFD" ? l.phi! * l.nominal : l.nominal / l.omega!);
  const gov = strength(ty) <= strength(tr) ? ty : tr;
  return {
    kind: "tension",
    quantity: "force",
    nominal: gov.nominal,
    phi: gov.phi!,
    omega: gov.omega!,
    governing: gov.id,
    limitStates: [ty, tr],
    section: "§§D2–D3 Tensile strength",
    steps: [
      { label: "Gross area", symbol: "A{g}", value: Ag, quantity: "area", ref: "§B4.3a" },
      { label: "Net area", symbol: "A{n}", value: An, quantity: "area", ref: "§B4.3b" },
      { label: "Shear lag factor", symbol: "U", value: U, quantity: "ratio", ref: "Table D3.1" },
    ],
    warnings:
      input.An === undefined || input.U === undefined
        ? [
            "Unspecified An and U default to Ag and 1, respectively. Verify connection holes, shear lag, and block shear; D5 pin-connected members and D6 eyebars require separate design.",
          ]
        : [],
  };
}
