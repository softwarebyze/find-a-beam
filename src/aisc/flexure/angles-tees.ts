/** AISC 360-22 §§F9–F10. */
import { E, G, type Material } from "@/data/materials";
import { familyOf, req, SHAPES, type Shape } from "@/data/shapes";
import { UnsupportedError, type FlexureInput, type FlexureResult } from "../types";
import { finish, interpolate, state, step, type FlexureContext } from "./shared";

// Double-angle records omit J. Saint-Venant constants add for the two legs;
// spacing changes Iy but does not change J. Use the actual matching rolled angle.
const angleJ = new Map(
  SHAPES.filter((s) => s.type === "L").map((s) => [
    `${Math.max(req(s, "b"), req(s, "d"))}/${Math.min(req(s, "b"), req(s, "d"))}/${req(s, "t")}`,
    req(s, "J"),
  ]),
);
function doubleAngleJ(s: Shape): number {
  const j = angleJ.get(`${Math.max(req(s, "b"), req(s, "d"))}/${Math.min(req(s, "b"), req(s, "d"))}/${req(s, "t")}`);
  if (j === undefined)
    throw new UnsupportedError("§F9 double-angle LTB requires the torsional constant of the constituent rolled angle.");
  return 2 * j;
}
/** Eqs. F10-2/F10-3, also invoked by F9.2(b)(2). */
export function angleLtb(My: number, Mcr: number): number {
  return My / Mcr <= 1
    ? Math.min(1.5 * My, (1.92 - 1.17 * Math.sqrt(My / Mcr)) * My)
    : (0.92 - (0.17 * Mcr) / My) * Mcr;
}
function legLocal(c: FlexureContext, lambda: number, Fy: number, Sc: number, id: string, name: string): void {
  if (lambda <= 0.54 * Math.sqrt(E / Fy)) return;
  const slender = lambda > 0.91 * Math.sqrt(E / Fy);
  const Fcr = slender ? (0.71 * E) / lambda ** 2 : Fy * (2.43 - 1.72 * lambda * Math.sqrt(Fy / E));
  c.limitStates.push(
    state(id, name, Fcr * Sc, slender ? "Eq. F10-7" : "Eq. F10-6", [
      step("Compression leg slenderness", "b/t", lambda, "ratio", "Table B4.1b, Case 12"),
      step("Local buckling stress", "F{cr}", Fcr, "stress", slender ? "Eq. F10-8" : "Eq. F10-6"),
    ]),
  );
}
export function teeFlexure(s: Shape, m: Material, input: FlexureInput, c: FlexureContext): FlexureResult {
  const { Fy } = m,
    { axis, Lb, stemInCompression = false } = input;
  const pair = familyOf(s) === "double-angle";
  if (axis === "minor") return teeMinorFlexure(s, m, input, c, pair);
  const Sx = req(s, "Sx"),
    My = Fy * Sx;
  const Mp = stemInCompression ? (pair ? 1.5 * My : My) : Math.min(Fy * req(s, "Zx"), 1.6 * My);
  const J = pair ? doubleAngleJ(s) : req(s, "J"),
    Iy = req(s, "Iy"),
    d = req(s, "d");
  c.steps.push(
    step("Yield moment", "M{y}", My, "moment", "Eq. F9-3"),
    step("Saint-Venant torsional constant", "J", J, "torsion", "§F9.2"),
  );
  c.warnings.push(
    stemInCompression
      ? "F9 stem/web legs are assumed in compression somewhere along the unbraced length; the negative B branch applies."
      : "F9 stem/web legs are assumed in tension throughout the unbraced length. Set stemInCompression for reversed or compression-stem bending.",
  );
  if (pair)
    c.warnings.push(
      "Double angles must be connected to act as one member; J is twice the matching single-angle database value. Built-up member connection design is separate.",
    );
  if (input.Cb !== undefined && input.Cb !== 1)
    c.warnings.push("Cb is not used by §F9; its LTB equations are applied directly.");
  c.limitStates.push(state("Y", "Yielding", Mp, stemInCompression ? (pair ? "Eq. F9-5" : "Eq. F9-4") : "Eq. F9-2"));
  const Lp = stemInCompression ? undefined : 1.76 * req(s, "ry") * Math.sqrt(E / Fy);
  const Lr = stemInCompression
    ? undefined
    : ((((1.95 * E) / Fy) * Math.sqrt(Iy * J)) / Sx) * Math.sqrt((((2.36 * Fy) / E) * d * Sx) / J + 1);
  if (Lp !== undefined && Lr !== undefined)
    c.steps.push(
      step("Limiting length for yielding", "L{p}", Lp, "span", "Eq. F9-8"),
      step("Limiting length for inelastic LTB", "L{r}", Lr, "span", "Eq. F9-9"),
    );
  if (Lb > 0 && (stemInCompression || Lb > Lp!)) {
    const B = (((stemInCompression ? -1 : 1) * 2.3 * d) / Lb) * Math.sqrt(Iy / J);
    // Rationalize the negative-B expression to avoid cancellation for short segments.
    const sum = B < 0 ? 1 / (Math.sqrt(1 + B ** 2) - B) : B + Math.sqrt(1 + B ** 2);
    const Mcr = ((1.95 * E) / Lb) * Math.sqrt(Iy * J) * sum;
    const Mn = stemInCompression
      ? pair
        ? angleLtb(My, Mcr)
        : Math.min(Mcr, My)
      : Lb <= Lr!
        ? Mp - (Mp - My) * interpolate(Lb, Lp!, Lr!)
        : Mcr;
    c.limitStates.push(
      state(
        "LTB",
        "Lateral-torsional buckling",
        Math.min(Mp, Mn),
        stemInCompression ? (pair ? "§F9.2(b)(2)" : "Eq. F9-13") : Lb <= Lr! ? "Eq. F9-6" : "Eq. F9-7",
        [
          step("Tee / double-angle LTB parameter", "B", B, "ratio", stemInCompression ? "Eq. F9-12" : "Eq. F9-11"),
          step("Elastic critical moment", "M{cr}", Mcr, "moment", "Eq. F9-10"),
        ],
      ),
    );
  }
  if (pair) {
    const lambda = req(s, stemInCompression ? "d" : "b") / req(s, "t");
    const Sc = stemInCompression ? Sx : req(s, "Ix") / req(s, "y");
    legLocal(
      c,
      lambda,
      Fy,
      Sc,
      stemInCompression ? "WLB" : "FLB",
      stemInCompression ? "Web-leg local buckling (§F9.4(b))" : "Flange-leg local buckling (§F9.3(b))",
    );
  } else if (stemInCompression) {
    const lambda = c.classification.elements[1]!.lambda;
    const Fcr =
      lambda <= 0.84 * Math.sqrt(E / Fy)
        ? Fy
        : lambda <= 1.52 * Math.sqrt(E / Fy)
          ? Fy * (1.43 - 0.515 * lambda * Math.sqrt(Fy / E))
          : (1.52 * E) / lambda ** 2;
    c.limitStates.push(
      state("WLB", "Stem local buckling", Fcr * Sx, "Eq. F9-16", [
        step(
          "Stem critical stress",
          "F{cr}",
          Fcr,
          "stress",
          lambda <= 0.84 * Math.sqrt(E / Fy)
            ? "Eq. F9-17"
            : lambda <= 1.52 * Math.sqrt(E / Fy)
              ? "Eq. F9-18"
              : "Eq. F9-19",
        ),
      ]),
    );
  } else {
    const f = c.classification.elements[0]!,
      Sxc = req(s, "Ix") / req(s, "y");
    c.steps.push(step("Elastic modulus to compression flange", "S{xc}", Sxc, "modulus", "§F9.3(a)"));
    if (f.cls !== "compact") {
      const Mn =
        f.cls === "noncompact"
          ? Math.min(1.6 * My, Mp - (Mp - 0.7 * Fy * Sxc) * interpolate(f.lambda, f.lambdaP!, f.lambdaR))
          : (0.7 * E * Sxc) / f.lambda ** 2;
      c.limitStates.push(
        state("FLB", "Flange local buckling", Math.min(Mp, Mn), f.cls === "noncompact" ? "Eq. F9-14" : "Eq. F9-15"),
      );
    }
  }
  return finish(c, Mp, "§F9 Tees and double angles loaded in the plane of symmetry", Lp, Lr);
}

/** Nonmandatory Commentary F9 explicitly permits F6 yielding/local buckling
 * and C-F9-3 with F10-2/F10-3 for y-axis bending of tees and double angles. */
function teeMinorFlexure(s: Shape, m: Material, input: FlexureInput, c: FlexureContext, pair: boolean): FlexureResult {
  const { Fy } = m,
    { Lb } = input;
  const Sy = req(s, "Sy"),
    My = Fy * Sy,
    Mp = Math.min(Fy * req(s, "Zy"), 1.6 * My);
  const J = pair ? doubleAngleJ(s) : req(s, "J");
  const lambda = pair ? req(s, "b") / req(s, "t") : req(s, "bf") / (2 * req(s, "tf"));
  const lp = 0.38 * Math.sqrt(E / Fy),
    lr = Math.sqrt(E / Fy);
  c.warnings.push(
    "Minor-axis tee/double-angle bending uses nonmandatory Commentary F9 guidance: F6 yielding/local buckling, and C-F9-3 with F10-2/F10-3 for LTB. Loading is assumed to produce geometric y-axis bending without torsion.",
  );
  if (pair)
    c.warnings.push(
      "Double angles must be connected to act together; J is twice the matching single-angle database value.",
    );
  if (input.Cb !== undefined && input.Cb !== 1)
    c.warnings.push("Cb is not used in the Commentary C-F9-3 elastic critical moment.");
  c.steps.push(
    step("Geometric minor-axis elastic section modulus", "S{y}", Sy, "modulus", "§C-F9"),
    step("Flange slenderness for minor-axis bending", "b/t", lambda, "ratio", "§C-F9"),
    step("Saint-Venant torsional constant", "J", J, "torsion", "Eq. C-F9-3"),
  );
  c.limitStates.push(state("Y", "Yielding", Mp, "Eq. F6-1"));
  if (lambda > lp) {
    const Mn = lambda <= lr ? Mp - (Mp - 0.7 * My) * interpolate(lambda, lp, lr) : (0.7 * E * Sy) / lambda ** 2;
    c.limitStates.push(state("FLB", "Flange local buckling", Math.min(Mp, Mn), lambda <= lr ? "Eq. F6-2" : "Eq. F6-3"));
  }
  if (Lb > 0) {
    const Mcr = (Math.PI / Lb) * Math.sqrt(E * req(s, "Ix") * G * J);
    c.limitStates.push(
      state(
        "LTB",
        "Lateral-torsional buckling",
        Math.min(Mp, angleLtb(My, Mcr)),
        My / Mcr <= 1 ? "Eq. F10-2" : "Eq. F10-3",
        [
          step(
            "Elastic critical moment for minor-axis bending",
            "M{cr}",
            Mcr,
            "moment",
            "Eq. C-F9-3",
            "(π/L{b})√(EI{x}GJ)",
          ),
        ],
      ),
    );
  }
  return finish(c, Mp, "§C-F9 Minor-axis bending of tees and double angles (Commentary guidance)");
}

export function singleAngleFlexure(s: Shape, m: Material, input: FlexureInput, c: FlexureContext): FlexureResult {
  if (input.principalAxis) return principalAngleFlexure(s, m, input, c);
  const { Fy } = m,
    {
      axis,
      Lb,
      Cb = 1,
      continuousLateralRestraint = false,
      toeInCompression = true,
      restraintAtMaxMoment = false,
    } = input;
  const equal = req(s, "b") === req(s, "d"),
    restrained = continuousLateralRestraint || Lb === 0;
  if (!restrained && !equal)
    throw new UnsupportedError(
      "§F10 permits unrestrained geometric-axis bending only for equal-leg angles. For unequal-leg angles, set principalAxis: true after resolving the applied moments into w/z and use H2 for combined stresses; supply continuousLateralRestraint only when provided.",
    );
  // The AISC angle database's x-axis has the longer leg perpendicular to it;
  // b is the longer leg dimension even where d is the shorter dimension.
  const b = req(s, axis === "major" ? "b" : "d"),
    t = req(s, "t");
  const S = req(s, axis === "major" ? "Sx" : "Sy");
  const Sc = S * (restrained || restraintAtMaxMoment ? 1 : 0.8),
    My = Fy * Sc,
    Mp = 1.5 * My;
  c.warnings.push(
    "F10 uses geometric x/y axes parallel to the legs (major selects database Sx). No axial force is included; combined principal-axis stresses require §H2.",
  );
  c.warnings.push(
    restrained
      ? "Continuous lateral-torsional restraint is assumed for geometric-axis design; Lb = 0 also denotes full restraint."
      : `Equal-leg geometric-axis bending with ${toeInCompression ? "maximum compression" : "maximum tension"} at the toe; ${restraintAtMaxMoment ? "restraint at maximum moment" : "no lateral-torsional restraint and the 0.80 section-modulus reduction"} is assumed.`,
  );
  c.steps.push(
    step("Yield moment", "M{y}", My, "moment", "§F10.2(2)", "F{y}S{c}"),
    step("Effective geometric elastic modulus", "S{c}", Sc, "modulus", "§F10.3"),
  );
  c.limitStates.push(state("Y", "Yielding", Mp, "Eq. F10-1"));
  if (!restrained) {
    const x = 0.88 * ((Lb * t) / b ** 2) ** 2,
      root = Math.sqrt(1 + x);
    const bracket = toeInCompression ? x / (root + 1) : root + 1;
    const Mcr = ((0.58 * E * b ** 4 * t * Cb) / Lb ** 2) * bracket * (restraintAtMaxMoment ? 1.25 : 1);
    const Mn = angleLtb(My, Mcr);
    c.limitStates.push(
      state("LTB", "Lateral-torsional buckling", Mn, My / Mcr <= 1 ? "Eq. F10-2" : "Eq. F10-3", [
        step("Elastic critical moment", "M{cr}", Mcr, "moment", toeInCompression ? "Eq. F10-5a" : "Eq. F10-5b"),
      ]),
    );
  }
  if (toeInCompression) legLocal(c, b / t, Fy, Sc, "LLB", "Leg local buckling");
  else if (restrained) {
    // With constrained geometric-axis bending the two leg toes have opposite
    // stress signs (Commentary F10). Reversing the moment compresses the leg
    // parallel to the bending axis, at the modulus to that compression face.
    const parallelLeg = req(s, axis === "major" ? "d" : "b");
    const compressionSc = req(s, axis === "major" ? "Ix" : "Iy") / req(s, axis === "major" ? "y" : "x");
    legLocal(c, parallelLeg / t, Fy, compressionSc, "LLB", "Parallel-leg local buckling");
  }
  return finish(c, Mp, "§F10 Single angles — geometric-axis bending");
}

/** Principal w/z axes; moduli at all three database points avoid a heel/toe omission. */
function principalAngleFlexure(s: Shape, m: Material, input: FlexureInput, c: FlexureContext): FlexureResult {
  const major = input.axis === "major",
    prefix = major ? "Sw" : "Sz";
  const moduli = ["A", "B", "C"].map((p) => req(s, prefix + p));
  const S = Math.min(...moduli),
    My = m.Fy * S,
    Mp = 1.5 * My;
  const b = req(s, "b"),
    d = req(s, "d"),
    t = req(s, "t");
  c.steps = c.steps.filter((x) => !x.label.includes("geometric"));
  c.steps.push(
    ...moduli.map((v, i) =>
      step(
        `Principal modulus at point ${["A", "B", "C"][i]}`,
        `${prefix}{${["A", "B", "C"][i]}}`,
        v,
        "modulus",
        "§F10 / Shapes Database v16.0",
      ),
    ),
  );
  c.limitStates.push(state("Y", "Principal-axis yielding", Mp, "Eq. F10-1"));
  if (major && input.Lb > 0 && !input.continuousLateralRestraint) {
    const table: Record<string, number> = {
      "8/6": 3.31,
      "8/4": 5.48,
      "7/4": 4.37,
      "6/4": 3.14,
      "6/3.5": 3.69,
      "5/3.5": 2.4,
      "5/3": 2.99,
      "4/3.5": 0.87,
      "4/3": 1.65,
      "3.5/3": 0.87,
      "3.5/2.5": 1.62,
      "3/2.5": 0.86,
      "3/2": 1.56,
      "2.5/2": 0.85,
      "2.5/1.5": 1.49,
    };
    const magnitude = input.betaW ?? (b === d ? 0 : table[`${Math.max(b, d)}/${Math.min(b, d)}`]);
    if (magnitude === undefined)
      throw new UnsupportedError("Supply betaW for this angle size (Commentary Table C-F10.1).");
    if (!Number.isFinite(magnitude) || magnitude < 0)
      throw new RangeError("betaW must be a nonnegative finite magnitude");
    const beta = (input.shortLegInCompression ? 1 : -1) * magnitude;
    const rz = req(s, "rz"),
      B = (4.4 * beta * rz) / (input.Lb * t);
    const bracket = B < 0 ? 1 / (Math.sqrt(1 + B * B) - B) : Math.sqrt(1 + B * B) + B;
    const Mcr = (((9 / 8) * E * req(s, "A") * rz * t * Math.min(input.Cb ?? 1, 1.5)) / input.Lb) * bracket;
    c.limitStates.push(
      state(
        "LTB",
        "Principal w-axis lateral-torsional buckling",
        angleLtb(My, Mcr),
        My / Mcr <= 1 ? "Eq. F10-2" : "Eq. F10-3",
        [
          step("Signed monosymmetry parameter", "β{w}", beta, "length", "Table C-F10.1"),
          step("Elastic critical moment", "M{cr}", Mcr, "moment", "Eq. F10-4"),
        ],
      ),
    );
  }
  // Conservative local envelope: both legs and all critical-point moduli, regardless of moment sense.
  legLocal(c, Math.max(b, d) / t, m.Fy, S, "LLB", "Leg local buckling (conservative both-leg envelope)");
  c.warnings.push(
    "Principal axes: major = w, minor = z. Resolve applied moments into w/z and evaluate signed point stresses under H2. Local buckling conservatively envelopes both legs; z-axis LTB does not apply. βw is negative unless short-leg compression throughout is explicitly selected.",
  );
  return finish(c, Mp, "§F10 Single angles — principal-axis bending");
}
