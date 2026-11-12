/** Shear strength — AISC 360-22 Chapter G. */
import { E } from "@/data/materials";
import { familyOf, req } from "@/data/shapes";
import { RESISTANCE } from "./common";
import { UnsupportedError, type ShearFn } from "./types";

export const shearStrength: ShearFn = (shape, mat, { axis }) => {
  if (familyOf(shape) !== "i-shape" || axis !== "major") throw new UnsupportedError(`Shear for ${shape.type} (${axis} axis) is not implemented yet`);
  const { Fy } = mat;
  const d = req(shape, "d"), tw = req(shape, "tw"), htw = req(shape, "h/tw");
  const Aw = d * tw;
  const rolledLimit = 2.24 * Math.sqrt(E / Fy);
  const kv = 5.34;
  let Cv1 = 1;
  let factors: { phi: number; omega: number } = RESISTANCE.shearRolledI;
  if (htw > rolledLimit) {
    factors = RESISTANCE.shear;
    const lim = 1.1 * Math.sqrt((kv * E) / Fy);
    Cv1 = htw <= lim ? 1 : lim / htw;
  }
  const Vn = 0.6 * Fy * Aw * Cv1;
  return {
    kind: "shear", quantity: "force", nominal: Vn, ...factors, governing: "V", Aw, Cv1,
    section: "§G2.1 I-shaped members — shear strength of webs without tension field action",
    steps: [
      { label: "Web area", symbol: "A{w}", expr: "d t{w}", value: Aw, quantity: "area", ref: "§G2.1" },
      { label: "Web slenderness", symbol: "h/t{w}", value: htw, quantity: "ratio", note: htw <= rolledLimit ? `≤ 2.24√(E/F{y}) = ${rolledLimit.toFixed(1)} → C{v1} = 1.0, φ{v} = 1.00, Ω{v} = 1.50` : undefined, ref: "§G2.1(a)" },
    ],
    limitStates: [{ id: "V", name: "Shear yielding / buckling", ref: "§G2.1", nominal: Vn, steps: [
      { label: "Web shear strength coefficient", symbol: "C{v1}", value: Cv1, quantity: "ratio", ref: htw <= rolledLimit ? "§G2.1(a)" : "Eq. G2-3/G2-4" },
      { label: "Nominal shear strength", symbol: "V{n}", expr: "0.6F{y}A{w}C{v1}", value: Vn, quantity: "force", ref: "Eq. G2-1" },
    ] }],
    warnings: [],
  };
};
