/** AISC 360-22 §§F2–F6. Database I-sections are doubly symmetric rolled shapes. */
import { E, type Material } from "@/data/materials";
import { familyOf, req, type Shape } from "@/data/shapes";
import { UnsupportedError, type FlexureInput, type FlexureResult } from "../types";
import { finish, interpolate, kcOf, rpgOf, state, step, type FlexureContext } from "./shared";

export function iShapeFlexure(s: Shape, m: Material, input: FlexureInput, c: FlexureContext): FlexureResult {
  const { Fy } = m,
    { axis, Lb, Cb = 1 } = input;
  const flange = c.classification.elements[0]!;
  const S = req(s, axis === "major" ? "Sx" : "Sy");
  const Z = req(s, axis === "major" ? "Zx" : "Zy");
  if (axis === "minor") {
    const Mp = Math.min(Fy * Z, 1.6 * Fy * S);
    c.limitStates.push(state("Y", "Yielding", Mp, "Eq. F6-1"));
    if (flange.cls !== "compact") {
      const Mn =
        flange.cls === "noncompact"
          ? Mp - (Mp - 0.7 * Fy * S) * interpolate(flange.lambda, flange.lambdaP!, flange.lambdaR)
          : (0.7 * E * S) / flange.lambda ** 2;
      c.limitStates.push(
        state(
          "FLB",
          "Flange local buckling",
          Math.min(Mp, Mn),
          flange.cls === "noncompact" ? "Eq. F6-2" : "Eq. F6-3",
          flange.cls === "slender"
            ? [step("Critical flange stress", "F{cr}", Mn / S, "stress", "Eq. F6-4", "0.70E/(b/t{f})²")]
            : [],
        ),
      );
    }
    if (familyOf(s) === "channel")
      c.warnings.push(
        "F6 channel bending uses the minimum geometric y-axis elastic section modulus; loading must not introduce unaccounted torsion.",
      );
    return finish(c, Mp, "§F6 I-shaped members and channels bent about their minor axis");
  }
  const web = c.classification.elements[1]!;
  if (familyOf(s) === "channel" && (flange.cls !== "compact" || web.cls !== "compact"))
    throw new UnsupportedError(
      "§F2 requires compact channel elements; noncompact/slender channels require analysis outside §§F2–F6.",
    );
  if (web.cls !== "compact") return noncompactWeb(s, m, input, c);
  const Mp = Fy * Z,
    ry = req(s, "ry"),
    rts = req(s, "rts"),
    J = req(s, "J"),
    ho = req(s, "ho");
  const channel = familyOf(s) === "channel";
  const coefficient = channel ? (ho / 2) * Math.sqrt(req(s, "Iy") / req(s, "Cw")) : 1;
  const jc = (J * coefficient) / (S * ho);
  const Lp = 1.76 * ry * Math.sqrt(E / Fy);
  const Lr = ((1.95 * rts * E) / (0.7 * Fy)) * Math.sqrt(jc + Math.sqrt(jc ** 2 + 6.76 * ((0.7 * Fy) / E) ** 2));
  c.steps.push(
    step(
      "Channel / I-shape LTB coefficient",
      "c",
      coefficient,
      "ratio",
      channel ? "Eq. F2-8b" : "Eq. F2-8a",
      channel ? "(h{o}/2)√(I{y}/C{w})" : "1",
    ),
    step("LTB effective radius", "r{ts}", rts, "length", "Eq. F2-7"),
    step("Limiting unbraced length for yielding", "L{p}", Lp, "span", "Eq. F2-5", "1.76r{y}√(E/F{y})"),
    step("Limiting unbraced length for inelastic LTB", "L{r}", Lr, "span", "Eq. F2-6"),
  );
  c.limitStates.push(state("Y", "Yielding", Mp, "Eq. F2-1"));
  if (Lb > Lp) {
    const Fcr = ((Cb * Math.PI ** 2 * E) / (Lb / rts) ** 2) * Math.sqrt(1 + 0.078 * jc * (Lb / rts) ** 2);
    const Mn = Lb <= Lr ? Cb * (Mp - (Mp - 0.7 * Fy * S) * interpolate(Lb, Lp, Lr)) : Fcr * S;
    c.limitStates.push(
      state(
        "LTB",
        "Lateral-torsional buckling",
        Math.min(Mp, Mn),
        Lb <= Lr ? "Eq. F2-2" : "Eq. F2-3",
        Lb > Lr ? [step("Elastic critical stress", "F{cr}", Fcr, "stress", "Eq. F2-4")] : [],
      ),
    );
  }
  if (flange.cls !== "compact") {
    const kc = kcOf(web.lambda);
    const Mn =
      flange.cls === "noncompact"
        ? Mp - (Mp - 0.7 * Fy * S) * interpolate(flange.lambda, flange.lambdaP!, flange.lambdaR)
        : (0.9 * E * kc * S) / flange.lambda ** 2;
    c.limitStates.push(
      state(
        "FLB",
        "Compression flange local buckling",
        Math.min(Mp, Mn),
        flange.cls === "noncompact" ? "Eq. F3-1" : "Eq. F3-2",
        flange.cls === "slender" ? [step("Plate buckling coefficient", "k{c}", kc, "ratio", "§F3.2")] : [],
      ),
    );
  }
  if (channel)
    c.warnings.push(
      "Channel LTB assumes loads act through the shear center or twisting is restrained (§F1); check load eccentricity separately.",
    );
  return finish(
    c,
    Mp,
    flange.cls === "compact"
      ? "§F2 Compact I-shaped members and channels"
      : "§F3 Compact-web I-shaped members with noncompact or slender flanges",
    Lp,
    Lr,
  );
}

function noncompactWeb(s: Shape, m: Material, input: FlexureInput, c: FlexureContext): FlexureResult {
  const { Fy } = m,
    { Lb, Cb = 1 } = input;
  const f = c.classification.elements[0]!,
    w = c.classification.elements[1]!;
  const Sxc = req(s, "Sx"),
    Sxt = Sxc; // All I-sections in v16.0 are doubly symmetric.
  const Myc = Fy * Sxc,
    Myt = Fy * Sxt,
    Mp = Math.min(Fy * req(s, "Zx"), 1.6 * Myc);
  const bf = req(s, "bf"),
    tf = req(s, "tf"),
    tw = req(s, "tw"),
    hc = w.lambda * tw;
  const aw = (hc * tw) / (bf * tf),
    rt = bf / Math.sqrt(12 * (1 + aw / 6));
  const IycIy = (tf * bf ** 3) / 12 / req(s, "Iy");
  const FL = Sxt / Sxc >= 0.7 ? 0.7 * Fy : Math.max(0.5 * Fy, (Fy * Sxt) / Sxc);
  const kc = kcOf(w.lambda),
    Lp = 1.1 * rt * Math.sqrt(E / Fy);
  c.steps.push(
    step("Compression flange yield moment", "M{yc}", Myc, "moment", "Eq. F4-4"),
    step("Tension flange yield moment", "M{yt}", Myt, "moment", "§F4.4"),
    step("Web-to-flange area ratio", "a{w}", aw, "ratio", "Eq. F4-12"),
    step("Effective LTB radius", "r{t}", rt, "length", "Eq. F4-11"),
    step("Inelastic buckling stress threshold", "F{L}", FL, "stress", "Eq. F4-6a"),
    step("Limiting length for yielding", "L{p}", Lp, "span", "Eq. F4-7"),
  );
  if (w.cls === "slender") {
    const Rpg = rpgOf(aw, w.lambda, E, Fy),
      Lr = Math.PI * rt * Math.sqrt(E / (0.7 * Fy));
    c.steps.push(
      step("Slender-web reduction", "R{pg}", Rpg, "ratio", "Eq. F5-6"),
      step("Limiting length for inelastic LTB", "L{r}", Lr, "span", "Eq. F5-5"),
    );
    c.limitStates.push(state("Y", "Compression flange yielding", Rpg * Myc, "Eq. F5-1"));
    if (Lb > Lp) {
      const Fcr = Math.min(
        Fy,
        Lb <= Lr ? Cb * Fy * (1 - 0.3 * interpolate(Lb, Lp, Lr)) : (Cb * Math.PI ** 2 * E) / (Lb / rt) ** 2,
      );
      c.limitStates.push(
        state("LTB", "Lateral-torsional buckling", Rpg * Fcr * Sxc, "Eq. F5-2", [
          step("Critical stress", "F{cr}", Fcr, "stress", Lb <= Lr ? "Eq. F5-3" : "Eq. F5-4"),
        ]),
      );
    }
    if (f.cls !== "compact") {
      const Fcr =
        f.cls === "noncompact"
          ? Fy * (1 - 0.3 * interpolate(f.lambda, f.lambdaP!, f.lambdaR))
          : (0.9 * E * kc) / f.lambda ** 2;
      c.limitStates.push(
        state("FLB", "Compression flange local buckling", Math.min(Rpg * Myc, Rpg * Fcr * Sxc), "Eq. F5-7", [
          step("Critical flange stress", "F{cr}", Fcr, "stress", f.cls === "noncompact" ? "Eq. F5-8" : "Eq. F5-9"),
        ]),
      );
    }
    if (Sxt < Sxc) c.limitStates.push(state("TFY", "Tension flange yielding", Myt, "Eq. F5-10"));
    return finish(c, Mp, "§F5 I-shaped members with slender webs", Lp, Lr);
  }
  const Rpc = IycIy <= 0.23 ? 1 : Mp / Myc - (Mp / Myc - 1) * interpolate(w.lambda, w.lambdaP!, w.lambdaR);
  const Rpt = IycIy <= 0.23 ? 1 : Mp / Myt - (Mp / Myt - 1) * interpolate(w.lambda, w.lambdaP!, w.lambdaR);
  const J = IycIy <= 0.23 ? 0 : req(s, "J"),
    jc = J / (Sxc * req(s, "ho"));
  const Lr = ((1.95 * rt * E) / FL) * Math.sqrt(jc + Math.sqrt(jc ** 2 + 6.76 * (FL / E) ** 2));
  c.steps.push(
    step("Compression web plastification factor", "R{pc}", Rpc, "ratio", IycIy <= 0.23 ? "Eq. F4-10" : "Eq. F4-9b"),
    step("Tension web plastification factor", "R{pt}", Rpt, "ratio", IycIy <= 0.23 ? "Eq. F4-17" : "Eq. F4-16b"),
    step("Limiting length for inelastic LTB", "L{r}", Lr, "span", "Eq. F4-8"),
  );
  c.limitStates.push(state("Y", "Compression flange yielding", Rpc * Myc, "Eq. F4-1"));
  if (Lb > Lp) {
    const Fcr = ((Cb * Math.PI ** 2 * E) / (Lb / rt) ** 2) * Math.sqrt(1 + 0.078 * jc * (Lb / rt) ** 2);
    const Mn = Lb <= Lr ? Cb * (Rpc * Myc - (Rpc * Myc - FL * Sxc) * interpolate(Lb, Lp, Lr)) : Fcr * Sxc;
    c.limitStates.push(
      state(
        "LTB",
        "Lateral-torsional buckling",
        Math.min(Rpc * Myc, Mn),
        Lb <= Lr ? "Eq. F4-2" : "Eq. F4-3",
        Lb > Lr ? [step("Critical stress", "F{cr}", Fcr, "stress", "Eq. F4-5")] : [],
      ),
    );
  }
  if (f.cls !== "compact") {
    const Mn =
      f.cls === "noncompact"
        ? Rpc * Myc - (Rpc * Myc - FL * Sxc) * interpolate(f.lambda, f.lambdaP!, f.lambdaR)
        : (0.9 * E * kc * Sxc) / f.lambda ** 2;
    c.limitStates.push(
      state(
        "FLB",
        "Compression flange local buckling",
        Math.min(Rpc * Myc, Mn),
        f.cls === "noncompact" ? "Eq. F4-13" : "Eq. F4-14",
      ),
    );
  }
  if (Sxt < Sxc) c.limitStates.push(state("TFY", "Tension flange yielding", Rpt * Myt, "Eq. F4-15"));
  return finish(c, Mp, "§F4 I-shaped members with noncompact webs", Lp, Lr);
}
