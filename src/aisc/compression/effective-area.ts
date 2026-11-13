/** Stress-dependent effective area, ANSI/AISC 360-22 §E7. */
import { E } from "@/data/materials";
import { familyOf, req, type Shape } from "@/data/shapes";
import { UnsupportedError, type CalcStep, type CompressionClass, type SectionClassification } from "../types";

export function effectiveCompressionArea(shape: Shape, Fy: number, Fn: number, classification: SectionClassification<CompressionClass>): { Ae: number; steps: CalcStep[] } {
  const Ag = req(shape, "A"), family = familyOf(shape);
  const steps: CalcStep[] = [];
  if (family === "hss-round" || family === "pipe") {
    const lambda = req(shape, "D/t");
    if (lambda >= 0.45 * E / Fy) throw new UnsupportedError(`${shape.label}: D/t ≥ 0.45E/Fy is outside §E7.2`);
    const Ae = lambda <= 0.11 * E / Fy ? Ag : Math.min(Ag, Ag * (0.038 * E / (Fy * lambda) + 2 / 3));
    steps.push({ label: "Effective area of round section", symbol: "A{e}", expr: lambda <= 0.11 * E / Fy ? "A{g}" : "[0.038E/(F{y}(D/t)) + 2/3]A{g}", value: Ae, quantity: "area", ref: lambda <= 0.11 * E / Fy ? "Eq. E7-6" : "Eq. E7-7" });
    return { Ae, steps };
  }
  let reduction = 0;
  for (const e of classification.elements) {
    if (e.cls !== "slender") continue;
    let b: number, t: number, count: number, c1: number, c2: number;
    if (family === "hss-rect") {
      t = req(shape, "tdes"); b = req(shape, e.element === "Wall (b)" ? "b" : "h"); count = 2; c1 = 0.20; c2 = 1.38;
    } else if (e.element === "Web") {
      t = req(shape, "tw"); b = req(shape, "h/tw") * t; count = 1; c1 = 0.18; c2 = 1.31;
    } else if (e.element === "Flange") {
      t = req(shape, "tf"); b = req(shape, "bf") / (family === "channel" ? 1 : 2);
      count = family === "i-shape" ? 4 : 2; c1 = 0.22; c2 = 1.49;
    } else if (e.element === "Stem") {
      t = req(shape, "tw"); b = req(shape, "d"); count = 1; c1 = 0.22; c2 = 1.49;
    } else {
      t = req(shape, "t"); b = req(shape, e.element === "Leg (b)" ? "b" : "d"); count = family === "double-angle" ? 2 : 1; c1 = 0.22; c2 = 1.49;
    }
    const Fel = (c2 * e.lambdaR / e.lambda) ** 2 * Fy;
    const full = e.lambda <= e.lambdaR * Math.sqrt(Fy / Fn);
    const root = Math.sqrt(Fel / Fn);
    const be = full ? b : Math.min(b, Math.max(0, b * (1 - c1 * root) * root));
    reduction += count * (b - be) * t;
    steps.push(
      { label: `${e.element}: effective-width factor`, symbol: "c{1}", value: c1, quantity: "ratio", ref: "Table E7.1" },
      { label: `${e.element}: effective-width factor`, symbol: "c{2}", value: c2, quantity: "ratio", ref: "Table E7.1" },
      { label: `${e.element}: elastic local buckling stress`, symbol: "F{el}", expr: "(c{2}λ{r}/λ)²F{y}", value: Fel, quantity: "stress", ref: "Eq. E7-5" },
      { label: `${e.element}: effective width`, symbol: "b{e}", expr: full ? "b; λ ≤ λ{r}√(F{y}/F{n})" : "b(1 − c{1}√(F{el}/F{n}))√(F{el}/F{n})", value: be, quantity: "length", ref: full ? "Eq. E7-2" : "Eq. E7-3", note: `${count} element(s); b = ${b} in.; t = ${t} in.` },
    );
  }
  const Ae = Ag - reduction;
  if (!(Ae > 0)) throw new UnsupportedError(`${shape.label}: effective-area deductions exceed the gross area; detailed section analysis is required`);
  steps.push({ label: "Effective area", symbol: "A{e}", expr: "A{g} − Σ(b − b{e})t", value: Ae, quantity: "area", ref: "§E7 user note" });
  return { Ae, steps };
}
