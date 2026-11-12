/** Flexural strength — AISC 360-22 Chapter F. */
import { E } from "@/data/materials";
import { familyOf, req } from "@/data/shapes";
import { classifyFlexure } from "./classify-flexure";
import { governingOf, RESISTANCE } from "./common";
import { UnsupportedError, type CalcStep, type FlexureFn, type FlexureResult, type LimitState } from "./types";

export const flexuralStrength: FlexureFn = (shape, mat, { axis, Lb, Cb = 1 }) => {
  if (familyOf(shape) !== "i-shape") throw new UnsupportedError(`Flexure for ${shape.type} shapes is not implemented yet`);
  const { Fy } = mat;
  const classification = classifyFlexure(shape, mat, axis);
  const flange = classification.elements[0]!;
  const warnings: string[] = [];
  const limitStates: LimitState[] = [];
  const steps: CalcStep[] = [];

  if (axis === "minor") {
    const Zy = req(shape, "Zy"), Sy = req(shape, "Sy");
    const Mp = Math.min(Fy * Zy, 1.6 * Fy * Sy);
    limitStates.push({ id: "Y", name: "Yielding", ref: "§F6.1", nominal: Mp, steps: [
      { label: "Plastic moment", symbol: "M{n}", expr: "F{y}Z{y} ≤ 1.6F{y}S{y}", value: Mp, quantity: "moment", ref: "Eq. F6-1" },
    ] });
    if (flange.cls !== "compact") {
      const lam = flange.lambda, lp = flange.lambdaP!, lr = flange.lambdaR;
      const Mn = flange.cls === "noncompact"
        ? Mp - (Mp - 0.7 * Fy * Sy) * ((lam - lp) / (lr - lp))
        : ((0.69 * E) / lam ** 2) * Sy;
      limitStates.push({ id: "FLB", name: "Flange local buckling", ref: "§F6.2", nominal: Mn, steps: [
        { label: "Flange local buckling", symbol: "M{n}", value: Mn, quantity: "moment", ref: flange.cls === "noncompact" ? "Eq. F6-2" : "Eq. F6-3" },
      ] });
    }
    const gov = governingOf(limitStates);
    return { kind: "flexure", quantity: "moment", nominal: gov.nominal, ...RESISTANCE.flexure, governing: gov.id, limitStates,
      section: "§F6 I-shaped members bent about their minor axis", steps, warnings, classification, Mp } satisfies FlexureResult;
  }

  if (classification.elements[1]!.cls !== "compact") throw new UnsupportedError("Noncompact/slender webs (§F4/F5) are not implemented yet");
  const Zx = req(shape, "Zx"), Sx = req(shape, "Sx"), ry = req(shape, "ry"), rts = req(shape, "rts"), J = req(shape, "J"), ho = req(shape, "ho");
  const Mp = Fy * Zx;
  const c = 1;
  const Lp = 1.76 * ry * Math.sqrt(E / Fy);
  const jc = (J * c) / (Sx * ho);
  const Lr = 1.95 * rts * (E / (0.7 * Fy)) * Math.sqrt(jc + Math.sqrt(jc ** 2 + 6.76 * ((0.7 * Fy) / E) ** 2));
  steps.push(
    { label: "Plastic moment", symbol: "M{p}", expr: "F{y}Z{x}", value: Mp, quantity: "moment", ref: "Eq. F2-1" },
    { label: "Limiting unbraced length for yielding", symbol: "L{p}", expr: "1.76 r{y} √(E/F{y})", value: Lp, quantity: "span", ref: "Eq. F2-5" },
    { label: "Limiting unbraced length for inelastic LTB", symbol: "L{r}", expr: "1.95 r{ts} (E/0.7F{y}) √(Jc/S{x}h{o} + √((Jc/S{x}h{o})² + 6.76(0.7F{y}/E)²))", value: Lr, quantity: "span", ref: "Eq. F2-6" },
  );

  limitStates.push({ id: "Y", name: "Yielding", ref: "§F2.1", nominal: Mp, steps: [{ label: "Nominal flexural strength", symbol: "M{n}", expr: "M{p} = F{y}Z{x}", value: Mp, quantity: "moment", ref: "Eq. F2-1" }] });

  if (Lb > Lp) {
    let Mn: number;
    const ltbSteps: CalcStep[] = [{ label: "Unbraced length", symbol: "L{b}", value: Lb, quantity: "span" }, { label: "Lateral-torsional buckling modification factor", symbol: "C{b}", value: Cb, quantity: "ratio", ref: "Eq. F1-1" }];
    if (Lb <= Lr) {
      Mn = Math.min(Mp, Cb * (Mp - (Mp - 0.7 * Fy * Sx) * ((Lb - Lp) / (Lr - Lp))));
      ltbSteps.push({ label: "Inelastic LTB (L{p} < L{b} ≤ L{r})", symbol: "M{n}", expr: "C{b}[M{p} − (M{p} − 0.7F{y}S{x})((L{b} − L{p})/(L{r} − L{p}))] ≤ M{p}", value: Mn, quantity: "moment", ref: "Eq. F2-2" });
    } else {
      const s = Lb / rts;
      const Fcr = ((Cb * Math.PI ** 2 * E) / s ** 2) * Math.sqrt(1 + 0.078 * jc * s ** 2);
      Mn = Math.min(Mp, Fcr * Sx);
      ltbSteps.push(
        { label: "Critical stress", symbol: "F{cr}", expr: "(C{b}π²E/(L{b}/r{ts})²) √(1 + 0.078 (Jc/S{x}h{o})(L{b}/r{ts})²)", value: Fcr, quantity: "stress", ref: "Eq. F2-4" },
        { label: "Elastic LTB (L{b} > L{r})", symbol: "M{n}", expr: "F{cr}S{x} ≤ M{p}", value: Mn, quantity: "moment", ref: "Eq. F2-3" },
      );
    }
    limitStates.push({ id: "LTB", name: "Lateral-torsional buckling", ref: "§F2.2", nominal: Mn, steps: ltbSteps });
  }

  let section = "§F2 Doubly symmetric compact I-shaped members bent about their major axis";
  if (flange.cls !== "compact") {
    section = "§F3 Doubly symmetric I-shaped members with compact webs and noncompact or slender flanges";
    const lam = flange.lambda, lp = flange.lambdaP!, lr = flange.lambdaR;
    let Mn: number;
    if (flange.cls === "noncompact") {
      Mn = Mp - (Mp - 0.7 * Fy * Sx) * ((lam - lp) / (lr - lp));
    } else {
      const kc = Math.min(0.76, Math.max(0.35, 4 / Math.sqrt(req(shape, "h/tw"))));
      Mn = (0.9 * E * kc * Sx) / lam ** 2;
    }
    limitStates.push({ id: "FLB", name: "Compression flange local buckling", ref: "§F3.2", nominal: Mn, steps: [
      { label: "Flange local buckling", symbol: "M{n}", value: Mn, quantity: "moment", ref: flange.cls === "noncompact" ? "Eq. F3-1" : "Eq. F3-2" },
    ] });
  }

  const gov = governingOf(limitStates);
  return { kind: "flexure", quantity: "moment", nominal: gov.nominal, ...RESISTANCE.flexure, governing: gov.id, limitStates, section, steps, warnings, classification, Mp, Lp, Lr };
};
