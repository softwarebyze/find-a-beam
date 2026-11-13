/** AISC 360-22 §§G2.1, G3–G6. Tension field action is not credited. */
import { E } from "@/data/materials";
import { familyOf, num, req } from "@/data/shapes";
import { RESISTANCE } from "./common";
import type { CalcStep, ShearFn } from "./types";
import { state, step } from "./flexure/shared";

/** Three-branch shear buckling coefficient, Eqs. G2-9 through G2-11. */
function cv2(lambda: number, kv: number, Fy: number): number {
  const root = Math.sqrt(kv * E / Fy);
  return lambda <= 1.10 * root ? 1 : lambda <= 1.37 * root ? 1.10 * root / lambda : 1.51 * kv * E / (Fy * lambda ** 2);
}
export const shearStrength: ShearFn = (shape, mat, { axis, a, Lv }) => {
  const { Fy } = mat, fam = familyOf(shape);
  if (!Number.isFinite(Fy) || Fy <= 0) throw new RangeError("Fy must be finite and positive");
  if (a !== undefined && (!Number.isFinite(a) || a <= 0)) throw new RangeError("Stiffener spacing a must be finite and positive");
  if (Lv !== undefined && (!Number.isFinite(Lv) || Lv <= 0)) throw new RangeError("Lv must be finite and positive");
  const warnings: string[] = [], steps: CalcStep[] = [step("Yield stress", "F{y}", Fy, "stress", "§G1"), step("Modulus of elasticity", "E", E, "stress", "§G2.1")];
  let Aw: number, Cv = 1, kv = 0, lambda = 0, Vn: number;
  let phi: number = RESISTANCE.shear.phi, omega: number = RESISTANCE.shear.omega;
  let section: string, ref: string, coefficientRef: string;
  if (fam === "hss-round" || fam === "pipe") {
    const D = req(shape, "OD"), t = req(shape, "tdes"), dt = D / t;
    const longStress = 0.78 * E / dt ** 1.5;
    const lengthStress = Lv === undefined ? 0 : 1.60 * E / (Math.sqrt(Lv / D) * dt ** 1.25);
    const Fcr = Math.min(0.6 * Fy, Math.max(longStress, lengthStress));
    Aw = req(shape, "A") / 2;
    Vn = Fcr * Aw;
    Cv = Fcr / (0.6 * Fy);
    section = "§G5 Round HSS and pipe"; ref = "Eq. G5-1"; coefficientRef = "§G5";
    steps.push(step("Diameter / design thickness", "D/t", dt, "ratio", "§G5"), step("Long-length critical stress", "F{cr,b}", longStress, "stress", "Eq. G5-2b"));
    if (Lv === undefined) warnings.push("Lv omitted: the conservative long-length lower bound from Eq. G5-2b is used; Eq. G5-2a can increase strength when Lv is known.");
    else steps.push(step("Distance from maximum to zero shear", "L{v}", Lv, "span", "§G5"), step("Length-dependent critical stress", "F{cr,a}", lengthStress, "stress", "Eq. G5-2a"));
    steps.push(step("Critical shear stress (larger elastic stress, capped at 0.6Fy)", "F{cr}", Fcr, "stress", "§G5"));
  } else {
    if ((fam === "i-shape" || fam === "channel") && axis === "major") {
      const tw = req(shape, "tw");
      lambda = num(shape, "h/tw") ?? (req(shape, "d") - 2 * req(shape, "kdes")) / tw;
      const h = lambda * tw;
      Aw = req(shape, "d") * tw;
      kv = a === undefined || a / h > 3 ? 5.34 : 5 + 5 / (a / h) ** 2;
      const rolled = fam === "i-shape" && lambda <= 2.24 * Math.sqrt(E / Fy);
      Cv = rolled ? 1 : Math.min(1, 1.10 * Math.sqrt(kv * E / Fy) / lambda);
      if (rolled) { phi = RESISTANCE.shearRolledI.phi; omega = RESISTANCE.shearRolledI.omega; }
      section = "§G2.1 I-shaped members and channels — web shear"; ref = "Eq. G2-1";
      coefficientRef = rolled ? "Eq. G2-2" : Cv === 1 ? "Eq. G2-3" : "Eq. G2-4";
      if (a !== undefined) {
        steps.push(step("Stiffener spacing", "a", a, "span", "Eq. G2-5"), step("Stiffener panel aspect ratio", "a/h", a / h, "ratio", "Eq. G2-5"));
        warnings.push("Stiffeners are assumed to satisfy §G2.4. Tension field action under §§G2.2–G2.3 is not credited.");
      }
      steps.push(step("Rolled-I limit for φv = 1.00 / Ωv = 1.50", "λ{v}", 2.24 * Math.sqrt(E / Fy), "ratio", "§G2.1(a)"));
    } else if (fam === "hss-rect") {
      const t = req(shape, "tdes");
      const h = axis === "major" ? num(shape, "h") ?? req(shape, "Ht") - 3 * t : num(shape, "b") ?? req(shape, "B") - 3 * t;
      Aw = 2 * h * t; lambda = h / t; kv = 5;
      Cv = cv2(lambda, kv, Fy); section = "§G4 Rectangular HSS"; ref = "Eq. G4-1";
      coefficientRef = cv2Ref(lambda, kv, Fy);
      steps.push(step("Shear-resisting flat wall depth", "h", h, "length", "§G4"), step("Design thickness", "t", t, "length", "§B4.2"));
    } else if (axis === "minor" && (fam === "i-shape" || fam === "channel" || fam === "tee" || fam === "double-angle")) {
      const pair = fam === "double-angle", bf = req(shape, pair ? "b" : "bf"), tf = req(shape, pair ? "t" : "tf");
      const elements = fam === "tee" ? 1 : 2;
      Aw = elements * bf * tf;
      lambda = bf / ((fam === "i-shape" || fam === "tee" ? 2 : 1) * tf); kv = 1.2;
      Cv = cv2(lambda, kv, Fy); section = "§G6 Minor-axis shear without torsion"; ref = "Eq. G6-1";
      coefficientRef = cv2Ref(lambda, kv, Fy);
      steps.push(step("Number of equally loaded shear-resisting flanges / legs", "n", elements, "ratio", "§G6"), step("Area per flange / leg", "A{w,1}", bf * tf, "area", "Eq. G6-1"));
      warnings.push(`G6 strength sums ${elements} flange/leg element(s), with shear distributed equally and no torsion. Check individual elements if load distribution is unequal.`);
    } else {
      // G3 applies to a single leg or tee stem. Double-angle shear is the sum
      // of the two web legs, each checked using these same leg provisions.
      const pair = fam === "double-angle", tee = fam === "tee";
      const b = req(shape, tee || pair ? "d" : axis === "major" ? "b" : "d");
      const t = req(shape, tee ? "tw" : "t");
      Aw = (pair ? 2 : 1) * b * t; lambda = b / t; kv = 1.2;
      Cv = cv2(lambda, kv, Fy); section = "§G3 Single-angle legs and tee stems"; ref = "Eq. G3-1";
      coefficientRef = cv2Ref(lambda, kv, Fy);
      if (pair) warnings.push("Double-angle shear sums the two legs, assuming equal shear distribution and connections sufficient for both angles to act together.");
      if (fam === "angle") warnings.push("Single-angle shear is carried by the leg parallel to the force; load eccentricity and torsion are checked separately.");
    }
    Vn = 0.6 * Fy * Aw * Cv;
    steps.push(step("Shear plate slenderness", "h/t", lambda, "ratio", section.split(" ")[0]!), step("Shear plate buckling coefficient", "k{v}", kv, "ratio", section.startsWith("§G2") ? a === undefined ? "§G2.1(b)(2)" : "Eq. G2-5" : section.split(" ")[0]!));
  }
  if (a !== undefined && !(axis === "major" && (fam === "i-shape" || fam === "channel"))) warnings.push("Input a applies only to G2 web panels and is not used for this section/axis.");
  if (Lv !== undefined && fam !== "hss-round" && fam !== "pipe") warnings.push("Input Lv applies only to G5 round HSS/pipe and is not used for this section.");
  steps.push(step("Total shear-resisting area", "A{w}", Aw, "area", ref), step("Shear strength coefficient", section.startsWith("§G5") ? "F{cr}/(0.6F{y})" : section.startsWith("§G2") ? "C{v1}" : "C{v2}", Cv, "ratio", coefficientRef), step("Resistance factor", "φ{v}", phi, "ratio", phi === 1 ? "§G2.1(a)" : "§G1"), step("Safety factor", "Ω{v}", omega, "ratio", phi === 1 ? "§G2.1(a)" : "§G1"));
  return { kind: "shear", quantity: "force", nominal: Vn, phi, omega, governing: "V", Aw, Cv1: Cv, section, steps, warnings, limitStates: [state("V", "Shear yielding / buckling", Vn, ref, [], "force")] };
};
function cv2Ref(lambda: number, kv: number, Fy: number): string {
  const root = Math.sqrt(kv * E / Fy);
  return lambda <= 1.10 * root ? "Eq. G2-9" : lambda <= 1.37 * root ? "Eq. G2-10" : "Eq. G2-11";
}
