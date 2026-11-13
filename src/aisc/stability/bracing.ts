/** AISC 360-22 Appendix 6. Required strengths are already LRFD/ASD load effects. */
import { E } from "@/data/materials";
import type { CalcStep, DesignMethod } from "../types";
export interface BracingResult {
  strength: number;
  stiffness: number;
  connectionStrength: number;
  phi: number;
  omega: number;
  steps: CalcStep[];
}
function check(values: Record<string, number>, zero: string[] = []) {
  for (const [k, v] of Object.entries(values))
    if (!Number.isFinite(v) || (zero.includes(k) ? v < 0 : v <= 0))
      throw new RangeError(`${k} must be finite and ${zero.includes(k) ? "nonnegative" : "positive"}`);
}
export function columnBracing(input: {
  Pr: number;
  Lbr: number;
  type: "point" | "panel";
  method?: DesignMethod;
}): BracingResult {
  const { Pr, Lbr, type, method = "LRFD" } = input;
  check({ Pr, Lbr }, ["Pr"]);
  const point = type === "point",
    strength = (point ? 0.01 : 0.005) * Pr;
  const stiffness = ((method === "LRFD" ? 1 / 0.75 : 2) * (point ? 8 : 2) * Pr) / Lbr;
  return {
    strength,
    stiffness,
    connectionStrength: 0.01 * Pr,
    phi: 0.75,
    omega: 2,
    steps: [
      {
        label: point ? "Point brace required force" : "Panel brace required shear",
        value: strength,
        quantity: "force",
        expr: point ? "0.01P{r}" : "0.005P{r}",
        ref: point ? "Eq. A-6-3" : "Eq. A-6-1",
      },
      {
        label: "Required stiffness × brace spacing",
        symbol: "β{br}L{br}",
        value: stiffness * Lbr,
        quantity: "force",
        expr: `${method === "LRFD" ? "1/φ" : "Ω"} × ${point ? 8 : 2}P{r}`,
        ref: `Eq. A-6-${point ? 4 : 2}${method === "LRFD" ? "a" : "b"}`,
      },
      {
        label: "Connection to member required force",
        value: 0.01 * Pr,
        quantity: "force",
        ref: "§6.2.1 / Eq. A-6-3",
        note: "Panel connection and panel flexibility act in series; use the larger adjacent Pr/Lbr for point braces.",
      },
    ],
  };
}
export function beamLateralBracing(input: {
  Mr: number;
  ho: number;
  Lbr: number;
  Cd?: number;
  type: "point" | "panel";
  method?: DesignMethod;
}): BracingResult {
  const { Mr, ho, Lbr, Cd = 1, type, method = "LRFD" } = input;
  check({ Mr, ho, Lbr, Cd }, ["Mr"]);
  if (Cd !== 1 && Cd !== 2) throw new RangeError("Cd must be 1 or 2 (brace nearest an inflection point)");
  const point = type === "point",
    strength = ((point ? 0.02 : 0.01) * Mr * Cd) / ho;
  const stiffness = ((method === "LRFD" ? 1 / 0.75 : 2) * (point ? 10 : 4) * Mr * Cd) / (Lbr * ho);
  return {
    strength,
    stiffness,
    connectionStrength: (0.02 * Mr * Cd) / ho,
    phi: 0.75,
    omega: 2,
    steps: [
      {
        label: "Required lateral brace force",
        expr: `${point ? "0.02" : "0.01"}M{r}C{d}/h{o}`,
        value: strength,
        quantity: "force",
        ref: `Eq. A-6-${point ? 7 : 5}`,
      },
      {
        label: "Required stiffness × brace spacing",
        symbol: "β{br}L{br}",
        value: stiffness * Lbr,
        quantity: "force",
        expr: `${method === "LRFD" ? "1/φ" : "Ω"} × ${point ? 10 : 4}M{r}C{d}/h{o}`,
        ref: `Eq. A-6-${point ? 8 : 6}${method === "LRFD" ? "a" : "b"}`,
      },
      {
        label: "Panel/point connection force",
        value: (0.02 * Mr * Cd) / ho,
        quantity: "force",
        ref: "§6.3.1 / Eq. A-6-7",
        note: "I-shaped beams, zero axial force; brace near compression flange, and both flanges near double-curvature inflection points.",
      },
    ],
  };
}
export interface TorsionalBracingInput {
  Mr: number;
  Cb?: number;
  L: number;
  Lbr: number;
  n: number;
  Iyeff: number;
  ho: number;
  tw: number;
  bs?: number;
  tst?: number;
  rigidWeb?: boolean;
  method?: DesignMethod;
}
export function beamTorsionalBracing(
  input: TorsionalBracingInput,
): BracingResult & { betaT: number; betaSec: number; minimumTst: number; effective: boolean } {
  const { Mr, Cb = 1, L, Lbr, n, Iyeff, ho, tw, bs = 0, tst = 0, rigidWeb = false, method = "LRFD" } = input;
  check({ Mr, Cb, L, Lbr, n, Iyeff, ho, tw, bs, tst }, ["Mr", "bs", "tst"]);
  if (!Number.isInteger(n)) throw new RangeError("n must be an integer");
  const ideal = ((3.6 * L) / (n * E * Iyeff)) * (Mr / Cb) ** 2;
  const betaT = (method === "LRFD" ? 1 / 0.75 : 3) * ideal;
  const betaSec = rigidWeb ? Infinity : ((3.3 * E) / ho) * ((ho * tw ** 3) / 12 + (tst * bs ** 3) / 12);
  const effective = betaSec > betaT;
  const stiffness = betaT === 0 ? 0 : effective ? betaT / (1 - betaT / betaSec) : Infinity;
  const strength = Math.max((ideal * Lbr) / (500 * ho), 0.02 * Mr);
  // Strict lower bound for effective distortion restraint, not a practical finite-stiffness target.
  const minimumTst = rigidWeb
    ? 0
    : bs > 0
      ? Math.max(0, ((12 * betaT * ho) / (3.3 * E) - ho * tw ** 3) / bs ** 3)
      : betaSec > betaT
        ? 0
        : Infinity;
  return {
    strength,
    stiffness,
    connectionStrength: strength,
    phi: 0.75,
    omega: 3,
    betaT,
    betaSec,
    minimumTst,
    effective,
    steps: [
      {
        label: "Required torsional brace moment",
        symbol: "M{br}",
        expr: "max[(3.6L/nEI{yeff})(M{r}/C{b})²L{br}/(500h{o}), 0.02M{r}]",
        value: strength,
        quantity: "moment",
        ref: "Eq. A-6-9",
      },
      {
        label: "Overall system stiffness (per radian)",
        symbol: "β{T}",
        value: betaT,
        quantity: "moment",
        ref: `Eq. A-6-11${method === "LRFD" ? "a" : "b"}`,
      },
      {
        label: "Section distortion stiffness (per radian)",
        symbol: "β{sec}",
        value: betaSec,
        quantity: "moment",
        expr: "(3.3E/h{o})(h{o}t{w}³/12 + t{st}b{s}³/12)",
        ref: "Eq. A-6-12",
      },
      {
        label: "Required brace stiffness (per radian)",
        symbol: "β{br}",
        value: stiffness,
        quantity: "moment",
        expr: "β{T}/(1 − β{T}/β{sec})",
        ref: "Eq. A-6-10",
        note: effective
          ? "Include connection flexibility. Full-depth stiffeners; bs is total effective width for a pair."
          : "Ineffective: βsec must exceed βT. Add web stiffeners or provide a diaphragm restraining both flanges.",
      },
      {
        label: "Stiffener thickness must exceed this lower bound",
        symbol: "t{st,min}",
        value: minimumTst,
        quantity: "length",
        ref: "Eq. A-6-12 (rearranged)",
        note: "Select a larger thickness and recalculate finite required brace stiffness; also check stiffener and connection strength.",
      },
    ],
  };
}
