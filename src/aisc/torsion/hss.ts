import { E, type Material } from "@/data/materials";
import { familyOf, req, type Shape } from "@/data/shapes";
import { UnsupportedError, type StrengthResult } from "../types";
/** §H3.1, length L in inches; C is the DB torsional constant in in³, not J. */
export function torsionalStrength(shape: Shape, mat: Material, input: { L: number }): StrengthResult {
  const family = familyOf(shape),
    { L } = input;
  if (!["hss-round", "hss-rect", "pipe"].includes(family))
    throw new UnsupportedError("H3.1 requires round or rectangular HSS; use the H3.3 stress check for open sections");
  if (!Number.isFinite(L) || L <= 0 || !Number.isFinite(mat.Fy) || mat.Fy <= 0)
    throw new RangeError("Require L and Fy > 0");
  const C = req(shape, "C"),
    t = req(shape, "tdes");
  let Fcr: number, ref: string, lambda: number;
  if (family !== "hss-rect") {
    const D = req(shape, "OD");
    lambda = D / t;
    Fcr = Math.min(0.6 * mat.Fy, Math.max((1.23 * E) / (Math.sqrt(L / D) * lambda ** 1.25), (0.6 * E) / lambda ** 1.5));
    ref = "Eqs. H3-2a, H3-2b";
  } else {
    lambda = Math.max(req(shape, "h"), req(shape, "b")) / t;
    if (lambda > 260) throw new UnsupportedError("H3.1 rectangular HSS requires h/t ≤ 260");
    const p = 2.45 * Math.sqrt(E / mat.Fy),
      r = 3.07 * Math.sqrt(E / mat.Fy);
    Fcr =
      lambda <= p ? 0.6 * mat.Fy : lambda <= r ? (0.6 * mat.Fy * p) / lambda : (0.458 * Math.PI ** 2 * E) / lambda ** 2;
    ref = lambda <= p ? "Eq. H3-3" : lambda <= r ? "Eq. H3-4" : "Eq. H3-5";
  }
  if (![C, t, lambda, Fcr].every((v) => Number.isFinite(v) && v > 0))
    throw new RangeError("Invalid torsional section properties");
  const nominal = Fcr * C;
  return {
    kind: "torsion",
    quantity: "moment",
    nominal,
    phi: 0.9,
    omega: 1.67,
    governing: "T",
    section: "§H3.1 Round and rectangular HSS torsion",
    warnings: [],
    steps: [
      {
        label: "HSS torsional constant",
        symbol: "C",
        value: C,
        quantity: "hssTorsion",
        ref: "AISC Shapes Database v16.0 / Eq. H3-1",
      },
      { label: "Wall slenderness", value: lambda, quantity: "ratio", ref },
      { label: "Critical torsional shear stress", symbol: "F{cr}", value: Fcr, quantity: "stress", ref },
    ],
    limitStates: [
      {
        id: "T",
        name: "Torsional yielding / buckling",
        nominal,
        ref: "Eq. H3-1",
        steps: [
          {
            label: "Nominal torsional strength",
            symbol: "T{n}",
            expr: "F{cr}C",
            value: nominal,
            quantity: "moment",
            ref: "Eq. H3-1",
          },
        ],
      },
    ],
  };
}
