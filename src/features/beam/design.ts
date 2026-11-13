import { analyzeBeam, extreme, supportsFor, type BeamResult, type SupportKind } from "@/analysis/beam-cases";
import { combinationsFor, governingCombination, type Combination } from "@/analysis/load-combinations";
import {
  available,
  cbFromMoments,
  flexuralStrength,
  shearStrength,
  UnsupportedError,
  type DesignMethod,
  type FlexureResult,
  type ShearResult,
} from "@/aisc";
import { E, materialsFor, preferredMaterial, type Material } from "@/data/materials";
import { familyOf, num, req, type Shape } from "@/data/shapes";
export interface DesignPoint {
  x: number;
  P: number;
  category: "D" | "L";
}
export interface BeamDesignInput {
  L: number;
  support: SupportKind;
  overhang: number;
  dead: number;
  live: number;
  points: DesignPoint[];
  selfWeight: boolean;
  bracing: "continuous" | "points" | "custom";
  Lb: number;
  cbOverride?: number;
  liveLimit: number;
  totalLimit: number;
  method: DesignMethod;
  materialId?: string;
}
export interface DesignDemand {
  strength: { beam: BeamResult; combo: Combination }[];
  total: BeamResult;
  live: BeamResult;
  dead: BeamResult;
  moment: { value: number; combo: Combination; x: number };
  shear: { value: number; combo: Combination; x: number };
}
export interface Candidate {
  shape: Shape;
  material: Material;
  flexure: FlexureResult;
  shear: ShearResult;
  demand: DesignDemand;
  moment: number;
  capacity: number;
  shearCapacity: number;
  mRatio: number;
  vRatio: number;
  dll: number;
  dtl: number;
  llRatio: number;
  tlRatio: number;
  ratio: number;
  governing: string;
  pass: boolean;
  segment: { start: number; end: number; Lb: number; Cb: number; combo: Combination };
}
export function validateInput(c: BeamDesignInput): string | undefined {
  if (!(c.L > 0 && c.L <= 120000)) return "Enter a positive beam length (up to 10,000 ft).";
  if (![c.dead, c.live].every((v) => Number.isFinite(v) && v >= 0))
    return "Dead and live loads must be finite and nonnegative.";
  if (c.support === "overhang" && !(c.overhang > 0 && c.overhang < c.L))
    return "Overhang length must be between zero and the total beam length.";
  if (c.bracing === "custom" && !(c.Lb > 0 && c.Lb <= c.L))
    return "Custom brace spacing must be positive and no greater than the beam length.";
  if (c.bracing === "custom" && Math.ceil(c.L / c.Lb) > 100)
    return "Use continuous bracing or no more than 100 unbraced segments.";
  if (c.cbOverride !== undefined && !(c.cbOverride >= 1 && c.cbOverride <= 5))
    return "Cb override must be between 1 and 5.";
  if (!(c.liveLimit > 0 && c.totalLimit > 0)) return "Deflection denominators must be positive.";
  if (c.points.some((p) => !Number.isFinite(p.P) || p.P < 0 || !Number.isFinite(p.x) || p.x < 0 || p.x > c.L))
    return "Point loads must be nonnegative and their positions must be on the beam.";
  return undefined;
}
function scaleUniformBeam(base: BeamResult, factor: number): BeamResult {
  const scale = (e: { value: number; x: number }) => ({ ...e, value: e.value * factor });
  return {
    ...base,
    loading: {
      ...base.loading,
      distributed: base.loading.distributed.map((q) => ({ ...q, wStart: q.wStart * factor, wEnd: q.wEnd * factor })),
    },
    reactions: base.reactions.map((r) => ({ ...r, force: r.force * factor, moment: r.moment * factor })),
    V: (x) => base.V(x) * factor,
    M: (x) => base.M(x) * factor,
    delta: (x) => base.delta(x) * factor,
    slope: (x) => base.slope(x) * factor,
    max: { V: scale(base.max.V), M: scale(base.max.M), delta: scale(base.max.delta) },
  };
}
export function designDemands(c: BeamDesignInput, weight: number, uniformBasis?: BeamResult): DesignDemand {
  const supports = supportsFor(c.support, c.L, c.overhang);
  const dead = c.dead + (c.selfWeight ? weight / 12000 : 0);
  const solve = (d: number, l: number) =>
    uniformBasis && !c.points.length
      ? scaleUniformBeam(uniformBasis, dead * d + c.live * l)
      : analyzeBeam({
          L: c.L,
          E,
          I: 1,
          supports,
          distributed: [{ start: 0, end: c.L, wStart: dead * d + c.live * l, wEnd: dead * d + c.live * l }],
          points: c.points.map((p) => ({ x: p.x, P: p.P * (p.category === "D" ? d : l) })),
        });
  const unique = new Set<string>();
  const strength = combinationsFor(c.method)
    .filter((combo) => {
      const key = `${combo.factors.D ?? 0}/${combo.factors.L ?? 0}`;
      if (unique.has(key)) return false;
      unique.add(key);
      return true;
    })
    .map((combo) => ({ combo, beam: solve(combo.factors.D ?? 0, combo.factors.L ?? 0) }));
  const m = strength.reduce((a, b) => (Math.abs(a.beam.max.M.value) >= Math.abs(b.beam.max.M.value) ? a : b));
  const v = strength.reduce((a, b) => (Math.abs(a.beam.max.V.value) >= Math.abs(b.beam.max.V.value) ? a : b));
  const deadBeam = solve(1, 0),
    liveBeam = solve(0, 1),
    total = solve(1, 1);
  // Evaluate the actual signed component effects at the critical sections.
  const moment = governingCombination({ D: deadBeam.M(m.beam.max.M.x), L: liveBeam.M(m.beam.max.M.x) }, c.method);
  const shear = governingCombination({ D: deadBeam.V(v.beam.max.V.x), L: liveBeam.V(v.beam.max.V.x) }, c.method);
  return {
    strength,
    total,
    live: liveBeam,
    dead: deadBeam,
    moment: { value: Math.abs(moment.value), combo: moment.combo, x: m.beam.max.M.x },
    shear: { value: Math.abs(shear.value), combo: shear.combo, x: v.beam.max.V.x },
  };
}
export function braceSegments(c: BeamDesignInput): { start: number; end: number }[] {
  let boundaries = [0, c.L];
  if (c.bracing === "points")
    boundaries.push(...c.points.map((p) => p.x), ...supportsFor(c.support, c.L, c.overhang).map((s) => s.x));
  if (c.bracing === "custom") for (let x = c.Lb; x < c.L - 1e-8; x += c.Lb) boundaries.push(x);
  boundaries = [...new Set(boundaries)].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, i) => ({ start, end: boundaries[i + 1]! }));
}
export function nominalDepth(s: Shape): number {
  const nominal = /^(?:W|M|S|HP|C|MC)([\d.]+)/.exec(s.label)?.[1];
  return nominal ? Number(nominal) : (num(s, "Ht") ?? num(s, "OD") ?? num(s, "d") ?? Infinity);
}
export function depthGroup(s: Shape): string {
  return s.label.split("X")[0]!;
}
export function materialFor(s: Shape, id?: string): Material {
  return materialsFor(familyOf(s)).find((m) => m.id === id) ?? preferredMaterial(s.type, familyOf(s));
}
/** Evaluate all load combinations and each brace segment; demand is paired with its own Cb. */
export function checkCandidate(shape: Shape, c: BeamDesignInput, demand: DesignDemand): Candidate {
  const material = materialFor(shape, c.materialId),
    I = req(shape, "Ix");
  const segments = braceSegments(c);
  let best:
    | { flexure: FlexureResult; ratio: number; moment: number; capacity: number; segment: Candidate["segment"] }
    | undefined;
  if (c.bracing === "continuous") {
    const flexure = flexuralStrength(shape, material, { axis: "major", Lb: 0, Cb: 1 });
    const capacity = available(flexure, c.method);
    best = {
      flexure,
      capacity,
      ratio: demand.moment.value / capacity,
      moment: demand.moment.value,
      segment: { start: 0, end: c.L, Lb: 0, Cb: 1, combo: demand.moment.combo },
    };
  }
  for (const { beam, combo } of c.bracing === "continuous" ? [] : demand.strength)
    for (const segment of segments) {
      const length = segment.end - segment.start;
      const localBreaks = [
        segment.start,
        ...beam.breaks.filter((x) => x > segment.start && x < segment.end),
        segment.end,
      ].map((x) => x - segment.start);
      const max = extreme(
        (x) => beam.M(x + segment.start),
        length,
        localBreaks,
        (x) => beam.V(x + segment.start),
      );
      const m = Math.abs(max.value);
      // Free-end cantilevers/overhangs use unity under §F1; both compression flanges must be braced in reverse curvature.
      const freeEnd = (c.support === "cantilever" || c.support === "overhang") && segment.end === c.L;
      const Cb =
        c.bracing === "continuous" || freeEnd
          ? 1
          : (c.cbOverride ??
            cbFromMoments(
              Math.max(m, ...[0.25, 0.5, 0.75].map((t) => Math.abs(beam.M(segment.start + length * t)))),
              beam.M(segment.start + length / 4),
              beam.M(segment.start + length / 2),
              beam.M(segment.start + (3 * length) / 4),
            ));
      const Lb = c.bracing === "continuous" ? 0 : length;
      const flexure = flexuralStrength(shape, material, { axis: "major", Lb, Cb });
      const capacity = available(flexure, c.method),
        ratio = m / capacity;
      if (!best || ratio > best.ratio)
        best = { flexure, capacity, ratio, moment: m, segment: { ...segment, Lb, Cb, combo } };
    }
  if (!best) throw new Error("No unbraced segments.");
  const shear = shearStrength(shape, material, { axis: "major" }),
    shearCapacity = available(shear, c.method);
  const dll = Math.abs(demand.live.max.delta.value) / I,
    dtl = Math.abs(demand.total.max.delta.value) / I;
  const checks = [
    { name: `Flexure · ${best.flexure.governing}`, ratio: best.ratio },
    { name: "Shear", ratio: demand.shear.value / shearCapacity },
    { name: "Live deflection", ratio: dll / (c.L / c.liveLimit) },
    { name: "Total deflection", ratio: dtl / (c.L / c.totalLimit) },
  ];
  const worst = checks.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  return {
    shape,
    material,
    flexure: best.flexure,
    shear,
    demand,
    moment: best.moment,
    capacity: best.capacity,
    shearCapacity,
    mRatio: best.ratio,
    vRatio: checks[1]!.ratio,
    dll,
    dtl,
    llRatio: checks[2]!.ratio,
    tlRatio: checks[3]!.ratio,
    ratio: worst.ratio,
    governing: worst.name,
    pass: worst.ratio <= 1 + 1e-9,
    segment: best.segment,
  };
}
/** Reuse demand analyses for equal weights and reuse all analyses when self-weight is disabled. */
export function sweepShapes(
  shapes: readonly Shape[],
  c: BeamDesignInput,
): { candidates: Candidate[]; skipped: { shape: Shape; reason: string }[] } {
  const cache = new Map<number, DesignDemand>(),
    candidates: Candidate[] = [],
    skipped: { shape: Shape; reason: string }[] = [];
  let uniformBasis: BeamResult | undefined;
  try {
    if (!c.points.length)
      uniformBasis = analyzeBeam({
        L: c.L,
        E,
        I: 1,
        supports: supportsFor(c.support, c.L, c.overhang),
        points: [],
        distributed: [{ start: 0, end: c.L, wStart: 1, wEnd: 1 }],
      });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { candidates, skipped: shapes.map((shape) => ({ shape, reason: error.message })) };
  }
  for (const shape of shapes) {
    try {
      const weight = c.selfWeight ? req(shape, "W") : 0;
      let demand = cache.get(weight);
      if (!demand) {
        demand = designDemands(c, weight, uniformBasis);
        cache.set(weight, demand);
      }
      candidates.push(checkCandidate(shape, c, demand));
    } catch (error) {
      if (error instanceof UnsupportedError || error instanceof Error) skipped.push({ shape, reason: error.message });
      else throw error;
    }
  }
  candidates.sort((a, b) => req(a.shape, "W") - req(b.shape, "W") || nominalDepth(a.shape) - nominalDepth(b.shape));
  return { candidates, skipped };
}
