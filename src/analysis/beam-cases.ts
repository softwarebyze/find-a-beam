/** Manual Table 3-23, elastic prismatic beams. Units: kip, in, ksi.
 * Downward loads/deflections positive, sagging moment positive, upward reactions positive.
 * Euler–Bernoulli bending only: Δ'' = -M/EI; no shear deformation or support settlement.
 * L is the TOTAL beam length, including overhang / both continuous spans.
 */
import type { Quantity } from "@/lib/units";
export type SupportKind = "simple" | "cantilever" | "fixed-fixed" | "propped" | "overhang" | "continuous";
export interface Support {
  x: number;
  fixed?: boolean;
}
export interface PointLoad {
  x: number;
  P: number;
}
export interface DistributedLoad {
  start: number;
  end: number;
  wStart: number;
  wEnd: number;
}
export interface BeamLoading {
  L: number;
  supports: Support[];
  points: PointLoad[];
  distributed: DistributedLoad[];
  E: number;
  I: number;
}
export interface Extreme {
  value: number;
  x: number;
}
export interface BeamFormulas {
  R: string;
  Vmax: string;
  Mmax: string;
  deltaMax: string;
  definitions?: string;
  V?: string;
  M?: string;
  delta?: string;
}
export interface BeamResult {
  L: number;
  loading: BeamLoading;
  reactions: { x: number; force: number; moment: number }[];
  V: (x: number) => number;
  M: (x: number) => number;
  delta: (x: number) => number;
  slope: (x: number) => number;
  max: { V: Extreme; M: Extreme; delta: Extreme };
  breaks: number[];
  formulas: BeamFormulas;
}
export interface BeamParameters {
  L: number;
  w: number;
  P: number;
  P2: number;
  a: number;
  b: number;
  E: number;
  I: number;
}
export interface Parameter {
  key: keyof BeamParameters;
  label: string;
  quantity: Quantity;
}
export interface BeamCase {
  id: string;
  name: string;
  support: SupportKind;
  parameters: Parameter[];
  solve: (p: BeamParameters) => BeamResult;
}
interface Term {
  c: number;
  a: number;
  n: number;
}
const bracket = (t: number, a: number, n: number) => (t < a ? 0 : n === 0 ? 1 : (t - a) ** n);
function evaluate(terms: Term[], t: number, integral = 0): number {
  return terms.reduce((s, q) => {
    let c = q.c;
    for (let i = 1; i <= integral; i++) c /= q.n + i;
    return s + c * bracket(t, q.a, q.n + integral);
  }, 0);
}
function solveLinear(matrix: number[][], rhs: number[]): number[] {
  const a = matrix.map((r, i) => [...r, rhs[i]!]);
  const n = a.length;
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(a[i]![k]!) > Math.abs(a[pivot]![k]!)) pivot = i;
    [a[k], a[pivot]] = [a[pivot]!, a[k]!];
    const v = a[k]![k]!;
    if (Math.abs(v) < 1e-13) throw new Error("Unstable or degenerate beam supports.");
    for (let j = k; j <= n; j++) a[k]![j] = a[k]![j]! / v;
    for (let i = 0; i < n; i++)
      if (i !== k) {
        const f = a[i]![k]!;
        for (let j = k; j <= n; j++) a[i]![j] = a[i]![j]! - f * a[k]![j]!;
      }
  }
  return a.map((r) => r[n]!);
}
/** Absolute maximum, retaining its sign. Include both sides of every discontinuity. */
export function extreme(
  fn: (x: number) => number,
  L: number,
  breaks: number[],
  derivative?: (x: number) => number,
): Extreme {
  const candidates = breaks.flatMap((x) => [x, Math.max(0, x - L * 1e-10), Math.min(L, x + L * 1e-10)]);
  for (let j = 0; j < breaks.length - 1; j++) {
    const a = breaks[j]!,
      b = breaks[j + 1]!;
    for (let i = 0; i < 24; i++) {
      let lo = a + ((b - a) * (i + 1e-8)) / 24,
        hi = a + ((b - a) * (i + 1 - 1e-8)) / 24;
      if (derivative && derivative(lo) * derivative(hi) < 0) {
        const sign = derivative(lo);
        for (let k = 0; k < 38; k++) {
          const m = (lo + hi) / 2;
          if (sign * derivative(m) > 0) lo = m;
          else hi = m;
        }
        candidates.push((lo + hi) / 2);
      }
      candidates.push(a + ((b - a) * i) / 24);
    }
  }
  return candidates
    .map((x) => ({ x, value: fn(x) }))
    .reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a), { x: 0, value: 0 });
}
/** Isolate all real roots of a polynomial on [0,1] through its derivative roots.
 * This catches closely spaced extrema that a sampling grid can miss. */
function polynomialRoots(coefficients: number[]): number[] {
  const c = [...coefficients],
    scale = Math.max(...c.map(Math.abs), 1e-100);
  while (c.length > 1 && Math.abs(c.at(-1)!) < scale * 1e-13) c.pop();
  if (c.length <= 1) return [];
  const fn = (x: number) => c.reduceRight((v, a) => v * x + a, 0);
  const critical = polynomialRoots(c.slice(1).map((a, i) => a * (i + 1)));
  const boundaries = [0, ...critical, 1],
    roots = boundaries.filter((x) => Math.abs(fn(x)) < scale * 1e-12);
  for (let i = 0; i < boundaries.length - 1; i++) {
    let lo = boundaries[i]!,
      hi = boundaries[i + 1]!;
    const sign = fn(lo);
    if (sign * fn(hi) >= 0) continue;
    for (let j = 0; j < 45; j++) {
      const mid = (lo + hi) / 2;
      if (sign * fn(mid) > 0) lo = mid;
      else hi = mid;
    }
    roots.push((lo + hi) / 2);
  }
  return [...new Set(roots)].filter((x) => x > 1e-12 && x < 1 - 1e-12).sort((a, b) => a - b);
}
const differentiated = (terms: Term[]): Term[] =>
  terms.filter((t) => t.n > 0).map((t) => ({ ...t, c: t.c * t.n, n: t.n - 1 }));
function polynomialExtreme(fn: (x: number) => number, L: number, breaks: number[], derivative: Term[]): Extreme {
  const candidates = breaks.flatMap((x) => [x, Math.max(0, x - L * 1e-10), Math.min(L, x + L * 1e-10)]);
  for (let i = 0; i < breaks.length - 1; i++) {
    const start = breaks[i]! / L,
      h = (breaks[i + 1]! - breaks[i]!) / L,
      coefficients = [0, 0, 0, 0, 0];
    for (const t of derivative)
      if (t.a <= start + h / 2) {
        let choose = 1;
        for (let k = 0; k <= t.n; k++) {
          coefficients[k] = coefficients[k]! + t.c * choose * (start - t.a) ** (t.n - k) * h ** k;
          choose *= (t.n - k) / (k + 1);
        }
      }
    for (const root of polynomialRoots(coefficients)) candidates.push((start + h * root) * L);
  }
  return candidates
    .map((x) => ({ x, value: fn(x) }))
    .reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a), { x: 0, value: 0 });
}
export function supportsFor(kind: SupportKind, L: number, overhang = L / 4): Support[] {
  switch (kind) {
    case "simple":
      return [{ x: 0 }, { x: L }];
    case "cantilever":
      return [{ x: 0, fixed: true }];
    case "fixed-fixed":
      return [
        { x: 0, fixed: true },
        { x: L, fixed: true },
      ];
    case "propped":
      return [{ x: 0, fixed: true }, { x: L }];
    case "overhang":
      return [{ x: 0 }, { x: L - overhang }];
    case "continuous":
      return [{ x: 0 }, { x: L / 2 }, { x: L }];
  }
}
const generalFormulas = {
  R: "ΣR = ∫w dx + ΣP; Σ(Rx + C) = ∫wx dx + ΣPa",
  Vmax: "V(x) = ΣR{j}H(x − x{j}) − ∫₀ˣw(s)ds − ΣP{j}H(x − a{j}); V{max} = max|V(x)|",
  Mmax: "M(x) = ΣR{j}⟨x − x{j}⟩ − ΣC{j}H(x − x{j}) − ∫₀ˣw(s)(x − s)ds − ΣP{j}⟨x − a{j}⟩; M{max} = max|M(x)|",
  deltaMax: "Δ(x) = −∫∫M(x)/(EI) dx dx + c{1}x + c{0}; Δ{max} = max|Δ(x)|",
};
/** Exact singularity-function integration; solve equilibrium and support compatibility. */
export function analyzeBeam(loading: BeamLoading, formulas: BeamFormulas = generalFormulas): BeamResult {
  const { L, E, I, supports, points, distributed } = loading;
  if (![L, E, I].every((v) => Number.isFinite(v) && v > 0)) throw new Error("L, E and I must be positive.");
  if (
    !supports.length ||
    [...supports.map((s) => s.x), ...points.map((p) => p.x)].some((x) => !Number.isFinite(x) || x < 0 || x > L)
  )
    throw new Error("Support/load positions must lie on the beam.");
  const loads: Term[] = points.map((p) => ({ c: -p.P, a: p.x / L, n: 1 }));
  let total = points.reduce((s, p) => s + p.P, 0),
    first = points.reduce((s, p) => s + (p.P * p.x) / L, 0);
  for (const q of distributed) {
    if (!(q.end > q.start && q.start >= 0 && q.end <= L) || ![q.wStart, q.wEnd].every(Number.isFinite))
      throw new Error("Distributed load bounds are invalid.");
    const a = q.start / L,
      b = q.end / L,
      w = q.wStart * L,
      wb = q.wEnd * L,
      k = (wb - w) / (b - a);
    loads.push({ c: -w / 2, a, n: 2 }, { c: -k / 6, a, n: 3 }, { c: wb / 2, a: b, n: 2 }, { c: k / 6, a: b, n: 3 });
    total += ((w + wb) * (b - a)) / 2;
    first += (a * (w + wb) * (b - a)) / 2 + (b - a) ** 2 * (w / 2 + (wb - w) / 3);
  }
  if (points.some((p) => !Number.isFinite(p.P))) throw new Error("Point loads must be finite.");
  const unknowns = supports.flatMap((s, index) => [
    { index, kind: "force" as const, term: { c: 1, a: s.x / L, n: 1 } },
    ...(s.fixed ? [{ index, kind: "moment" as const, term: { c: -1, a: s.x / L, n: 0 } }] : []),
  ]);
  const N = unknowns.length,
    rows: number[][] = [],
    rhs: number[] = [];
  rows.push([...unknowns.map((u) => (u.kind === "force" ? 1 : 0)), 0, 0]);
  rhs.push(total);
  rows.push([...unknowns.map((u) => (u.kind === "force" ? supports[u.index]!.x / L : 1)), 0, 0]);
  rhs.push(first);
  for (const s of supports) {
    const t = s.x / L;
    rows.push([...unknowns.map((u) => evaluate([u.term], t, 2)), t, 1]);
    rhs.push(-evaluate(loads, t, 2));
    if (s.fixed) {
      rows.push([...unknowns.map((u) => evaluate([u.term], t, 1)), 1, 0]);
      rhs.push(-evaluate(loads, t, 1));
    }
  }
  const values = solveLinear(rows, rhs),
    terms = [...loads, ...unknowns.map((u, i) => ({ ...u.term, c: u.term.c * values[i]! }))];
  const c1 = values[N]!,
    c0 = values[N + 1]!;
  // Right-end forces/couples are excluded at the section just inside the beam.
  const tAt = (x: number) => (x >= L ? 1 - 1e-14 : Math.max(0, x / L));
  const M = (x: number) => L * evaluate(terms, tAt(x));
  const V = (x: number) => terms.reduce((s, q) => (q.n ? s + q.c * q.n * bracket(tAt(x), q.a, q.n - 1) : s), 0);
  const delta = (x: number) =>
    (-(L ** 3) / (E * I)) * (evaluate(terms, Math.max(0, Math.min(1, x / L)), 2) + (c1 * x) / L + c0);
  const slope = (x: number) => (-(L ** 2) / (E * I)) * (evaluate(terms, Math.max(0, Math.min(1, x / L)), 1) + c1);
  const breaks = [
    ...new Set([
      0,
      L,
      ...supports.map((s) => s.x),
      ...points.map((p) => p.x),
      ...distributed.flatMap((q) => [q.start, q.end]),
    ]),
  ].sort((a, b) => a - b);
  const reactions = supports.map((s) => ({ x: s.x, force: 0, moment: 0 }));
  unknowns.forEach((u, i) => {
    reactions[u.index]![u.kind] = values[i]! * (u.kind === "moment" ? L : 1);
  });
  const momentDerivative = differentiated(terms);
  const rotationTerms = [...terms.map((t) => ({ ...t, n: t.n + 1, c: t.c / (t.n + 1) })), { a: 0, n: 0, c: c1 }];
  return {
    L,
    loading,
    reactions,
    V,
    M,
    delta,
    slope,
    breaks,
    formulas,
    max: {
      V: polynomialExtreme(V, L, breaks, differentiated(momentDerivative)),
      M: polynomialExtreme(M, L, breaks, momentDerivative),
      delta: polynomialExtreme(delta, L, breaks, rotationTerms),
    },
  };
}
/** Combine compatible loadings before solving; E and I must be identical. */
export function superpose(cases: readonly BeamResult[], factors: readonly number[] = cases.map(() => 1)): BeamResult {
  const first = cases[0];
  if (!first || factors.length !== cases.length || factors.some((f) => !Number.isFinite(f)))
    throw new Error("Supply beam cases and one finite factor per case.");
  for (const c of cases)
    if (
      c.L !== first.L ||
      c.loading.E !== first.loading.E ||
      c.loading.I !== first.loading.I ||
      JSON.stringify(c.loading.supports) !== JSON.stringify(first.loading.supports)
    )
      throw new Error("Superposition requires identical supports, length and EI.");
  return analyzeBeam({
    ...first.loading,
    points: cases.flatMap((c, i) => c.loading.points.map((p) => ({ ...p, P: p.P * factors[i]! }))),
    distributed: cases.flatMap((c, i) =>
      c.loading.distributed.map((q) => ({ ...q, wStart: q.wStart * factors[i]!, wEnd: q.wEnd * factors[i]! })),
    ),
  });
}
const param = (key: keyof BeamParameters, label: string, quantity: Quantity): Parameter => ({ key, label, quantity });
const base = [param("L", "Total beam length L", "span")];
const wParam = param("w", "Uniform / peak load w", "lineLoad"),
  pParam = param("P", "Concentrated load P", "force");
const aParam = param("a", "Distance a from left end", "span"),
  bParam = param("b", "Distance b from left end", "span");
export const DEFAULT_BEAM_PARAMETERS: BeamParameters = {
  L: 240,
  w: 1 / 12,
  P: 10,
  P2: 15,
  a: 60,
  b: 180,
  E: 29000,
  I: 1000,
};
/** Compact symbolic fields. Where the location depends on load spacing, maxima are
 * evaluated at boundaries and the exact polynomial roots V=0 / Δ′=0. */
const CASE_FORMULAS: Record<string, Partial<BeamFormulas>> = {
  "simple-partial": {
    R: "R{A} = w(b − a)[L − (a + b)/2]/L; R{B} = w(b − a) − R{A}",
    definitions: "F(x) = w[⟨x − a⟩⁴ − ⟨x − b⟩⁴]/24",
    V: "V(x) = R{A} − w⟨x − a⟩ + w⟨x − b⟩",
    M: "M(x) = R{A}x − w⟨x − a⟩²/2 + w⟨x − b⟩²/2",
    Vmax: "|V{max}| = max(|R{A}|, |R{B}|)",
  },
  "simple-point": {
    definitions: "b = L − a; c = min(a,b); F(x) = P⟨x − a⟩³/6",
    Vmax: "|V{max}| = P max(a,b)/L",
    V: "V(x) = R{A} − PH(x − a)",
    M: "M(x) = R{A}x − P⟨x − a⟩",
    deltaMax: "Δ{max} = Pc(L² − c²)^(3/2)/(9√3 LEI)",
  },
  "simple-two-symmetric": {
    R: "R{A} = R{B} = P",
    definitions: "c = min(a,L − a); F(x) = P[⟨x − a⟩³ + ⟨x − (L − a)⟩³]/6",
    Vmax: "V{max} = P",
    Mmax: "M{max} = Pc between the loads",
    deltaMax: "Δ{max} = Pc(3L² − 4c²)/(24EI) at x = L/2",
  },
  "simple-two-equal": {
    R: "R{A} = P(2L − a − b)/L; R{B} = P(a + b)/L",
    definitions: "F(x) = P[⟨x − a⟩³ + ⟨x − b⟩³]/6",
    Vmax: "|V{max}| = max(|R{A}|, |R{B}|)",
    M: "M(x) = R{A}x − P⟨x − a⟩ − P⟨x − b⟩",
    Mmax: "M{max} = max(M(a), M(b))",
  },
  "simple-two-unequal": {
    R: "R{A} = [P(L − a) + P{2}(L − b)]/L; R{B} = (Pa + P{2}b)/L",
    definitions: "F(x) = [P⟨x − a⟩³ + P{2}⟨x − b⟩³]/6",
    Vmax: "|V{max}| = max(|R{A}|, |R{B}|)",
    M: "M(x) = R{A}x − P⟨x − a⟩ − P{2}⟨x − b⟩",
    Mmax: "M{max} = max(M(a), M(b))",
  },
  "simple-uniform": { V: "V(x) = w(L/2 − x)", M: "M(x) = wx(L − x)/2", delta: "Δ(x) = wx(L³ − 2Lx² + x³)/(24EI)" },
  "simple-center": {
    definitions: "F(x) = P⟨x − L/2⟩³/6",
    V: "V(x) = P/2 − PH(x − L/2)",
    M: "M(x) = Px/2 − P⟨x − L/2⟩",
  },
  "simple-triangle": {
    definitions: "F(x) = wx⁵/(120L)",
    V: "V(x) = wL/6 − wx²/(2L)",
    M: "M(x) = wLx/6 − wx³/(6L)",
    delta: "Δ(x) = wx(7L⁴ − 10L²x² + 3x⁴)/(360LEI)",
  },
  "simple-tent": {
    definitions: "F(x) = w[x⁵ − 2⟨x − L/2⟩⁵]/(60L)",
    V: "V(x) = wL/4 − wx²/L + 2w⟨x − L/2⟩²/L",
    M: "M(x) = wLx/4 − wx³/(3L) + 2w⟨x − L/2⟩³/(3L)",
    Vmax: "V{max} = wL/4",
  },
  "cantilever-uniform": { V: "V(x) = w(L − x)", M: "M(x) = −w(L − x)²/2", delta: "Δ(x) = wx²(6L² − 4Lx + x²)/(24EI)" },
  "cantilever-triangle": {
    V: "V(x) = w(L − x)²/(2L)",
    M: "M(x) = −w(L − x)³/(6L)",
    delta: "Δ(x) = wx²(10L³ − 10L²x + 5Lx² − x³)/(120LEI)",
    Vmax: "V{max} = wL/2",
  },
  "cantilever-end": { V: "V(x) = P", M: "M(x) = −P(L − x)", delta: "Δ(x) = Px²(3L − x)/(6EI)" },
  "cantilever-point": {
    V: "V(x) = P[1 − H(x − a)]",
    M: "M(x) = −Pa + Px − P⟨x − a⟩",
    delta: "Δ(x) = P[3ax² − x³ + ⟨x − a⟩³]/(6EI)",
    Vmax: "V{max} = P",
  },
  "fixed-uniform": { V: "V(x) = w(L/2 − x)", M: "M(x) = −wL²/12 + wLx/2 − wx²/2", delta: "Δ(x) = wx²(L − x)²/(24EI)" },
  "fixed-center": {
    definitions: "a = L/2; F(x) = P⟨x − a⟩³/6",
    V: "V(x) = P/2 − PH(x − L/2)",
    M: "M(x) = −PL/8 + Px/2 − P⟨x − L/2⟩",
    Vmax: "V{max} = P/2",
  },
  "fixed-point": {
    definitions: "b = L − a; F(x) = P⟨x − a⟩³/6",
    R: "R{A} = Pb²(3a + b)/L³; R{B} = Pa²(a + 3b)/L³; C{A} = Pab²/L²; C{B} = −Pa²b/L²",
    Vmax: "|V{max}| = max(|R{A}|, |R{B}|)",
    M: "M(x) = −C{A} + R{A}x − P⟨x − a⟩",
    V: "V(x) = R{A} − PH(x − a)",
    Mmax: "|M{max}| = max(|C{A}|, |C{B}|, 2Pa²b²/L³)",
  },
  "propped-uniform": {
    V: "V(x) = 5wL/8 − wx",
    M: "M(x) = −wL²/8 + 5wLx/8 − wx²/2",
    delta: "Δ(x) = wx²(3L² − 5Lx + 2x²)/(48EI)",
    deltaMax: "t = (15 − √33)/16; Δ{max} = wL⁴ t²(3 − 5t + 2t²)/(48EI) at x = tL",
  },
  "propped-center": {
    R: "R{A} = 11P/16; R{B} = 5P/16; C{A} = 3PL/16",
    definitions: "a = L/2; F(x) = P⟨x − a⟩³/6",
    Vmax: "V{max} = 11P/16",
    M: "M(x) = −3PL/16 + 11Px/16 − P⟨x − L/2⟩",
    Mmax: "|M{max}| = 3PL/16; M{positive,max} = 5PL/32",
  },
  "propped-point": {
    definitions: "F(x) = P⟨x − a⟩³/6",
    Vmax: "|V{max}| = max(|R{A}|, |R{B}|)",
    V: "V(x) = R{A} − PH(x − a)",
    M: "M(x) = −C{A} + R{A}x − P⟨x − a⟩",
    Mmax: "|M{max}| = max(|C{A}|, R{B}(L − a))",
  },
  "overhang-uniform": {
    definitions: "s = L − a; F(x) = wx⁴/24",
    R: "R{B} = wL²/(2s); R{A} = wL − R{B}",
    V: "V(x) = R{A} + R{B}H(x − s) − wx",
    M: "M(x) = R{A}x + R{B}⟨x − s⟩ − wx²/2",
    Vmax: "|V{max}| = max(|R{A}|, |R{A} − ws|, |wa|)",
    Mmax: "|M{max}| = max|M(x)| at x = 0,s,L and V(x) = 0",
    delta: "EIΔ(x) = F(x) − R{A}x³/6 − R{B}⟨x − s⟩³/6 + [R{A}s²/6 − ws³/24]x",
  },
  "overhang-end": {
    definitions: "s = L − a",
    R: "R{A} = −Pa/s; R{B} = PL/s",
    V: "V(x) = R{A} + R{B}H(x − s)",
    M: "M(x) = R{A}x + R{B}⟨x − s⟩",
    Vmax: "|V{max}| = max(P, Pa/s)",
    Mmax: "|M{max}| = Pa at x = s",
    delta: "EIΔ(x) = −R{A}x³/6 − R{B}⟨x − s⟩³/6 + R{A}s²x/6",
    deltaMax: "|Δ{max}| = max(Pa²L/(3EI), Pas²/(9√3 EI))",
  },
  "continuous-uniform": {
    definitions: "s = L/2; F(x) = wx⁴/24",
    V: "V(x) = 3ws/8 + 5ws H(x − s)/4 − wx",
    M: "M(x) = 3wsx/8 + 5ws⟨x − s⟩/4 − wx²/2",
    Vmax: "|V{max}| = 5ws/8",
    delta: "EIΔ(x) = wx⁴/24 − wsx³/16 − 5ws⟨x − s⟩³/24 + ws³x/48",
    deltaMax: "t = (1 + √33)/16; Δ{max} = ws⁴(2t⁴ − 3t³ + t)/(48EI) at x = ts and L − ts",
  },
};
const simpleDeflection = "EIΔ(x) = F(x) − R{A}x³/6 + [R{A}L²/6 − F(L)/L]x; |Δ{max}| occurs at Δ′(x) = 0";
const fixedDeflection = "EIΔ(x) = F(x) − R{A}x³/6 + C{A}x²/2; |Δ{max}| occurs at Δ′(x) = 0";
function define(
  id: string,
  name: string,
  support: SupportKind,
  parameters: Parameter[],
  make: (p: BeamParameters) => { points?: PointLoad[]; distributed?: DistributedLoad[] },
  formulas?: Partial<BeamFormulas>,
): BeamCase {
  return {
    id,
    name,
    support,
    parameters: [...base, ...parameters],
    solve: (p) => {
      if (parameters.some((q) => (q.key === "a" || q.key === "b") && !(p[q.key] > 0 && p[q.key] < p.L)))
        throw new Error("Distances a and b must be inside the beam.");
      const loads = make(p);
      return analyzeBeam(
        {
          L: p.L,
          E: p.E,
          I: p.I,
          supports: supportsFor(support, p.L, p.a),
          points: loads.points ?? [],
          distributed: loads.distributed ?? [],
        },
        {
          ...generalFormulas,
          ...(support === "simple"
            ? { delta: simpleDeflection }
            : support === "fixed-fixed" || support === "propped"
              ? { delta: fixedDeflection }
              : {}),
          ...formulas,
          ...CASE_FORMULAS[id],
        },
      );
    },
  };
}
const uniform = (p: BeamParameters) => ({ distributed: [{ start: 0, end: p.L, wStart: p.w, wEnd: p.w }] });
const point = (p: BeamParameters, x: number) => ({ points: [{ x, P: p.P }] });
export const BEAM_CASES: readonly BeamCase[] = [
  define("simple-uniform", "Simple · uniform load", "simple", [wParam], uniform, {
    R: "R{A} = R{B} = wL/2",
    Vmax: "V{max} = wL/2",
    Mmax: "M{max} = wL²/8 at x = L/2",
    deltaMax: "Δ{max} = 5wL⁴/(384EI) at x = L/2",
  }),
  define(
    "simple-triangle",
    "Simple · load increasing to right",
    "simple",
    [wParam],
    (p) => ({ distributed: [{ start: 0, end: p.L, wStart: 0, wEnd: p.w }] }),
    { R: "R{A} = wL/6; R{B} = wL/3", Vmax: "V{max} = wL/3", Mmax: "M{max} = wL²/(9√3) at x = L/√3" },
  ),
  define(
    "simple-tent",
    "Simple · load increasing to center",
    "simple",
    [wParam],
    (p) => ({
      distributed: [
        { start: 0, end: p.L / 2, wStart: 0, wEnd: p.w },
        { start: p.L / 2, end: p.L, wStart: p.w, wEnd: 0 },
      ],
    }),
    { R: "R{A} = R{B} = wL/4", Mmax: "M{max} = wL²/12", deltaMax: "Δ{max} = wL⁴/(120EI)" },
  ),
  define("simple-partial", "Simple · partial uniform load a to b", "simple", [wParam, aParam, bParam], (p) => ({
    distributed: [{ start: p.a, end: p.b, wStart: p.w, wEnd: p.w }],
  })),
  define("simple-center", "Simple · concentrated at center", "simple", [pParam], (p) => point(p, p.L / 2), {
    R: "R{A} = R{B} = P/2",
    Vmax: "V{max} = P/2",
    Mmax: "M{max} = PL/4",
    deltaMax: "Δ{max} = PL³/(48EI)",
  }),
  define("simple-point", "Simple · concentrated at a", "simple", [pParam, aParam], (p) => point(p, p.a), {
    R: "R{A} = P(L − a)/L; R{B} = Pa/L",
    Mmax: "M{max} = Pa(L − a)/L",
  }),
  define("simple-two-symmetric", "Simple · two equal symmetric loads", "simple", [pParam, aParam], (p) => ({
    points: [
      { x: p.a, P: p.P },
      { x: p.L - p.a, P: p.P },
    ],
  })),
  define("simple-two-equal", "Simple · two equal unsymmetric loads", "simple", [pParam, aParam, bParam], (p) => ({
    points: [
      { x: p.a, P: p.P },
      { x: p.b, P: p.P },
    ],
  })),
  define(
    "simple-two-unequal",
    "Simple · two unequal loads",
    "simple",
    [pParam, param("P2", "Second concentrated load P₂", "force"), aParam, bParam],
    (p) => ({
      points: [
        { x: p.a, P: p.P },
        { x: p.b, P: p.P2 },
      ],
    }),
  ),
  define("cantilever-uniform", "Cantilever · uniform load", "cantilever", [wParam], uniform, {
    R: "R{A} = wL; C{A} = wL²/2",
    Vmax: "V{max} = wL",
    Mmax: "|M{max}| = wL²/2 at fixed end",
    deltaMax: "Δ{max} = wL⁴/(8EI) at free end",
  }),
  define(
    "cantilever-triangle",
    "Cantilever · load increasing to fixed end",
    "cantilever",
    [wParam],
    (p) => ({ distributed: [{ start: 0, end: p.L, wStart: p.w, wEnd: 0 }] }),
    { R: "R{A} = wL/2; C{A} = wL²/6", Mmax: "|M{max}| = wL²/6", deltaMax: "Δ{max} = wL⁴/(30EI)" },
  ),
  define("cantilever-end", "Cantilever · concentrated at free end", "cantilever", [pParam], (p) => point(p, p.L), {
    R: "R{A} = P; C{A} = PL",
    Vmax: "V{max} = P",
    Mmax: "|M{max}| = PL",
    deltaMax: "Δ{max} = PL³/(3EI)",
  }),
  define("cantilever-point", "Cantilever · concentrated at a", "cantilever", [pParam, aParam], (p) => point(p, p.a), {
    R: "R{A} = P; C{A} = Pa",
    Mmax: "|M{max}| = Pa",
    deltaMax: "Δ{max} = Pa²(3L − a)/(6EI)",
  }),
  define("fixed-uniform", "Fixed–fixed · uniform load", "fixed-fixed", [wParam], uniform, {
    R: "R{A} = R{B} = wL/2; |C| = wL²/12",
    Vmax: "V{max} = wL/2",
    Mmax: "M{end} = −wL²/12; M{mid} = wL²/24",
    deltaMax: "Δ{max} = wL⁴/(384EI)",
  }),
  define("fixed-center", "Fixed–fixed · concentrated at center", "fixed-fixed", [pParam], (p) => point(p, p.L / 2), {
    R: "R{A} = R{B} = P/2; |C| = PL/8",
    Mmax: "|M{max}| = PL/8",
    deltaMax: "Δ{max} = PL³/(192EI)",
  }),
  define("fixed-point", "Fixed–fixed · concentrated at a", "fixed-fixed", [pParam, aParam], (p) => point(p, p.a)),
  define("propped-uniform", "Fixed–simple · uniform load", "propped", [wParam], uniform, {
    R: "R{A} = 5wL/8; R{B} = 3wL/8; C{A} = wL²/8",
    Vmax: "V{max} = 5wL/8",
    Mmax: "M{A} = −wL²/8; M{positive,max} = 9wL²/128 at x = 5L/8",
  }),
  define("propped-center", "Fixed–simple · concentrated at center", "propped", [pParam], (p) => point(p, p.L / 2)),
  define("propped-point", "Fixed–simple · concentrated at a", "propped", [pParam, aParam], (p) => point(p, p.a), {
    R: "R{B} = Pa²(3L − a)/(2L³); R{A} = P − R{B}; C{A} = Pa − R{B}L",
  }),
  define(
    "overhang-uniform",
    "One overhang a · uniform over full length L",
    "overhang",
    [wParam, param("a", "Overhang length a", "span")],
    uniform,
  ),
  define(
    "overhang-end",
    "One overhang a · concentrated at free end",
    "overhang",
    [pParam, param("a", "Overhang length a", "span")],
    (p) => point(p, p.L),
  ),
  define("continuous-uniform", "Continuous · two equal spans L/2 · uniform", "continuous", [wParam], uniform, {
    R: "R{A} = R{C} = 3w(L/2)/8; R{B} = 5w(L/2)/4",
    Mmax: "M{B} = −w(L/2)²/8; M{positive,max} = 9w(L/2)²/128",
  }),
];
export const beamCaseById = (id: string) => BEAM_CASES.find((c) => c.id === id) ?? BEAM_CASES[0]!;
