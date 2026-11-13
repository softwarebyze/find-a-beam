/** AISC 360-22 §§F7–F8. F7.4 equation numbering incorporates AISC errata:
 * https://www.aisc.org/media/qonm4cxk/errata_360-22_1st-printing_01232025.pdf
 * First-printing F7-10…F7-13 are corrected to F7-8…F7-11. */
import { E, type Material } from "@/data/materials";
import { familyOf, num, req, type Shape } from "@/data/shapes";
import { UnsupportedError, type FlexureInput, type FlexureResult } from "../types";
import { finish, interpolate, rpgOf, state, step, type FlexureContext } from "./shared";

export function hssFlexure(s: Shape, m: Material, input: FlexureInput, c: FlexureContext): FlexureResult {
  const { Fy } = m,
    { axis, Lb, Cb = 1 } = input;
  const S = req(s, axis === "major" ? "Sx" : "Sy"),
    Z = req(s, axis === "major" ? "Zx" : "Zy"),
    Mp = Fy * Z;
  const f = c.classification.elements[0]!;
  if (familyOf(s) !== "hss-rect") {
    if (f.lambda >= (0.45 * E) / Fy)
      throw new UnsupportedError(`§F8 applies only for D/t < 0.45E/Fy; ${s.label} is outside that range.`);
    c.limitStates.push(state("Y", "Yielding", Mp, "Eq. F8-1"));
    if (f.cls !== "compact") {
      const Fcr = (0.33 * E) / f.lambda;
      const Mn = f.cls === "noncompact" ? ((0.021 * E) / f.lambda + Fy) * S : Fcr * S;
      c.limitStates.push(
        state(
          "LB",
          "Wall local buckling",
          Math.min(Mp, Mn),
          f.cls === "noncompact" ? "Eq. F8-2" : "Eq. F8-3",
          f.cls === "slender" ? [step("Critical wall stress", "F{cr}", Fcr, "stress", "Eq. F8-4")] : [],
        ),
      );
    }
    return finish(c, Mp, "§F8 Round HSS and pipe");
  }
  const t = req(s, "tdes"),
    H = req(s, axis === "major" ? "Ht" : "B");
  const b = axis === "major" ? (num(s, "b") ?? req(s, "B") - 3 * t) : (num(s, "h") ?? req(s, "Ht") - 3 * t);
  const h = axis === "major" ? (num(s, "h") ?? req(s, "Ht") - 3 * t) : (num(s, "b") ?? req(s, "B") - 3 * t);
  const w = c.classification.elements[1]!;
  if (w.cls === "slender" && f.cls === "slender")
    throw new UnsupportedError("§F7.3 does not address sections with both slender flanges and slender webs.");
  c.steps.push(
    step("Compression flange flat width", "b", b, "length", "§B4.1b(d)"),
    step("Web flat depth", "h", h, "length", "§B4.1b(d)"),
    step("Design wall thickness", "t", t, "length", "§B4.2"),
  );
  c.limitStates.push(state("Y", "Yielding", Mp, "Eq. F7-1"));
  if (f.cls === "noncompact")
    c.limitStates.push(
      state(
        "FLB",
        "Flange local buckling",
        Math.min(Mp, Mp - (Mp - Fy * S) * interpolate(f.lambda, f.lambdaP!, f.lambdaR)),
        "Eq. F7-2",
      ),
    );
  if (f.cls === "slender") {
    const be = Math.min(b, 1.92 * t * Math.sqrt(E / Fy) * (1 - (0.38 / (b / t)) * Math.sqrt(E / Fy)));
    // Remove only the ineffective middle strip of the compression flange from the
    // tabulated rounded-corner section, then relocate the elastic neutral axis.
    const removed = (b - be) * t,
      Aeff = req(s, "A") - removed,
      y = (H - t) / 2;
    const ybar = (-removed * y) / Aeff;
    const Ieff = req(s, axis === "major" ? "Ix" : "Iy") - removed * (y ** 2 + t ** 2 / 12) - Aeff * ybar ** 2;
    const Se = Ieff / (H / 2 - ybar);
    c.limitStates.push(
      state("FLB", "Flange local buckling", Math.min(Mp, Fy * Se), "Eq. F7-3", [
        step("Effective flange width", "b{e}", be, "length", "Eq. F7-4", "1.92t√(E/F{y})[1 − 0.38√(E/F{y})/(b/t)] ≤ b"),
        step("Effective neutral axis shift", "y{e}", ybar, "length", "§F7.2(c)"),
        step("Effective section modulus to compression face", "S{e}", Se, "modulus", "§F7.2(c)"),
      ]),
    );
  }
  if (w.cls === "noncompact")
    c.limitStates.push(
      state(
        "WLB",
        "Web local buckling",
        Math.min(Mp, Mp - (Mp - Fy * S) * interpolate(w.lambda, w.lambdaP!, w.lambdaR)),
        "Eq. F7-6",
      ),
    );
  if (w.cls === "slender") {
    const Rpg = rpgOf((2 * h) / b, h / t, E, Fy);
    c.limitStates.push(
      state("WLB", "Web local buckling", Rpg * Fy * S, "Eq. F7-7", [
        step("Web reduction factor", "R{pg}", Rpg, "ratio", "Eq. F5-6"),
      ]),
    );
  }
  // F7.4 user note: square sections and minor-axis bending have no LTB limit state.
  if (axis === "minor" || req(s, "Ht") === req(s, "B")) return finish(c, Mp, "§F7 Square and rectangular HSS");
  const ry = req(s, "ry"),
    rootJA = Math.sqrt(req(s, "J") * req(s, "A"));
  const Lp = (0.13 * E * ry * rootJA) / Mp,
    Lr = (2 * E * ry * rootJA) / (0.7 * Fy * S);
  c.steps.push(
    step("Limiting length for yielding", "L{p}", Lp, "span", "Eq. F7-10", "0.13Er{y}√(JA{g})/M{p}"),
    step("Limiting length for inelastic LTB", "L{r}", Lr, "span", "Eq. F7-11"),
  );
  if (Lb > Lp) {
    const Mn = Lb <= Lr ? Cb * (Mp - (Mp - 0.7 * Fy * S) * interpolate(Lb, Lp, Lr)) : (2 * E * Cb * rootJA) / (Lb / ry);
    c.limitStates.push(
      state("LTB", "Lateral-torsional buckling", Math.min(Mp, Mn), Lb <= Lr ? "Eq. F7-8" : "Eq. F7-9"),
    );
  }
  return finish(c, Mp, "§F7 Square and rectangular HSS", Lp, Lr);
}
