/** ANSI/AISC 360-22 §J10. Engine units: kip, in., ksi, kip-in. */
import { available } from "../common";
import { flexuralBucklingFcr } from "../compression";
import { UnsupportedError, type CalcStep, type DesignMethod, type LimitState } from "../types";
import { E, type Material } from "@/data/materials";
import { familyOf, num, req, type Shape } from "@/data/shapes";
import type { ConnectionResult } from "./types";

export interface ConnectionCheck {
  /** Boolean detailing gate, displayed without fictitious force units. */
  detailing?: boolean;
  id: string;
  label: string;
  demand: number;
  result: ConnectionResult;
  capacity: number;
  ratio: number;
}
export function connectionResult(
  id: string,
  name: string,
  nominal: number,
  phi: number,
  omega: number,
  ref: string,
  expr: string,
  steps: CalcStep[] = [],
): ConnectionResult {
  const ls: LimitState = {
    id,
    name,
    nominal: Math.max(0, nominal),
    phi,
    omega,
    ref,
    steps: [...steps, { label: name, symbol: "R{n}", expr, value: Math.max(0, nominal), quantity: "force", ref }],
  };
  return {
    kind: "connection",
    quantity: "force",
    nominal: ls.nominal,
    phi,
    omega,
    governing: id,
    limitStates: [ls],
    section: ref,
    steps: [],
    warnings: [],
  };
}
export function connectionCheck(
  id: string,
  label: string,
  demand: number,
  result: ConnectionResult,
  method: DesignMethod,
): ConnectionCheck {
  const capacity = available(result, method);
  return { id, label, demand, result, capacity, ratio: demand === 0 ? 0 : capacity > 0 ? demand / capacity : Infinity };
}
export function positiveInputs(values: Record<string, number>, zero = false) {
  for (const [key, value] of Object.entries(values))
    if (!Number.isFinite(value) || (zero ? value < 0 : value <= 0))
      throw new Error(`${key} must be ${zero ? "nonnegative" : "positive"} and finite.`);
}
export interface ConcentratedForceInput {
  force: number;
  bearingLength: number;
  endDistance: number;
  method?: DesignMethod;
  /** single compression, single tension, or tension/compression couple on one flange */
  loading?: "compression" | "tension" | "couple";
  loadedWidth?: number;
  Lb?: number;
  Mr?: number;
  lateralMovementRestrained?: boolean;
  flangeRotationRestrained?: boolean;
  oppositeCompression?: boolean;
  panelShear?: number;
  axialForce?: number;
  beamDepth?: number;
  frameStabilityConsidered?: boolean;
  unframedEnd?: boolean;
  endRotationRestrained?: boolean;
  deliveringThickness?: number;
  deliveringWidth?: number;
  stiffenerFy?: number;
}
export interface ReinforcementSizing {
  required: boolean;
  force: number;
  width: number;
  thickness: number;
  area: number;
  length: number;
  capacity: number;
  feasible: boolean;
  steps: CalcStep[];
}
export interface ConcentratedForceResult {
  checks: ConnectionCheck[];
  omitted: string[];
  warnings: string[];
  pass: boolean;
  ratio: number;
  stiffener: ReinforcementSizing;
  doubler: { required: boolean; thickness: number; shearDeficit: number; steps: CalcStep[] };
  h: number;
  k: number;
}
export function concentratedForces(
  shape: Shape,
  material: Material,
  input: ConcentratedForceInput,
): ConcentratedForceResult {
  if (familyOf(shape) !== "i-shape") throw new UnsupportedError("§J10 requires a rolled I-shape in this workbench.");
  const { force: P, bearingLength: lb, endDistance: a } = input;
  positiveInputs(
    {
      force: P,
      bearingLength: lb,
      endDistance: a,
      Mr: input.Mr ?? 0,
      axialForce: input.axialForce ?? 0,
      panelShear: input.panelShear ?? 0,
    },
    true,
  );
  positiveInputs({ Fy: material.Fy, Lb: input.Lb ?? 120, stiffenerFy: input.stiffenerFy ?? material.Fy });
  const d = req(shape, "d"),
    bf = req(shape, "bf"),
    tf = req(shape, "tf"),
    tw = req(shape, "tw"),
    k = req(shape, "kdes");
  const h = (num(shape, "h/tw") ?? (d - 2 * k) / tw) * tw,
    Fy = material.Fy,
    method = input.method ?? "LRFD";
  const checks: ConnectionCheck[] = [],
    omitted: string[] = [],
    warnings: string[] = [];
  const add = (
    id: string,
    label: string,
    rn: number,
    phi: number,
    omega: number,
    ref: string,
    expr: string,
    demand = P,
    steps: CalcStep[] = [],
  ) =>
    checks.push(
      connectionCheck(id, label, demand, connectionResult(id, label, rn, phi, omega, ref, expr, steps), method),
    );
  const load = input.loading ?? "compression",
    tension = load !== "compression",
    compression = load !== "tension";
  if (tension && (input.loadedWidth ?? bf) >= 0.15 * bf)
    add(
      "J10.1",
      "Flange local bending",
      6.25 * Fy * tf ** 2 * (a < 10 * tf ? 0.5 : 1),
      0.9,
      1.67,
      "Eq. J10-1",
      "6.25 F{y} t{f}² × end factor",
      P,
      [{ label: "End factor", value: a < 10 * tf ? 0.5 : 1, quantity: "ratio", ref: "§J10.1" }],
    );
  else omitted.push("J10.1: applies to tension with loaded width ≥ 0.15bf.");
  add(
    "J10.2",
    "Web local yielding",
    Fy * tw * ((a > d ? 5 : 2.5) * k + lb),
    1,
    1.5,
    a > d ? "Eq. J10-2" : "Eq. J10-3",
    "F{y} t{w} (C k + l{b})",
    P,
    [
      { label: "Design fillet distance k = kdes", value: k, quantity: "length", ref: "§J10.2" },
      { label: "Yielding spread coefficient C", value: a > d ? 5 : 2.5, quantity: "ratio", ref: "§J10.2" },
    ],
  );
  if (compression) {
    const interior = a >= d / 2,
      ratio = lb / d,
      coefficient = interior ? 0.8 : 0.4;
    const term = interior || ratio <= 0.2 ? 3 * ratio : 4 * ratio - 0.2;
    add(
      "J10.3",
      "Web local crippling",
      coefficient * tw ** 2 * (1 + term * (tw / tf) ** 1.5) * Math.sqrt((E * Fy * tf) / tw),
      0.75,
      2,
      interior ? "Eq. J10-4" : ratio <= 0.2 ? "Eq. J10-5a" : "Eq. J10-5b",
      "C t{w}² [1 + β(t{w}/t{f})^1.5] √(E F{y} t{f}/t{w})",
    );
    const r = h / tw / ((input.Lb ?? 120) / bf),
      restrained = input.flangeRotationRestrained ?? true;
    if (load === "compression" && !input.lateralMovementRestrained && r <= (restrained ? 2.3 : 1.7)) {
      const Cr = (method === "LRFD" ? 1 : 1.5) * (input.Mr ?? 0) < Fy * req(shape, "Sx") ? 960000 : 480000;
      add(
        "J10.4",
        "Web sidesway buckling",
        ((Cr * tw ** 3 * tf) / h ** 2) * ((restrained ? 1 : 0) + 0.4 * r ** 3),
        0.85,
        1.76,
        restrained ? "Eq. J10-6" : "Eq. J10-7",
        "C{r} t{w}³ t{f}/h² [rotation term + 0.4r³]",
        P,
        [
          { label: "Sidesway geometry ratio", value: r, quantity: "ratio", ref: "§J10.4" },
          { label: "Sidesway constant", value: Cr, quantity: "stress", ref: "§J10.4" },
        ],
      );
      if (!restrained)
        warnings.push(
          "If J10.4 fails, provide lateral bracing at BOTH flanges; stiffener sizing alone does not resolve unrestrained flange rotation.",
        );
    } else
      omitted.push(
        "J10.4: relative flange movement restrained, couple loading, or geometry outside its applicable range.",
      );
    if (input.oppositeCompression)
      add(
        "J10.5",
        "Web compression buckling",
        ((24 * tw ** 3 * Math.sqrt(E * Fy)) / h) * (a < d / 2 ? 0.5 : 1),
        0.9,
        1.67,
        "Eq. J10-8",
        "24 t{w}³ √(E F{y})/h × end factor",
      );
    else omitted.push("J10.5: requires opposed compression forces at both flanges.");
  } else omitted.push("J10.3–J10.5: compression is absent.");
  let panelReduction = 1;
  if (input.panelShear !== undefined) {
    const py = Fy * req(shape, "A"),
      axial = ((method === "LRFD" ? 1 : 1.6) * (input.axialForce ?? 0)) / py;
    const considered = input.frameStabilityConsidered ?? false;
    panelReduction = Math.max(0, considered ? (axial <= 0.75 ? 1 : 1.9 - 1.2 * axial) : axial <= 0.4 ? 1 : 1.4 - axial);
    const db = input.beamDepth ?? d;
    positiveInputs({ beamDepth: db });
    const rn = 0.6 * Fy * d * tw * (considered ? 1 + (3 * bf * tf ** 2) / (db * d * tw) : 1) * panelReduction;
    const ref = considered ? (axial <= 0.75 ? "Eq. J10-11" : "Eq. J10-12") : axial <= 0.4 ? "Eq. J10-9" : "Eq. J10-10";
    add(
      "J10.6",
      "Web panel-zone shear",
      rn,
      0.9,
      1.67,
      ref,
      "0.6 F{y} d{c} t{w} × flange contribution × axial reduction",
      input.panelShear,
      [
        { label: "Axial ratio αPr / Py", value: axial, quantity: "ratio", ref: "§J10.6" },
        { label: "Axial reduction", value: panelReduction, quantity: "ratio", ref },
      ],
    );
  } else omitted.push("J10.6: no panel-zone shear demand specified.");
  const unframed = !!input.unframedEnd && !input.endRotationRestrained;
  const local = checks.filter((c) => c.id !== "J10.6"),
    deficit = Math.max(0, ...local.map((c) => c.demand - c.capacity));
  const sfy = input.stiffenerFy ?? Fy,
    width = Math.max((bf - tw) / 2, (input.deliveringWidth ?? bf) / 3 - tw / 2);
  const minT = Math.max((input.deliveringThickness ?? tf) / 2, width / 16, compression ? width/(0.56*Math.sqrt(E/sfy)) : 0),
    effWeb = (a < d / 2 ? 12 : 25) * tw ** 2;
  let thickness = Math.ceil(minT * 16) / 16,
    capacity = 0;
  // J10.8: pair + effective web, KL = 0.75h. Weak-axis inertia includes the web strip conservatively.
  for (; thickness <= 8; thickness += 1 / 16) {
    const area = 2 * width * thickness + effWeb;
    const webWidth=effWeb/tw;
    const Iy = (2 * thickness * width ** 3) / 3 + (effWeb * tw ** 2) / 12;
    const Ix = 2*width*thickness**3/12 + tw*webWidth**3/12;
    const inertia = Math.min(Ix,Iy);
    const Fe = (Math.PI ** 2 * E) / ((0.75 * h) ** 2 / (inertia / area));
    const fcr = flexuralBucklingFcr(sfy, Fe);
    const yieldStress=(method === "LRFD" ? 0.9 : 1 / 1.67) * (compression ? fcr : sfy);
    const ruptureStress=(method === "LRFD" ? .75 : .5)*material.Fu;
    capacity = Math.min(yieldStress,ruptureStress)*2*width*thickness;
    if (capacity >= deficit) break;
  }
  const stiffener: ReinforcementSizing = {
    required: deficit > 0 || unframed,
    force: deficit,
    width,
    thickness,
    area: 2 * width * thickness,
    length: h,
    capacity,
    feasible: thickness <= 8,
    steps: [
      { label: "Force assigned to stiffener pair", value: deficit, quantity: "force", ref: "§J10" },
      { label: "Stiffener width each side", value: width, quantity: "length", ref: "§J10.8(a)" },
      {
        label: "Required stiffener thickness (rounded up 1/16 in.)",
        value: thickness,
        quantity: "length",
        ref: "§J10.8(b)",
      },
      { label: "Full-depth stiffener effective length", value: 0.75 * h, quantity: "length", ref: "§J10.8" },
      { label: "Effective web strip area", value: effWeb, quantity: "area", ref: "§J10.8" },
      {
        label: "Available stiffener-pair force (web capacity excluded)",
        value: capacity,
        quantity: "force",
        ref: "§J10.8; §E3; §J4.4",
      },
    ],
  };
  const panel = checks.find((c) => c.id === "J10.6"),
    shearDeficit = panel ? Math.max(0, panel.demand - panel.capacity) : 0;
  const shearFactor = method === "LRFD" ? 0.9 : 1 / 1.67;
  // Chapter G shear yield plus a non-slender plate limit; attachment remains required.
  const yieldT =
    shearDeficit > 0
      ? panelReduction > 0
        ? shearDeficit / (shearFactor * 0.6 * sfy * d * panelReduction)
        : Infinity
      : 0;
  const bucklingT = h / (1.1 * Math.sqrt((5.34 * E) / sfy));
  const doublerT = shearDeficit > 0 ? Math.ceil(Math.max(yieldT, bucklingT) * 16) / 16 : 0;
  const doubler = {
    required: shearDeficit > 0,
    thickness: doublerT,
    shearDeficit,
    steps: [
      { label: "Panel shear deficit", value: shearDeficit, quantity: "force" as const, ref: "§J10.6" },
      {
        label: "Required non-slender shear doubler thickness",
        value: doublerT,
        quantity: "length" as const,
        ref: "§J10.9; Eqs. G2-1, G2-3",
        note: "Rounded up 1/16 in.; h/t ≤ 1.1√(5.34E/Fy), Cv1 = 1; conservative unstiffened shear panel. Develop plate strength through welds.",
      },
    ],
  };
  if(!stiffener.feasible) warnings.push('No stiffener size found within the 8-in. thickness search bound; revise the member or restraint.');
  if(shearDeficit>0&&panelReduction===0) warnings.push('Column axial force eliminates panel-zone capacity in this model; no finite doubler size is available.');
  if (unframed)
    warnings.push(
      "§J10.7: full-depth transverse stiffener pair REQUIRED at the unrestrained unframed end, regardless of D/C.",
    );
  warnings.push(
    "Reinforcement sizing assumes unperforated stiffeners: detail flange/web welds for the force deficit and check fitted bearing. The doubler provided here resists panel shear; a doubler chosen instead of transverse stiffeners for local tension/compression requires Chapters D/E.",
  );
  if (input.oppositeCompression && lb / d >= 1)
    warnings.push(
      "Large bearing length relative to depth: evaluate the web as a compression member under Chapter E (Commentary J10.5).",
    );
  const ratio = Math.max(0, ...checks.map((c) => c.ratio));
  return { checks, omitted, warnings, pass: ratio <= 1 + 1e-9 && !unframed, ratio, stiffener, doubler, h, k };
}
export const evaluateConcentratedForces = concentratedForces;
