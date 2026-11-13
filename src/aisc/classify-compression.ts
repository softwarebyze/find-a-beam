/** Axial-compression element classification, ANSI/AISC 360-22 Table B4.1a. */
import { E, type Material } from "@/data/materials";
import { familyOf, num, req, type Shape } from "@/data/shapes";
import type { CompressionClass, ElementSlenderness, SectionClassification } from "./types";

export function classifyCompression(shape: Shape, mat: Material): SectionClassification<CompressionClass> {
  if (!(mat.Fy > 0) || !Number.isFinite(mat.Fy)) throw new RangeError("Fy must be finite and positive");
  const k = Math.sqrt(E / mat.Fy);
  const elements: ElementSlenderness<CompressionClass>[] = [];
  const add = (element: string, symbol: string, lambda: number, lambdaR: number, caseNo: number) => {
    elements.push({
      element,
      symbol,
      lambda,
      lambdaR,
      cls: lambda <= lambdaR ? "nonslender" : "slender",
      ref: `Table B4.1a, Case ${caseNo}`,
    });
  };
  switch (familyOf(shape)) {
    case "i-shape":
    case "tee":
      add("Flange", "b{f}/2t{f}", num(shape, "bf/2tf") ?? req(shape, "bf") / (2 * req(shape, "tf")), 0.56 * k, 1);
      if (familyOf(shape) === "tee")
        add("Stem", "d/t{w}", num(shape, "D/t") ?? req(shape, "d") / req(shape, "tw"), 0.75 * k, 4);
      else add("Web", "h/t{w}", req(shape, "h/tw"), 1.49 * k, 5);
      break;
    case "channel":
      add("Flange", "b/t{f}", num(shape, "b/t") ?? req(shape, "bf") / req(shape, "tf"), 0.56 * k, 1);
      add("Web", "h/t{w}", req(shape, "h/tw"), 1.49 * k, 5);
      break;
    case "angle":
    case "double-angle":
      // The full nominal leg widths are used (§B4.1); both legs can lose effective area.
      add("Leg (b)", "b/t", req(shape, "b") / req(shape, "t"), 0.45 * k, 3);
      add("Leg (d)", "d/t", req(shape, "d") / req(shape, "t"), 0.45 * k, 3);
      break;
    case "hss-rect":
      add("Wall (b)", "b/t{des}", req(shape, "b/tdes"), 1.4 * k, 6);
      add("Wall (h)", "h/t{des}", req(shape, "h/tdes"), 1.4 * k, 6);
      break;
    case "hss-round":
    case "pipe":
      add("Wall", "D/t", num(shape, "D/t") ?? req(shape, "OD") / req(shape, "tdes"), (0.11 * E) / mat.Fy, 9);
      break;
  }
  return { elements, overall: elements.some((e) => e.cls === "slender") ? "slender" : "nonslender" };
}
