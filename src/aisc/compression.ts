/** Compressive strength — AISC 360-22 Chapter E. */
import { E } from "@/data/materials";
import { familyOf, req } from "@/data/shapes";
import { classifyCompression } from "./classify-compression";
import { RESISTANCE } from "./common";
import { UnsupportedError, type CompressionFn } from "./types";

/** Critical stress for flexural buckling, Eq. E3-2 / E3-3. */
export function flexuralBucklingFcr(Fy: number, Fe: number): number {
  return Fy / Fe <= 2.25 ? 0.658 ** (Fy / Fe) * Fy : 0.877 * Fe;
}

export const compressionStrength: CompressionFn = (shape, mat, { Lcx, Lcy }) => {
  if (familyOf(shape) !== "i-shape") throw new UnsupportedError(`Compression for ${shape.type} shapes is not implemented yet`);
  const { Fy } = mat;
  const classification = classifyCompression(shape, mat);
  const warnings: string[] = [];
  if (classification.overall === "slender") warnings.push("Section has slender elements for compression; §E7 effective-area reduction is not applied in this baseline.");
  const A = req(shape, "A"), rx = req(shape, "rx"), ry = req(shape, "ry");
  const slx = Lcx / rx, sly = Lcy / ry;
  const slenderness = Math.max(slx, sly);
  const Fe = (Math.PI ** 2 * E) / slenderness ** 2;
  const Fcr = flexuralBucklingFcr(Fy, Fe);
  const Pn = Fcr * A;
  if (slenderness > 200) warnings.push("L{c}/r exceeds 200 (§E2 user note).");
  return {
    kind: "compression", quantity: "force", nominal: Pn, ...RESISTANCE.compression, governing: "FB", classification, Fe, Fcr, slenderness,
    section: "§E3 Flexural buckling of members without slender elements",
    steps: [
      { label: "Slenderness about x-axis", symbol: "L{cx}/r{x}", value: slx, quantity: "ratio" },
      { label: "Slenderness about y-axis", symbol: "L{cy}/r{y}", value: sly, quantity: "ratio" },
    ],
    limitStates: [{ id: "FB", name: "Flexural buckling", ref: "§E3", nominal: Pn, steps: [
      { label: "Elastic buckling stress", symbol: "F{e}", expr: "π²E/(L{c}/r)²", value: Fe, quantity: "stress", ref: "Eq. E3-4" },
      { label: "Critical stress", symbol: "F{cr}", expr: Fy / Fe <= 2.25 ? "0.658^(F{y}/F{e}) F{y}" : "0.877F{e}", value: Fcr, quantity: "stress", ref: Fy / Fe <= 2.25 ? "Eq. E3-2" : "Eq. E3-3" },
      { label: "Nominal compressive strength", symbol: "P{n}", expr: "F{cr}A{g}", value: Pn, quantity: "force", ref: "Eq. E3-1" },
    ] }],
    warnings,
  };
};
