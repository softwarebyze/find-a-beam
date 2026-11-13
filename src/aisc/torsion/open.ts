/** Vlasov torsion, DG9 θ-function method. Total applied torque is kip-in for both cases.
 * Pinned torsional end: θ = θ'' = 0. Fixed end: θ = θ' = 0.
 * Both ends have the same condition. Linear-elastic, prismatic, small rotation. */
import { E, G, type Material } from "@/data/materials";
import { familyOf, num, req, type Shape } from "@/data/shapes";
import { UnsupportedError, type CalcStep, type DesignMethod } from "../types";
export interface OpenTorsionInput {
  T: number;
  L: number;
  load: "midspan" | "uniform";
  ends: "pinned" | "fixed";
  samples?: number;
}
export interface TorsionStation {
  x: number;
  theta: number;
  theta1: number;
  theta2: number;
  theta3: number;
  pureShearFlange: number;
  pureShearWeb: number;
  warpingShear: number;
  warpingShearWeb: number;
  warpingNormal: number;
}
const ratioC = (a: number, b: number) => (Math.exp(a - b) + Math.exp(-a - b)) / (1 + Math.exp(-2 * b));
const ratioS = (a: number, b: number) => (Math.exp(a - b) - Math.exp(-a - b)) / (1 + Math.exp(-2 * b));
const ss = (a: number, b: number) => (Math.exp(a - b) - Math.exp(-a - b)) / -Math.expm1(-2 * b);
const cs = (a: number, b: number) => (Math.exp(a - b) + Math.exp(-a - b)) / -Math.expm1(-2 * b);
export function openTorsion(
  shape: Shape,
  input: OpenTorsionInput,
): { stations: TorsionStation[]; k: number; steps: CalcStep[] } {
  if (!["i-shape", "channel"].includes(familyOf(shape)))
    throw new UnsupportedError(
      "DG9 automated stresses currently cover I-shapes and channels with DB warping properties",
    );
  const { T, L, load, ends, samples = 81 } = input;
  if (
    !Number.isFinite(T) ||
    !Number.isFinite(L) ||
    L <= 0 ||
    !Number.isInteger(samples) ||
    samples < 3 ||
    samples > 2001
  )
    throw new RangeError("Require finite torque, L > 0, and 3–2001 stations");
  const J = req(shape, "J"),
    Cw = req(shape, "Cw"),
    tf = req(shape, "tf"),
    tw = req(shape, "tw"),
    Wno = req(shape, "Wno"),
    Sw1 = req(shape, "Sw1");
  if (![J, Cw, tf, tw, Wno, Sw1].every((v) => Number.isFinite(v) && v > 0))
    throw new UnsupportedError("Positive J, Cw, tf, tw, Wno, Sw1 are required");
  const k = Math.sqrt((G * J) / (E * Cw)),
    l = L / 2,
    a = k * l;
  const xs = new Set(Array.from({ length: samples }, (_, i) => (i * L) / (samples - 1)));
  xs.add(l);
  if (load === "midspan" && ends === "fixed") {
    xs.add(L / 4);
    xs.add((3 * L) / 4);
  }
  if (load === "uniform" && ends === "fixed") {
    const sinhOverA = a < 500 ? Math.sinh(a) / a : Infinity;
    const z = Number.isFinite(sinhOverA) ? Math.acosh(Math.max(1, sinhOverA)) : a - Math.log(a);
    const peak = l - z / k;
    xs.add(peak);
    xs.add(L - peak);
  }
  const stations = [...xs]
    .sort((a, b) => a - b)
    .map((x) => {
      const xx = Math.min(x, L - x),
        s = l - xx,
        sign = x > l ? -1 : 1;
      let theta: number, v: number, v1: number, v2: number;
      if (load === "midspan") {
        const A = T / (2 * G * J);
        if (ends === "pinned") {
          const c = ratioC(k * xx, a),
            sh = ratioS(k * xx, a);
          theta = A * (xx - sh / k);
          v = A * (1 - c);
          v1 = -A * k * sh;
          v2 = -A * k * k * c;
        } else {
          const z = k * (xx - l / 2),
            b = a / 2,
            c = ratioC(z, b),
            sh = ratioS(z, b);
          theta = A * (xx - (sh + Math.tanh(b)) / k);
          v = A * (1 - c);
          v1 = -A * k * sh;
          v2 = -A * k * k * c;
        }
      } else {
        const A = T / (L * G * J);
        if (ends === "pinned") {
          const c = ratioC(k * s, a),
            sh = ratioS(k * s, a);
          theta = A * (l * xx - (xx * xx) / 2 - (1 - c) / (k * k));
          v = A * (s - sh / k);
          v1 = A * (-1 + c);
          v2 = -A * k * sh;
        } else {
          const c = cs(k * s, a),
            sh = ss(k * s, a);
          theta = A * (l * xx - (xx * xx) / 2 - (l * (cs(a, a) - c)) / k);
          v = A * (s - l * sh);
          v1 = A * (-1 + l * k * c);
          v2 = -A * l * k * k * sh;
        }
      }
      const theta1 = sign * v,
        theta2 = v1,
        theta3 = sign * v2;
      return {
        x,
        theta,
        theta1,
        theta2,
        theta3,
        pureShearFlange: G * tf * theta1,
        pureShearWeb: G * tw * theta1,
        warpingShear: ((-E * Math.max(Sw1, num(shape, "Sw2") ?? 0)) / tf) * theta3,
        warpingShearWeb: ((-E * (num(shape, "Sw3") ?? 0)) / tw) * theta3,
        warpingNormal: -E * Wno * theta2,
      };
    });
  return {
    stations,
    k,
    steps: [
      {
        label: "Saint-Venant torsional constant",
        symbol: "J",
        value: J,
        quantity: "torsion",
        ref: "DG9 §2 / Shapes Database v16.0",
      },
      {
        label: "Warping constant",
        symbol: "C{w}",
        value: Cw,
        quantity: "warping",
        ref: "DG9 §2 / Shapes Database v16.0",
      },
      {
        label: "Open-section torsion solution",
        ref: "AISC Design Guide 9, §§2–4",
        note: `ECw θ⁗ − GJ θ″ = m. ${load === "midspan" ? "Concentrated torque at midspan" : "Uniform torque T/L"}; ${ends === "pinned" ? "θ = θ″ = 0" : "θ = θ′ = 0"} at both ends. Warping shear = −E Sw1 θ‴/tf (channels also envelope Sw2/tf, Sw3/tw); normal = −E Wno θ″; pure shear = Gt θ′. Concentrated-load θ‴ is one-sided at midspan.`,
      },
    ],
  };
}
export interface OpenTorsionCheckInput extends OpenTorsionInput {
  P?: number;
  Mx?: number;
  My?: number;
  Vx?: number;
  Vy?: number;
  FcrNormal: number;
  FcrShear?: number;
  method?: DesignMethod;
}
export function openTorsionCheck(shape: Shape, mat: Material, input: OpenTorsionCheckInput) {
  const solution = openTorsion(shape, input),
    { method = "LRFD", FcrNormal, FcrShear = 0 } = input;
  for (const v of [input.P ?? 0, input.Mx ?? 0, input.My ?? 0, input.Vx ?? 0, input.Vy ?? 0])
    if (!Number.isFinite(v)) throw new RangeError("Applied forces and moments must be finite");
  if (![mat.Fy, FcrNormal, FcrShear].every((v) => Number.isFinite(v) && v > 0))
    throw new RangeError("Enter positive normal and shear buckling stresses determined by analysis (§H3.3(c))");
  const factor = method === "LRFD" ? 0.9 : 1 / 1.67;
  const normalCapacity = factor * Math.min(mat.Fy, FcrNormal),
    shearCapacity = factor * Math.min(0.6 * mat.Fy, FcrShear);
  const normal =
    Math.abs(input.P ?? 0) / req(shape, "A") +
    Math.abs(input.Mx ?? 0) / req(shape, "Sx") +
    Math.abs(input.My ?? 0) / req(shape, "Sy");
  const shearFlange =
    (Math.abs(input.Vy ?? 0) * req(shape, "Qf")) / (req(shape, "Ix") * req(shape, "tf")) +
    (1.5 * Math.abs(input.Vx ?? 0)) / (req(shape, "bf") * req(shape, "tf"));
  const shearWeb = (Math.abs(input.Vy ?? 0) * req(shape, "Qw")) / (req(shape, "Ix") * req(shape, "tw"));
  const checks = solution.stations.map((s) => ({
    x: s.x,
    normal: normal + Math.abs(s.warpingNormal),
    shear: Math.max(
      shearFlange + Math.abs(s.pureShearFlange) + Math.abs(s.warpingShear),
      shearWeb + Math.abs(s.pureShearWeb) + Math.abs(s.warpingShearWeb),
    ),
  }));
  const maxNormal = Math.max(...checks.map((c) => c.normal)),
    maxShear = Math.max(
      shearFlange +
        Math.max(...solution.stations.map((s) => Math.abs(s.pureShearFlange))) +
        Math.max(...solution.stations.map((s) => Math.abs(s.warpingShear))),
      shearWeb +
        Math.max(...solution.stations.map((s) => Math.abs(s.pureShearWeb))) +
        Math.max(...solution.stations.map((s) => Math.abs(s.warpingShearWeb))),
    );
  const ratio = Math.max(maxNormal / normalCapacity, maxShear / shearCapacity);
  const steps: CalcStep[] = [
    ...solution.steps,
    {
      label: "Normal-stress conservative envelope",
      value: maxNormal,
      quantity: "stress",
      ref: "Eq. H3-7",
      note: "Absolute axial, biaxial bending and warping maxima are added. This bounds signed same-point stresses conservatively.",
    },
    {
      label: "Shear-stress conservative envelope",
      value: maxShear,
      quantity: "stress",
      ref: "Eq. H3-8",
      note: "Major shear uses Qf/Ix/tf and Qw/Ix/tw. Minor shear is conservatively assigned to one flange (1.5Vx/bf/tf); spatial maxima of pure and warping shear are added.",
    },
    {
      label: "Available normal stress including buckling",
      value: normalCapacity,
      quantity: "stress",
      ref: "Eqs. H3-7, H3-9",
    },
    {
      label: "Available shear stress including buckling",
      value: shearCapacity,
      quantity: "stress",
      ref: "Eqs. H3-8, H3-9",
    },
    {
      label: "Governing normal / shear utilization",
      value: ratio,
      quantity: "ratio",
      ref: "§H3.3",
      note: "Buckling stress is an analysis input; this elastic torsion solution does not calculate torsional buckling or local connection effects.",
    },
  ];
  return { ...solution, ratio, normalRatio: maxNormal / normalCapacity, shearRatio: maxShear / shearCapacity, steps };
}
