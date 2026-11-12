/** Width-to-thickness classification for axial compression — AISC 360-22 Table B4.1a. */
import { E, type Material } from "@/data/materials";
import { familyOf, req, type Shape } from "@/data/shapes";
import { UnsupportedError, type CompressionClass, type ElementSlenderness, type SectionClassification } from "./types";

export function classifyCompression(shape: Shape, mat: Material): SectionClassification<CompressionClass> {
  const k = Math.sqrt(E / mat.Fy);
  if (familyOf(shape) !== "i-shape") throw new UnsupportedError(`Compression classification for ${shape.type} shapes is not implemented yet`);
  const fl = req(shape, "bf/2tf"), wl = req(shape, "h/tw");
  const elements: ElementSlenderness<CompressionClass>[] = [
    { element: "Flange", symbol: "b{f}/2t{f}", lambda: fl, lambdaR: 0.56 * k, cls: fl <= 0.56 * k ? "nonslender" : "slender", ref: "Table B4.1a, Case 1" },
    { element: "Web", symbol: "h/t{w}", lambda: wl, lambdaR: 1.49 * k, cls: wl <= 1.49 * k ? "nonslender" : "slender", ref: "Table B4.1a, Case 5" },
  ];
  return { elements, overall: elements.some((e) => e.cls === "slender") ? "slender" : "nonslender" };
}
