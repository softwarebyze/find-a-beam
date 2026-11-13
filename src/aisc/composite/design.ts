/**
 * Simply supported composite beam under uniform load — construction (steel alone) and composite stages.
 * AISC 360-22 Chapter I with Chapters F and G for the bare steel; loads per ASCE/SEI 7-22 §2.3.1 / §2.4.1.
 */
import { governingCombination, type Combination } from "@/analysis/load-combinations";
import { E, materialById, materialsFor, type Material } from "@/data/materials";
import { req, type Shape } from "@/data/shapes";
import type { Quantity } from "@/lib/units";
import { available } from "../common";
import { cbFromMoments, flexuralStrength } from "../flexure";
import { shearStrength } from "../shear";
import type { CalcStep, DesignMethod, FlexureResult, ShearResult } from "../types";
import { detailingChecks, studLayout, studSpacing, studStrength, type DetailCheck, type StudLayout } from "./anchors";
import { compositeFlexure, elasticProps } from "./section";
import { concreteModulus, cstep, effectiveWidth, slabDepth, slabWeight, validateSlab } from "./slab";
import type {
  CompositeFlexureResult,
  ConcreteProps,
  EffectiveWidth,
  ElasticProps,
  SlabGeometry,
  StudSpec,
  StudStrength,
} from "./types";

export interface CompositeLoads {
  /** Deck, reinforcement and miscellaneous construction dead load, ksi (area load) */
  deckMisc: number;
  /** Construction live load, ksi */
  constructionLive: number;
  /** Superimposed dead load applied to the composite section, ksi */
  superDead: number;
  /** Live load, ksi */
  live: number;
}

export interface CompositeDesignInput {
  /** Span, in. */
  L: number;
  position: "interior" | "edge";
  /** Beam spacing, in. */
  spacing: number;
  /** Edge beam: centerline-to-slab-edge distance, in. */
  edge?: number;
  slab: SlabGeometry;
  concrete: ConcreteProps;
  stud: StudSpec;
  loads: CompositeLoads;
  /** Shored construction: all dead load on the composite section, no construction-stage check */
  shored: boolean;
  /** Construction-stage lateral bracing of the top flange */
  bracing: "deck" | "unbraced" | "custom";
  /** Custom brace spacing, in. */
  Lb?: number;
  liveLimit: number;
  totalLimit: number;
  /** Fraction of the wet-concrete deflection to camber (0 = no camber) */
  camberFraction: number;
  deflectionBasis: "ILB" | "Ieff";
  /** Minimum degree of composite action ΣQn / Cf */
  minComposite: number;
  method: DesignMethod;
  /** Anchors between maximum and zero moment (half span); undefined → minimum satisfying all checks */
  studsPerHalf?: number;
  materialId?: string;
}

export interface LineLoads {
  slab: number;
  deckMisc: number;
  beam: number;
  constructionDead: number;
  constructionLive: number;
  superDead: number;
  live: number;
  compositeDead: number;
}

export interface Demand {
  value: number;
  combo: Combination;
}

export interface ConstructionStage {
  flexure: FlexureResult;
  shear: ShearResult;
  Mu: Demand;
  Vu: Demand;
  capacity: number;
  shearCapacity: number;
  mRatio: number;
  vRatio: number;
  Lb: number;
  Cb: number;
  /** Moment in the governing unbraced segment, kip-in. */
  segmentMoment: number;
}

export interface CompositeStage {
  flexure: CompositeFlexureResult;
  elastic: ElasticProps;
  Mu: Demand;
  Vu: Demand;
  capacity: number;
  mRatio: number;
  shear: ShearResult;
  shearCapacity: number;
  vRatio: number;
}

export interface StudSummary {
  strength: StudStrength;
  layout: StudLayout;
  nPerHalf: number;
  total: number;
  auto: boolean;
  /** Minimum per half span for the minimum composite ratio */
  nMinComposite: number;
  /** Minimum per half span for flexural strength alone (undefined: full composite is insufficient) */
  nForStrength?: number;
  /** Anchors that develop full composite action */
  nFull: number;
  groups: number;
  spacing: number;
}

export interface DeflectionSummary {
  basis: "ILB" | "Ieff";
  I: number;
  Is: number;
  /** Steel-alone wet concrete deflection (unshored), in. */
  wet: number;
  camberRaw: number;
  camber: number;
  /** Shored: construction dead load deflection on the composite section, in. */
  dead: number;
  superDead: number;
  live: number;
  total: number;
  liveAllow: number;
  totalAllow: number;
  steps: CalcStep[];
}

export interface CompositeCheck {
  id: string;
  name: string;
  ref: string;
  ratio: number;
  demand?: number;
  capacity?: number;
  quantity?: Quantity;
}

export interface CompositeDesign {
  shape: Shape;
  material: Material;
  width: EffectiveWidth;
  Ec: number;
  Ycon: number;
  loads: LineLoads;
  construction?: ConstructionStage;
  composite: CompositeStage;
  studs: StudSummary;
  deflection: DeflectionSummary;
  detailing: DetailCheck[];
  checks: CompositeCheck[];
  ratio: number;
  governing: string;
  pass: boolean;
  warnings: string[];
}

export function validateComposite(i: CompositeDesignInput): string | undefined {
  if (!(i.L > 0 && i.L <= 1800)) return "Enter a span between 0 and 150 ft.";
  if (!(i.spacing > 0)) return "Beam spacing must be positive.";
  if (i.position === "edge" && !((i.edge ?? -1) >= 0)) return "Edge distance must be zero or positive.";
  const slab = validateSlab(i.slab, i.concrete);
  if (slab) return slab;
  if (!(i.stud.d > 0 && i.stud.length > 0 && i.stud.Fu > 0)) return "Stud diameter, length and Fu must be positive.";
  if (!(i.stud.perGroup >= 1 && i.stud.perGroup <= 3)) return "Studs per rib or row must be 1 to 3.";
  if (Object.values(i.loads).some((v) => !Number.isFinite(v) || v < 0)) return "Loads must be finite and nonnegative.";
  if (i.bracing === "custom" && !((i.Lb ?? 0) > 0 && (i.Lb ?? 0) <= i.L))
    return "Construction brace spacing must be positive and no greater than the span.";
  if (!(i.liveLimit > 0 && i.totalLimit > 0)) return "Deflection denominators must be positive.";
  if (!(i.camberFraction >= 0 && i.camberFraction <= 1)) return "Camber fraction must be between 0 and 100 %.";
  if (!(i.minComposite >= 0 && i.minComposite <= 1)) return "Minimum composite ratio must be between 0 and 100 %.";
  if (
    i.studsPerHalf !== undefined &&
    !(Number.isInteger(i.studsPerHalf) && i.studsPerHalf >= 0 && i.studsPerHalf <= 500)
  )
    return "Studs per half span must be a whole number.";
  return undefined;
}

export function compositeMaterial(id?: string): Material {
  return materialsFor("i-shape").find((m) => m.id === id) ?? materialById("A992")!;
}

const sq = (x: number) => x * x;
/** Simple-span uniform-load midspan deflection, in.: 5wL⁴/(384EI). */
const deflect = (w: number, L: number, I: number) => (5 * w * L ** 4) / (384 * E * I);
const demand = (D: number, L: number, method: DesignMethod): Demand => {
  const g = governingCombination({ D, L }, method);
  return { value: Math.abs(g.value), combo: g.combo };
};

function constructionStage(shape: Shape, mat: Material, i: CompositeDesignInput, w: LineLoads): ConstructionStage {
  const L = i.L,
    m0 = sq(L) / 8;
  const Mu = demand(w.constructionDead * m0, w.constructionLive * m0, i.method);
  const Vu = demand((w.constructionDead * L) / 2, (w.constructionLive * L) / 2, i.method);
  // Moment along the span normalized to midspan: M(x)/M(L/2) = 4x(L − x)/L².
  const shapeM = (x: number) => (4 * x * (L - x)) / sq(L);
  let best: { flexure: FlexureResult; capacity: number; ratio: number; Lb: number; Cb: number; m: number } | undefined;
  if (i.bracing === "deck") {
    const flexure = flexuralStrength(shape, mat, { axis: "major", Lb: 0, Cb: 1 });
    const capacity = available(flexure, i.method);
    best = { flexure, capacity, ratio: Mu.value / capacity, Lb: 0, Cb: 1, m: Mu.value };
  } else {
    const k = i.bracing === "unbraced" ? 1 : Math.max(1, Math.ceil(L / (i.Lb ?? L) - 1e-9));
    const len = L / k;
    for (let j = 0; j < Math.ceil(k / 2); j++) {
      const a = j * len,
        b = a + len;
      const mmax = a <= L / 2 && b >= L / 2 ? 1 : Math.max(shapeM(a), shapeM(b));
      const Cb = cbFromMoments(mmax, shapeM(a + len / 4), shapeM(a + len / 2), shapeM(a + (3 * len) / 4));
      const flexure = flexuralStrength(shape, mat, { axis: "major", Lb: len, Cb });
      const capacity = available(flexure, i.method),
        m = Mu.value * mmax,
        ratio = m / capacity;
      if (!best || ratio > best.ratio) best = { flexure, capacity, ratio, Lb: len, Cb, m };
    }
  }
  const b = best!;
  const shear = shearStrength(shape, mat, { axis: "major" }),
    shearCapacity = available(shear, i.method);
  return {
    flexure: b.flexure,
    shear,
    Mu,
    Vu,
    capacity: b.capacity,
    shearCapacity,
    mRatio: b.ratio,
    vRatio: Vu.value / shearCapacity,
    Lb: b.Lb,
    Cb: b.Cb,
    segmentMoment: b.m,
  };
}

/** Design check of one W-shape. Throws UnsupportedError for shapes outside §I3.2a(a). */
export function checkComposite(shape: Shape, i: CompositeDesignInput): CompositeDesign {
  const mat = compositeMaterial(i.materialId);
  const width = effectiveWidth({ L: i.L, position: i.position, spacing: i.spacing, edge: i.edge });
  const Ec = concreteModulus(i.concrete),
    Ycon = slabDepth(i.slab),
    trib = width.tributary;
  const W = req(shape, "W"),
    Is = req(shape, "Ix");
  const loads: LineLoads = {
    slab: slabWeight(i.slab, i.concrete) * trib,
    deckMisc: i.loads.deckMisc * trib,
    beam: W / 12000,
    constructionDead: 0,
    constructionLive: i.loads.constructionLive * trib,
    superDead: i.loads.superDead * trib,
    live: i.loads.live * trib,
    compositeDead: 0,
  };
  loads.constructionDead = loads.slab + loads.deckMisc + loads.beam;
  loads.compositeDead = loads.constructionDead + loads.superDead;
  const construction = i.shored ? undefined : constructionStage(shape, mat, i, loads);
  const m0 = sq(i.L) / 8;
  const Mu = demand(loads.compositeDead * m0, loads.live * m0, i.method);
  const Vu = demand((loads.compositeDead * i.L) / 2, (loads.live * i.L) / 2, i.method);
  const shear = construction?.shear ?? shearStrength(shape, mat, { axis: "major" });
  const shearCapacity = available(shear, i.method);
  const stud = studStrength(i.slab, i.stud, i.concrete);
  const layout = studLayout(i.L, i.slab, i.stud, Ycon);
  const wet = i.shored ? 0 : deflect(loads.constructionDead, i.L, Is);
  const camberRaw = i.shored ? 0 : i.camberFraction * wet;
  const quarter = Math.floor(camberRaw * 4 + 1e-9) / 4;
  const camber = quarter >= 0.75 - 1e-9 ? quarter : 0;
  const flexAt = (n: number) =>
    compositeFlexure({ shape, Fy: mat.Fy, b: width.b, slab: i.slab, concrete: i.concrete, sumQn: n * stud.Qn });

  const evaluate = (n: number) => {
    const flexure = flexAt(n);
    const elastic = elasticProps(shape, mat.Fy, width.b, i.slab, Ec, flexure);
    const I = i.deflectionBasis === "ILB" ? elastic.ILB : elastic.Ieff;
    const dead = i.shored ? deflect(loads.constructionDead, i.L, I) : 0;
    const superDead = deflect(loads.superDead, i.L, I),
      live = deflect(loads.live, i.L, I);
    const total = (i.shored ? dead : wet - camber) + superDead + live;
    const liveAllow = i.L / i.liveLimit,
      totalAllow = i.L / i.totalLimit;
    const capacity = available(flexure, i.method);
    const eta = flexure.Cf > 0 ? Math.min(1, flexure.sumQn / flexure.Cf) : 0;
    const sp = studSpacing(i.L, n, i.slab, i.stud, layout);
    const checks: CompositeCheck[] = [
      {
        id: "Mc",
        name: "Composite flexure",
        ref: "§I3.2a",
        ratio: Mu.value / capacity,
        demand: Mu.value,
        capacity,
        quantity: "moment",
      },
      {
        id: "fit",
        name: "Anchors fit in half span",
        ref: "§I8.2d",
        ratio: layout.nMax > 0 ? n / layout.nMax : Infinity,
        demand: n,
        capacity: layout.nMax,
      },
      {
        id: "smax",
        name: "Maximum anchor spacing",
        ref: "§I8.2d",
        ratio: n > 0 ? sp.s / layout.smax : Infinity,
        demand: sp.s,
        capacity: layout.smax,
        quantity: "length",
      },
      {
        id: "eta",
        name: "Minimum composite action",
        ref: "Commentary §I3.2",
        ratio: i.minComposite === 0 ? 0 : eta > 0 ? i.minComposite / eta : Infinity,
        demand: eta,
        capacity: i.minComposite,
      },
      {
        id: "dl",
        name: "Live-load deflection",
        ref: "§L3",
        ratio: live / liveAllow,
        demand: live,
        capacity: liveAllow,
        quantity: "length",
      },
      {
        id: "dt",
        name: "Total deflection",
        ref: "§L3",
        ratio: total / totalAllow,
        demand: total,
        capacity: totalAllow,
        quantity: "length",
      },
    ];
    return { n, flexure, elastic, I, dead, superDead, live, total, liveAllow, totalAllow, capacity, checks, sp };
  };

  const nFull = Math.max(1, Math.ceil(flexAt(0).Cf / stud.Qn - 1e-9));
  const nMinComposite = Math.ceil((i.minComposite * flexAt(0).Cf) / stud.Qn - 1e-9);
  let nForStrength: number | undefined;
  for (let n = 0; n <= nFull; n++)
    if (Mu.value <= available(flexAt(n), i.method) + 1e-9) {
      nForStrength = n;
      break;
    }
  let chosen: ReturnType<typeof evaluate>;
  if (i.studsPerHalf !== undefined) chosen = evaluate(i.studsPerHalf);
  else {
    const nLow = Math.max(1, layout.nSpacing, nMinComposite, nForStrength ?? 0);
    const nTop = Math.max(nLow, Math.min(layout.nMax, nFull));
    let found: ReturnType<typeof evaluate> | undefined;
    for (let n = nLow; n <= nTop && !found; n++) {
      const e = evaluate(n);
      if (e.checks.every((c) => c.ratio <= 1 + 1e-9)) found = e;
    }
    chosen = found ?? evaluate(nTop);
  }

  const detailing = detailingChecks(i.slab, i.stud, { bf: req(shape, "bf"), tf: req(shape, "tf") }, Ycon);
  const checks: CompositeCheck[] = [];
  if (construction)
    checks.push(
      {
        id: "Mcs",
        name: `Construction flexure · ${construction.flexure.governing}`,
        ref: construction.flexure.section.split(" ")[0] ?? "§F2",
        ratio: construction.mRatio,
        demand: construction.segmentMoment,
        capacity: construction.capacity,
        quantity: "moment",
      },
      {
        id: "Vcs",
        name: "Construction shear",
        ref: "§G2.1",
        ratio: construction.vRatio,
        demand: construction.Vu.value,
        capacity: construction.shearCapacity,
        quantity: "force",
      },
    );
  checks.push(chosen.checks[0]!, {
    id: "Vc",
    name: "Shear (steel web)",
    ref: "§I4.2 · §G2.1",
    ratio: Vu.value / shearCapacity,
    demand: Vu.value,
    capacity: shearCapacity,
    quantity: "force",
  });
  checks.push(...chosen.checks.slice(1));
  const failedDetail = detailing.find((d) => !d.ok);
  const worst = checks.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const pass = worst.ratio <= 1 + 1e-9 && !failedDetail;
  const warnings = [...chosen.flexure.warnings];
  if (i.slab.kind === "solid" && i.bracing === "deck" && !i.shored)
    warnings.push(
      "Construction bracing is set to “braced by deck” with a solid slab; verify that the formwork restrains the top flange.",
    );
  if (camberRaw > 0 && camber === 0 && !i.shored)
    warnings.push("Computed camber is under 3/4 in.; no camber specified (common practice).");
  if (i.slab.kind === "deck-perpendicular")
    warnings.push("Deck must be anchored to the beam at a spacing not exceeding 18 in. (§I3.2c(1)).");

  const dSteps: CalcStep[] = [];
  if (!i.shored)
    dSteps.push(
      cstep(
        "Wet concrete + deck + beam on steel alone",
        "Δ{wet}",
        wet,
        "length",
        "Manual Table 3-23",
        "5w{D,c}L⁴ / (384EI{x})",
      ),
      cstep(
        "Recommended camber",
        "camber",
        camber,
        "length",
        "Manual Part 3",
        `${Math.round(i.camberFraction * 100)} % Δ{wet}, rounded down to 1/4 in.; none below 3/4 in.`,
      ),
    );
  else
    dSteps.push(
      cstep(
        "Dead load on the shored composite section",
        "Δ{D}",
        chosen.dead,
        "length",
        "Manual Table 3-23",
        "5w{D,c}L⁴ / (384EI)",
      ),
    );
  dSteps.push(
    cstep(
      `Moment of inertia for deflection (${i.deflectionBasis === "ILB" ? "lower bound" : "effective"})`,
      i.deflectionBasis === "ILB" ? "I{LB}" : "I{eff}",
      chosen.I,
      "inertia",
      i.deflectionBasis === "ILB" ? "Manual Table 3-20" : "Commentary Eq. C-I3-4",
    ),
    cstep(
      "Superimposed dead load deflection",
      "Δ{SDL}",
      chosen.superDead,
      "length",
      "Manual Table 3-23",
      "5w{SDL}L⁴ / (384EI)",
    ),
    cstep(
      "Live load deflection",
      "Δ{LL}",
      chosen.live,
      "length",
      "Manual Table 3-23",
      "5w{L}L⁴ / (384EI)",
      `limit L/${i.liveLimit}`,
    ),
    cstep(
      "Total deflection after camber",
      "Δ{TL}",
      chosen.total,
      "length",
      "§L3",
      i.shored ? "Δ{D} + Δ{SDL} + Δ{LL}" : "Δ{wet} − camber + Δ{SDL} + Δ{LL}",
      `limit L/${i.totalLimit}`,
    ),
  );

  return {
    shape,
    material: mat,
    width,
    Ec,
    Ycon,
    loads,
    construction,
    composite: {
      flexure: chosen.flexure,
      elastic: chosen.elastic,
      Mu,
      Vu,
      capacity: chosen.capacity,
      mRatio: chosen.checks[0]!.ratio,
      shear,
      shearCapacity,
      vRatio: Vu.value / shearCapacity,
    },
    studs: {
      strength: stud,
      layout,
      nPerHalf: chosen.n,
      total: 2 * chosen.n,
      auto: i.studsPerHalf === undefined,
      nMinComposite,
      nForStrength,
      nFull,
      groups: chosen.sp.groups,
      spacing: chosen.sp.s,
    },
    deflection: {
      basis: i.deflectionBasis,
      I: chosen.I,
      Is,
      wet,
      camberRaw,
      camber,
      dead: chosen.dead,
      superDead: chosen.superDead,
      live: chosen.live,
      total: chosen.total,
      liveAllow: chosen.liveAllow,
      totalAllow: chosen.totalAllow,
      steps: dSteps,
    },
    detailing,
    checks,
    ratio: worst.ratio,
    governing: failedDetail ? failedDetail.name : worst.name,
    pass,
    warnings,
  };
}

/** Rank W-shapes by weight, each with the minimum number of anchors that satisfies every check. */
export function sweepComposite(
  shapes: readonly Shape[],
  input: CompositeDesignInput,
): { candidates: CompositeDesign[]; skipped: { shape: Shape; reason: string }[] } {
  const candidates: CompositeDesign[] = [],
    skipped: { shape: Shape; reason: string }[] = [];
  const i = { ...input, studsPerHalf: undefined };
  for (const shape of shapes) {
    if (shape.type !== "W") continue;
    try {
      candidates.push(checkComposite(shape, i));
    } catch (error) {
      if (error instanceof Error) skipped.push({ shape, reason: error.message });
      else throw error;
    }
  }
  candidates.sort(
    (a, b) =>
      req(a.shape, "W") - req(b.shape, "W") || a.studs.total - b.studs.total || req(a.shape, "d") - req(b.shape, "d"),
  );
  return { candidates, skipped };
}
