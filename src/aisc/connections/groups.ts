/** Eccentric in-plane groups — AISC Manual Parts 7 and 8; kip, in., ksi.
 * angle is measured from downward vertical toward +x; positive ex offsets the load toward its right normal.
 * Weld C convention: Rn = C (FEXX/70) D l, where D = w/(1/16) and l = longest segment.
 * Thus C includes the NOMINAL E70 strength per unit weld size. Apply phi=.75 or omega=2 externally.
 */
import type { BoltCoord, EccentricBoltGroupInput, EccentricGroupResult, EccentricWeldGroupInput } from "./types";
import { nonnegative, positive } from "./result";
import { solveEquilibrium } from "./ic-solver";

interface Element extends BoltCoord {
  weight: number;
  tx?: number;
  ty?: number;
}
export interface GroupForce extends BoltCoord {
  fx: number;
  fy: number;
}
export interface GroupAnalysis extends EccentricGroupResult {
  centroid: BoltCoord;
  /** Force components per unit single-bolt nominal strength, or per unit longitudinal weld strength per inch. */
  forces: GroupForce[];
  equilibriumError: number;
  /** Welds only: reference l, longest input segment, in. */
  referenceLength?: number;
  /** Welds only: equivalent longitudinal weld length, in. */
  effectiveLength?: number;
}
const rad = Math.PI / 180;
function geometry(elements: Element[]) {
  if (!elements.length) throw new RangeError("Provide at least one bolt or nonzero weld segment");
  if (elements.length > 20000) throw new RangeError("Group exceeds the supported 20,000 elements");
  for (const p of elements) if (!Number.isFinite(p.x + p.y)) throw new RangeError("Coordinates must be finite");
  const weight = elements.reduce((s, p) => s + p.weight, 0);
  const centroid = {
    x: elements.reduce((s, p) => s + p.x * p.weight, 0) / weight,
    y: elements.reduce((s, p) => s + p.y * p.weight, 0) / weight,
  };
  const local = elements.map((p) => ({ ...p, x: p.x - centroid.x, y: p.y - centroid.y }));
  const J = local.reduce((s, p) => s + p.weight * (p.x * p.x + p.y * p.y), 0);
  const L = Math.max(...local.map((p) => Math.hypot(p.x, p.y)), 1e-6);
  return { weight, centroid, local, J, L };
}
function angleDirection(angle: number) {
  if (!Number.isFinite(angle)) throw new RangeError("Load angle must be finite");
  return { x: Math.sin(angle * rad), y: -Math.cos(angle * rad) };
}
/** Lesik–Kennedy directional law; uniform weld leg cancels from normalized deformations. */
function weldLaw(theta: number, delta: number) {
  const dm = 0.209 * (theta + 2) ** -0.32,
    p = delta / dm;
  return (1 + 0.5 * Math.sin(theta * rad) ** 1.5) * Math.min(1, Math.max(0, p * (1.9 - 0.9 * p)) ** 0.3);
}
function analyze(
  elements: Element[],
  ex: number,
  angle: number,
  method: "IC" | "elastic",
  weld: boolean,
): GroupAnalysis {
  if (!Number.isFinite(ex)) throw new RangeError("Eccentricity must be finite");
  const { weight, centroid, local, J, L } = geometry(elements),
    dir = angleDirection(angle),
    normal = { x: -dir.y, y: dir.x };
  const ref = weld ? "Manual Part 8" : "Manual Part 7";
  if (Math.abs(ex) > 1e-10 && J < 1e-16) throw new RangeError("Coincident points cannot resist an eccentric moment");
  let ic: BoltCoord | undefined,
    forces: GroupForce[],
    C: number,
    equilibriumError = 0;
  if (!weld && method === "IC" && Math.abs(ex) < 1e-12) {
    C = weight;
    forces = local.map((p) => ({ x: p.x, y: p.y, fx: p.weight * dir.x, fy: p.weight * dir.y }));
  } else if (
    weld &&
    method === "IC" &&
    Math.abs(ex) < 1e-10 &&
    local.every((p) => Math.abs(p.tx! * local[0]!.ty! - p.ty! * local[0]!.tx!) < 1e-10)
  ) {
    const theta = Math.acos(Math.min(1, Math.abs(dir.x * local[0]!.tx! + dir.y * local[0]!.ty!)));
    const kds = 1 + 0.5 * Math.sin(theta) ** 1.5;
    C = weight * kds;
    forces = local.map((p) => ({ x: p.x, y: p.y, fx: p.weight * kds * dir.x, fy: p.weight * kds * dir.y }));
  } else if (method === "elastic") {
    const unit = local.map((p) => ({
      x: p.x,
      y: p.y,
      fx: dir.x / weight + (J > 0 ? (ex * p.y) / J : 0),
      fy: dir.y / weight - (J > 0 ? (ex * p.x) / J : 0),
    }));
    C = 1 / Math.max(...unit.map((p) => Math.hypot(p.fx, p.fy)));
    forces = unit.map((p, i) => ({ ...p, fx: p.fx * C * local[i]!.weight, fy: p.fy * C * local[i]!.weight }));
  } else {
    const evaluate = (q: number, k: number) => {
      const velocities = local.map((p) => {
        const vx = dir.x + q * normal.x - (k * p.y) / L,
          vy = dir.y + q * normal.y + (k * p.x) / L,
          speed = Math.hypot(vx, vy);
        const theta =
          weld && speed > 1e-15 ? Math.acos(Math.min(1, Math.abs((vx * p.tx! + vy * p.ty!) / speed))) / rad : 0;
        return { vx, vy, speed, theta };
      });
      const maxSpeed = Math.max(...velocities.map((p) => p.speed));
      const rotation = weld
        ? Math.min(
            ...velocities
              .filter((v) => v.speed > 1e-15)
              .map((v) => Math.min(0.17, 1.087 * (v.theta + 6) ** -0.65) / v.speed),
          )
        : 0.34 / maxSpeed;
      const f = velocities.map((v, i) => {
        const p = local[i]!;
        const magnitude =
          p.weight * (weld ? weldLaw(v.theta, rotation * v.speed) : (1 - Math.exp(-10 * rotation * v.speed)) ** 0.55);
        return {
          x: p.x,
          y: p.y,
          fx: v.speed > 1e-15 ? (magnitude * v.vx) / v.speed : 0,
          fy: v.speed > 1e-15 ? (magnitude * v.vy) / v.speed : 0,
        };
      });
      const sx = f.reduce((s, p) => s + p.fx, 0),
        sy = f.reduce((s, p) => s + p.fy, 0),
        parallel = sx * dir.x + sy * dir.y;
      const moment = f.reduce((s, p) => s + p.x * p.fy - p.y * p.fx, 0);
      return {
        f,
        parallel,
        residual: [(sx * normal.x + sy * normal.y) / weight, (moment + ex * parallel) / (weight * L)] as const,
      };
    };
    const guess = J > 0 ? (-ex * weight * L) / J : 0;
    const seeds: (readonly [number, number])[] = [
      [0, guess],
      [0, 0],
      [0, -Math.sign(ex || 1)],
      [0.5, guess],
      [-0.5, guess],
      [0, guess * 4],
      [0, guess / 4],
    ];
    const [q, k] = solveEquilibrium((q, k) => evaluate(q, k).residual, seeds);
    const solved = evaluate(q, k);
    C = solved.parallel;
    forces = solved.f;
    equilibriumError = Math.hypot(...solved.residual);
    if (!(C > 0)) throw new RangeError("Group equilibrium produced no positive load capacity");
    if (Math.abs(k) > 1e-9) ic = { x: (-(dir.y + q * normal.y) * L) / k, y: ((dir.x + q * normal.x) * L) / k };
  }
  return {
    C,
    method,
    ic,
    ref,
    centroid,
    forces,
    equilibriumError,
    steps: [
      { label: "In-plane load eccentricity from centroid", symbol: "e", value: ex, quantity: "length", ref },
      {
        label: "Effective group coefficient",
        symbol: "C",
        value: C,
        quantity: weld ? "length" : "ratio",
        ref,
        note: weld
          ? "Intermediate equivalent longitudinal weld length; nominal weld coefficient is reported below."
          : method === "IC"
            ? "R/Rult = (1 − exp(−10Δ))^0.55 with Δmax = 0.34 in. Exact concentric loading uses C = bolt count."
            : "Maximum elastic vector force limits the group.",
      },
      ...(ic
        ? [
            { label: "IC x relative to centroid", value: ic.x, quantity: "length" as const, ref },
            { label: "IC y relative to centroid", value: ic.y, quantity: "length" as const, ref },
          ]
        : []),
      { label: "Normalized equilibrium residual", value: equilibriumError, quantity: "ratio", ref },
    ],
    warnings: weld
      ? [
          "Uniform weld size and in-plane loading only. Check effective lengths, base metal, and size limits separately. Elastic method omits directional enhancement.",
        ]
      : [
          "Uniform bolt strengths assumed. Use the least shear/bearing/tearout strength for every bolt; evaluate direction-dependent clear distances separately.",
        ],
  };
}
export function analyzeBoltGroup(input: EccentricBoltGroupInput): GroupAnalysis {
  if (input.bolts.some((p, i) => input.bolts.slice(0, i).some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-10)))
    throw new RangeError("Bolt coordinates must be distinct");
  return analyze(
    input.bolts.map((p) => ({ ...p, weight: 1 })),
    input.ex,
    input.angle ?? 0,
    input.method ?? "IC",
    false,
  );
}
export const eccentricBoltGroup = (input: EccentricBoltGroupInput): EccentricGroupResult => analyzeBoltGroup(input);

/** Midpoint quadrature. refinement is exposed for independent convergence tests. */
export function analyzeWeldGroup(input: EccentricWeldGroupInput, refinement = 120): GroupAnalysis {
  positive(input.FEXX ?? 70, "FEXX");
  if (!Number.isInteger(refinement) || refinement < 12 || refinement > 1000)
    throw new RangeError("Weld refinement must be an integer from 12 to 1000");
  if (!input.segments.length) throw new RangeError("Provide weld segments");
  const lengths = input.segments.map((s) => positive(Math.hypot(s.x2 - s.x1, s.y2 - s.y1), "Weld segment length"));
  const l = Math.max(...lengths),
    elements: Element[] = [];
  input.segments.forEach((s, i) => {
    for (const v of Object.values(s)) nonnegative(Math.abs(v), "Weld coordinate magnitude");
    const length = lengths[i]!,
      n = Math.max(12, Math.ceil((refinement * length) / l));
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n;
      elements.push({
        x: s.x1 + t * (s.x2 - s.x1),
        y: s.y1 + t * (s.y2 - s.y1),
        weight: length / n,
        tx: (s.x2 - s.x1) / length,
        ty: (s.y2 - s.y1) / length,
      });
    }
  });
  const result = analyze(elements, input.ex, input.angle ?? 0, input.method ?? "IC", true),
    effectiveLength = result.C;
  // Nominal E70 strength per inch per sixteenth; C1 = FEXX/70 is applied by the caller.
  const C = (((0.6 * 70 * 0.707) / 16) * effectiveLength) / l;
  return {
    ...result,
    C,
    referenceLength: l,
    effectiveLength,
    steps: [
      ...result.steps,
      { label: "Reference length (longest segment)", symbol: "l", value: l, quantity: "length", ref: "Manual Part 8" },
      {
        label: "Nominal weld coefficient",
        symbol: "C",
        value: C,
        quantity: "ratio",
        expr: "(0.60 × 70 × 0.707 / 16) L{effective}/l",
        ref: "Manual Part 8",
        note: "Rn = C C1 D l (kips), C1 = FEXX/70, D = weld size in sixteenths. LRFD: 0.75Rn; ASD: Rn/2. Coefficient uses nominal strength, not a pre-factored Manual table value.",
      },
    ],
  };
}
export const eccentricWeldGroup = (input: EccentricWeldGroupInput): EccentricGroupResult => analyzeWeldGroup(input);
