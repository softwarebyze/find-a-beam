/** Pin-connected plates and eyebars, AISC 360-22 §§D5, D6. */
import type { Material } from "@/data/materials";
import type { CalcStep, DesignMethod, LimitState, TensionResult } from "../types";
export interface DimensionalCheck {
  label: string;
  pass: boolean;
  ref: string;
}
export interface PinInput {
  t: number;
  width: number;
  pinDiameter: number;
  holeDiameter: number;
  a: number;
  centered?: boolean;
  relativeMovement?: boolean;
  Ag?: number;
  method?: DesignMethod;
}
export interface DetailedTensionResult extends TensionResult {
  dimensions: DimensionalCheck[];
  detailingPass: boolean;
}
function positive(v: Record<string, number>) {
  for (const [k, n] of Object.entries(v))
    if (!Number.isFinite(n) || n <= 0) throw new RangeError(`${k} must be positive and finite`);
}
function result(
  states: LimitState[],
  dimensions: DimensionalCheck[],
  steps: CalcStep[],
  method: DesignMethod,
  section: string,
): DetailedTensionResult {
  const gov = states.reduce((a, b) =>
    (method === "LRFD" ? a.phi! * a.nominal <= b.phi! * b.nominal : a.nominal / a.omega! <= b.nominal / b.omega!)
      ? a
      : b,
  );
  return {
    kind: "tension",
    quantity: "force",
    nominal: gov.nominal,
    phi: gov.phi!,
    omega: gov.omega!,
    governing: gov.id,
    limitStates: states,
    dimensions,
    detailingPass: dimensions.every((d) => d.pass),
    section,
    steps,
    warnings: dimensions
      .filter((d) => !d.pass)
      .map(
        (d) =>
          `${d.ref}: ${d.label} — dimensional requirement not satisfied; strength alone does not establish compliance.`,
      ),
  };
}
function state(
  id: string,
  name: string,
  nominal: number,
  phi: number,
  omega: number,
  ref: string,
  expr: string,
): LimitState {
  return {
    id,
    name,
    nominal,
    phi,
    omega,
    ref,
    steps: [{ label: name, symbol: "P{n}", value: nominal, quantity: "force", expr, ref }],
  };
}
export function pinConnectedStrength(mat: Material, input: PinInput): DetailedTensionResult {
  const { t, width, pinDiameter: d, holeDiameter: dh, a, method = "LRFD" } = input;
  positive({ t, width, d, dh, a, Fy: mat.Fy, Fu: mat.Fu });
  if (dh < d || dh >= width) throw new RangeError("Require pin diameter ≤ hole diameter < plate width");
  const be = Math.min(2 * t + 0.63, (width - dh) / 2),
    Asf = 2 * t * (a + d / 2),
    clearance = dh - d;
  if (clearance > 1 / 16 + 1e-10) throw new RangeError("D5 shear reduction Cr is not defined for clearance > 1/16 in.");
  const Cr = clearance <= 1 / 32 + 1e-10 ? 1 : 0.95,
    Ag = input.Ag ?? width * t;
  positive({ Ag });
  if (Ag > width * t) throw new RangeError("Body gross area cannot exceed the head plate area");
  return result(
    [
      state("TR", "Tensile rupture at pin", 2 * t * be * mat.Fu, 0.75, 2, "Eq. D5-1", "F{u}(2tb{e})"),
      state("SR", "Shear rupture beyond pin", 0.6 * Cr * mat.Fu * Asf, 0.75, 2, "Eq. D5-2", "0.6C{r}F{u}A{sf}"),
      state("BR", "Pin projected-area bearing", 1.8 * mat.Fy * d * t, 0.75, 2, "Eq. J7-1", "1.8F{y}dt"),
      state("TY", "Body gross section yielding", mat.Fy * Ag, 0.9, 1.67, "Eq. D2-1", "F{y}A{g}"),
    ],
    [
      { label: "Pin centered across member width", pass: input.centered === true, ref: "§D5.2(a)" },
      {
        label: "Movement clearance within permitted limit",
        pass: !input.relativeMovement || clearance <= (d < 3 ? 1 / 32 : 1 / 16) + 1e-10,
        ref: "§D5.2(b)",
      },
      { label: "Plate width ≥ 2be + d", pass: width >= 2 * be + d, ref: "§D5.2(c)" },
      { label: "End extension a ≥ 1.33be", pass: a >= 1.33 * be, ref: "§D5.2(c)" },
    ],
    [
      {
        label: "Effective transverse edge width",
        symbol: "b{e}",
        expr: "min(2t + 0.63, (w − d{h})/2)",
        value: be,
        quantity: "length",
        ref: "§D5.1",
      },
      { label: "Shear failure path area", symbol: "A{sf}", value: Asf, quantity: "area", ref: "Eq. D5-2" },
      { label: "Clearance reduction", symbol: "C{r}", value: Cr, quantity: "ratio", ref: "§D5.1(b)" },
    ],
    method,
    "§D5 Pin-connected members (plate checks; pin and connection design separate)",
  );
}
export interface EyebarInput {
  width: number;
  t: number;
  pinDiameter: number;
  holeDiameter: number;
  headDiameter: number;
  transitionRadius: number;
  uniformConcentricHead: boolean;
  snugNuts?: boolean;
  method?: DesignMethod;
}
export function eyebarStrength(mat: Material, input: EyebarInput): DetailedTensionResult {
  const {
    width: b,
    t,
    pinDiameter: d,
    holeDiameter: dh,
    headDiameter: D,
    transitionRadius: r,
    method = "LRFD",
  } = input;
  positive({ b, t, d, dh, D, r, Fy: mat.Fy, Fu: mat.Fu });
  if (dh < d || dh >= D) throw new RangeError("Require pin diameter ≤ hole diameter < head diameter");
  const effectiveWidth = Math.min(b, 8 * t),
    edge = (D - dh) / 2,
    An = 2 * Math.min(edge, 0.75 * effectiveWidth) * t;
  return result(
    [
      state("TY", "Body yielding", mat.Fy * effectiveWidth * t, 0.9, 1.67, "§D6.1 / Eq. D2-1", "F{y}A{g}"),
      state("TR", "Head net-section rupture", mat.Fu * An, 0.75, 2, "§D6.1 / Eq. D2-2", "F{u}A{n}"),
    ],
    [
      {
        label: "Uniform thickness, circular concentric unreinforced head",
        pass: input.uniformConcentricHead,
        ref: "§D6.2(a)",
      },
      { label: "Transition radius ≥ head diameter", pass: r >= D, ref: "§D6.2(b)" },
      { label: "Pin diameter ≥ 7/8 body width", pass: d >= (7 / 8) * b, ref: "§D6.2(c)" },
      { label: "Hole clearance ≤ 1/32 in.", pass: dh - d <= 1 / 32 + 1e-10, ref: "§D6.2(c)" },
      { label: "For Fy > 70 ksi, hole diameter ≤ 5t", pass: mat.Fy <= 70 || dh <= 5 * t, ref: "§D6.2(d)" },
      {
        label: "Thickness ≥ 1/2 in. or snug external nuts provided",
        pass: t >= 0.5 || !!input.snugNuts,
        ref: "§D6.2(e)",
      },
      { label: "Head transverse edge width > 2/3 body width", pass: edge > (2 / 3) * b, ref: "§D6.2(f)" },
    ],
    [
      {
        label: "Effective body area (width limited to 8t)",
        symbol: "A{g}",
        value: effectiveWidth * t,
        quantity: "area",
        ref: "§D6.1",
      },
      {
        label: "Effective head net area (edge width capped at 3b/4)",
        symbol: "A{n}",
        value: An,
        quantity: "area",
        ref: "§D6.2(f)",
      },
    ],
    method,
    "§D6 Eyebars",
  );
}
