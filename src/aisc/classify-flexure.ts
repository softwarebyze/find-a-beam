/** AISC 360-22 Table B4.1b. Ratios use design (not nominal) HSS thickness. */
import { E, type Material } from "@/data/materials";
import { familyOf, num, req, type Shape } from "@/data/shapes";
import type { ElementSlenderness, FlexureClass, SectionClassification } from "./types";

const rank: Record<FlexureClass, number> = { compact: 0, noncompact: 1, slender: 2 };
export function classOf(lambda: number, lambdaP: number, lambdaR: number): FlexureClass {
  return lambda <= lambdaP ? "compact" : lambda <= lambdaR ? "noncompact" : "slender";
}
export function worst<C extends FlexureClass>(els: ElementSlenderness<C>[]): C {
  return els.reduce((a, e) => rank[e.cls] > rank[a] ? e.cls : a, els[0]!.cls);
}
export function classifyFlexure(shape: Shape, mat: Material, axis: "major" | "minor" = "major"): SectionClassification<FlexureClass> {
  if (!(mat.Fy > 0) || !Number.isFinite(mat.Fy)) throw new RangeError("Fy must be finite and positive");
  const k = Math.sqrt(E / mat.Fy);
  const elements: ElementSlenderness<FlexureClass>[] = [];
  const add = (element: string, symbol: string, lambda: number, lambdaP: number, lambdaR: number, caseNo: number) => {
    elements.push({ element, symbol, lambda, lambdaP, lambdaR, cls: classOf(lambda, lambdaP, lambdaR), ref: `Table B4.1b, Case ${caseNo}` });
  };
  switch (familyOf(shape)) {
    case "i-shape": case "channel": {
      const channel = familyOf(shape) === "channel";
      const ratio = channel ? num(shape, "b/t") ?? req(shape, "bf") / req(shape, "tf") : num(shape, "bf/2tf") ?? req(shape, "bf") / (2 * req(shape, "tf"));
      add("Flange", channel ? "b{f}/t{f}" : "b{f}/2t{f}", ratio, 0.38 * k, k, axis === "major" ? 10 : 13);
      if (axis === "major") add("Web", "h/t{w}", num(shape, "h/tw") ?? (req(shape, "d") - 2 * req(shape, "kdes")) / req(shape, "tw"), 3.76 * k, 5.70 * k, 15);
      break;
    }
    case "tee":
      add("Flange", "b{f}/2t{f}", num(shape, "bf/2tf") ?? req(shape, "bf") / (2 * req(shape, "tf")), 0.38 * k, k, 10);
      // F9.4 uses full depth d, not the clear stem depth.
      add("Stem", "d/t{w}", num(shape, "D/t") ?? req(shape, "d") / req(shape, "tw"), 0.84 * k, 1.52 * k, 14);
      break;
    case "angle":
      add("Leg", "b/t", Math.max(req(shape, "b"), req(shape, "d")) / req(shape, "t"), 0.54 * k, 0.91 * k, 12);
      break;
    case "double-angle":
      // F9.3(b) and F9.4(b) explicitly invoke F10.3, not tee-stem limits.
      add("Flange legs", "b/t", req(shape, "b") / req(shape, "t"), 0.54 * k, 0.91 * k, 12);
      add("Web legs", "d/t", req(shape, "d") / req(shape, "t"), 0.54 * k, 0.91 * k, 12);
      break;
    case "hss-rect": {
      const t = req(shape, "tdes");
      const b = axis === "major" ? num(shape, "b") ?? req(shape, "B") - 3 * t : num(shape, "h") ?? req(shape, "Ht") - 3 * t;
      const h = axis === "major" ? num(shape, "h") ?? req(shape, "Ht") - 3 * t : num(shape, "b") ?? req(shape, "B") - 3 * t;
      add("Flange", "b/t", b / t, 1.12 * k, 1.40 * k, 17);
      add("Web", "h/t", h / t, 2.42 * k, 5.70 * k, 19);
      break;
    }
    case "hss-round": case "pipe":
      add("Wall", "D/t", req(shape, "OD") / req(shape, "tdes"), 0.07 * k ** 2, 0.31 * k ** 2, 20);
      break;
  }
  return { elements, overall: worst(elements) };
}
