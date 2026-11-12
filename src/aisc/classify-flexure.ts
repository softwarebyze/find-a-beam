/** Width-to-thickness classification for flexure — AISC 360-22 Table B4.1b. */
import { E, type Material } from "@/data/materials";
import { familyOf, req, type Shape } from "@/data/shapes";
import { UnsupportedError, type ElementSlenderness, type FlexureClass, type SectionClassification } from "./types";

const rank: Record<FlexureClass, number> = { compact: 0, noncompact: 1, slender: 2 };

export function classOf(lambda: number, lambdaP: number, lambdaR: number): FlexureClass {
  return lambda <= lambdaP ? "compact" : lambda <= lambdaR ? "noncompact" : "slender";
}

export function worst<C extends FlexureClass>(els: ElementSlenderness<C>[]): C {
  return els.reduce((a, e) => (rank[e.cls] > rank[a] ? e.cls : a), els[0]!.cls);
}

export function classifyFlexure(shape: Shape, mat: Material, axis: "major" | "minor" = "major"): SectionClassification<FlexureClass> {
  const k = Math.sqrt(E / mat.Fy);
  const fam = familyOf(shape);
  if (fam !== "i-shape") throw new UnsupportedError(`Flexural classification for ${shape.type} shapes is not implemented yet`);
  const flangeL = req(shape, "bf/2tf");
  const elements: ElementSlenderness<FlexureClass>[] = [
    { element: "Flange", symbol: "b{f}/2t{f}", lambda: flangeL, lambdaP: 0.38 * k, lambdaR: 1.0 * k, cls: classOf(flangeL, 0.38 * k, 1.0 * k), ref: "Table B4.1b, Case 10" },
  ];
  if (axis === "major") {
    const webL = req(shape, "h/tw");
    elements.push({ element: "Web", symbol: "h/t{w}", lambda: webL, lambdaP: 3.76 * k, lambdaR: 5.7 * k, cls: classOf(webL, 3.76 * k, 5.7 * k), ref: "Table B4.1b, Case 15" });
  }
  return { elements, overall: worst(elements) };
}
