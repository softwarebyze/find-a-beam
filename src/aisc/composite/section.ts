/**
 * Composite section strength and stiffness — AISC 360-22 §I3.2a (plastic stress distribution),
 * Manual Tables 3-19 (φMn vs. PNA location and Y2) and 3-20 (lower-bound moment of inertia),
 * Commentary §I3.2 (effective moment of inertia for partial composite action).
 */
import { E } from "@/data/materials";
import { req, type Shape } from "@/data/shapes";
import { RESISTANCE } from "../common";
import { UnsupportedError, type CalcStep } from "../types";
import { cstep, effectiveConcreteThickness, slabDepth } from "./slab";
import type {
  CompositeFlexureResult,
  ElasticProps,
  PlasticState,
  PnaRow,
  SlabGeometry,
  ConcreteProps,
  Table319Row,
} from "./types";

interface Steel {
  As: number;
  d: number;
  bf: number;
  tf: number;
  tw: number;
  Ix: number;
}

function steelOf(shape: Shape): Steel {
  if (shape.type !== "W")
    throw new UnsupportedError(`${shape.label}: composite beam design is implemented for W-shapes`);
  return {
    As: req(shape, "A"),
    d: req(shape, "d"),
    bf: req(shape, "bf"),
    tf: req(shape, "tf"),
    tw: req(shape, "tw"),
    Ix: req(shape, "Ix"),
  };
}

/** Area of steel in compression above a depth Y1 below the top of steel (flange idealized as bf × tf). */
function y1FromCompressionArea(s: Steel, Acs: number): { Y1: number; yC: number; pna: "flange" | "web" } {
  const Af = s.bf * s.tf;
  if (Acs <= Af + 1e-12) {
    const Y1 = Acs / s.bf;
    return { Y1, yC: Y1 / 2, pna: "flange" };
  }
  const hw = (Acs - Af) / s.tw;
  return { Y1: s.tf + hw, yC: (Af * (s.tf / 2) + s.tw * hw * (s.tf + hw / 2)) / Acs, pna: "web" };
}

/**
 * Plastic stress distribution for concrete force C acting at Y2 above the top of steel.
 * Moments about the top of steel give Mn = Fy As d/2 + C Y2 − 2 Cs yC (doubly symmetric W-shape).
 */
export function plasticState(shape: Shape, Fy: number, C: number, Y2: number): PlasticState {
  const s = steelOf(shape),
    Py = s.As * Fy;
  if (C >= Py - 1e-9) {
    return { C: Py, Cs: 0, T: Py, Y1: 0, Y2, yC: 0, yT: s.d / 2, pna: "slab", Mn: Py * (s.d / 2 + Y2) };
  }
  const Cs = (Py - C) / 2;
  const { Y1, yC, pna } = y1FromCompressionArea(s, Cs / Fy);
  const T = C + Cs;
  const yT = (Py * (s.d / 2) - Cs * yC) / T;
  return { C, Cs, T, Y1, Y2, yC, yT, pna, Mn: Py * (s.d / 2) - 2 * Cs * yC + C * Y2 };
}

/** The seven PNA locations of Manual Table 3-19: TFL, quarter points of tf, BFL, and two web points. */
export function pnaRows(shape: Shape, Fy: number): PnaRow[] {
  const s = steelOf(shape),
    Py = s.As * Fy;
  const flange = (["TFL", "2", "3", "4", "BFL"] as const).map((point, k) => {
    const Y1 = (k * s.tf) / 4;
    return { point, Y1, sumQn: Py - 2 * Fy * s.bf * Y1 };
  });
  const q5 = flange[4]!.sumQn,
    q7 = 0.25 * Py,
    q6 = (q5 + q7) / 2;
  const web = (
    [
      ["6", q6],
      ["7", q7],
    ] as const
  ).map(([point, sumQn]) => ({ point, sumQn, Y1: y1FromCompressionArea(s, (Py - sumQn) / (2 * Fy)).Y1 }));
  return [...flange, ...web];
}

/** Lower-bound moment of inertia (Manual Part 3, Table 3-20): concrete force ΣQn acting at d1 = Y2. */
export function lowerBoundI(shape: Shape, Fy: number, sumQn: number, Y2: number): { ILB: number; YENA: number } {
  const s = steelOf(shape),
    d3 = s.d / 2,
    Aeq = sumQn / Fy;
  const YENA = (s.As * d3 + Aeq * (2 * d3 + Y2)) / (s.As + Aeq);
  return { YENA, ILB: s.Ix + s.As * (YENA - d3) ** 2 + Aeq * (2 * d3 + Y2 - YENA) ** 2 };
}

/** Manual Table 3-19 / 3-20 rows for one W-shape at the given Y2 values. */
export function table319(shape: Shape, Fy: number, Y2s: readonly number[]): Table319Row[] {
  return pnaRows(shape, Fy).map((r) => ({
    ...r,
    Mn: Y2s.map((Y2) => plasticState(shape, Fy, r.sumQn, Y2).Mn),
    ILB: Y2s.map((Y2) => lowerBoundI(shape, Fy, r.sumQn, Y2).ILB),
  }));
}

/** Plastic web slenderness limit of §I3.2a(a): h/tw ≤ 3.76 √(E/Fy). */
export function plasticWebLimit(Fy: number): number {
  return 3.76 * Math.sqrt(E / Fy);
}

export interface CompositeFlexureInput {
  shape: Shape;
  Fy: number;
  /** Effective width, in. */
  b: number;
  slab: SlabGeometry;
  concrete: ConcreteProps;
  /** ΣQn between the point of maximum positive moment and zero moment, kips */
  sumQn: number;
}

/** Positive flexural strength of a composite beam with steel headed stud anchors, §I3.2a(a). */
export function compositeFlexure(i: CompositeFlexureInput): CompositeFlexureResult {
  const s = steelOf(i.shape),
    { Fy } = i;
  const htw = req(i.shape, "h/tw"),
    limit = plasticWebLimit(Fy);
  if (htw > limit)
    throw new UnsupportedError(
      `${i.shape.label}: h/tw = ${htw.toFixed(1)} > 3.76√(E/Fy) = ${limit.toFixed(1)}; §I3.2a(b) elastic superposition is not implemented`,
    );
  const Ycon = slabDepth(i.slab),
    tcEff = effectiveConcreteThickness(i.slab);
  const Ac = i.b * tcEff;
  const Cconc = 0.85 * i.concrete.fc * Ac,
    Csteel = s.As * Fy,
    sumQn = Math.max(0, i.sumQn);
  const Cf = Math.min(Cconc, Csteel);
  const C = Math.min(Cconc, Csteel, sumQn);
  const controls = C === sumQn && sumQn < Cf ? "anchors" : Cconc <= Csteel ? "concrete" : "steel";
  const a = C / (0.85 * i.concrete.fc * i.b);
  const Y2 = Ycon - a / 2;
  const p = plasticState(i.shape, Fy, C, Y2);
  const ratio = Cf > 0 ? Math.min(1, sumQn / Cf) : 0;
  const steps: CalcStep[] = [
    cstep(
      "Web slenderness",
      "h/t{w}",
      htw,
      "ratio",
      "§I3.2a(a)",
      undefined,
      `≤ 3.76√(E/F{y}) = ${limit.toFixed(2)} — plastic stress distribution permitted`,
    ),
    cstep("Top of steel to top of slab", "Y{con}", Ycon, "length", i.slab.kind === "solid" ? "§I3.1" : "§I3.2c"),
    cstep(
      "Concrete thickness resisting compression",
      "t{c}",
      tcEff,
      "length",
      i.slab.kind === "deck-perpendicular" ? "§I3.2c(2)" : i.slab.kind === "deck-parallel" ? "§I3.2c(3)" : "§I3.1",
      undefined,
      i.slab.kind === "deck-perpendicular"
        ? "concrete below the top of the deck neglected"
        : i.slab.kind === "deck-parallel"
          ? "concrete within the ribs conservatively neglected"
          : undefined,
    ),
    cstep("Area of concrete slab within the effective width", "A{c}", Ac, "area", "§I3.2d(1)", "b t{c}"),
    cstep("Concrete crushing", "0.85f′{c}A{c}", Cconc, "force", "Eq. I3-1a"),
    cstep("Tensile yielding of the steel section", "F{y}A{s}", Csteel, "force", "Eq. I3-1b"),
    cstep("Strength of steel anchors", "ΣQ{n}", sumQn, "force", "Eq. I3-1c"),
    cstep(
      "Compression force in the concrete",
      "C",
      C,
      "force",
      "§I3.2d(1)",
      "min(0.85f′{c}A{c}, F{y}A{s}, ΣQ{n})",
      `controlled by ${controls === "anchors" ? "steel anchors (partial composite)" : controls === "concrete" ? "concrete crushing" : "steel yielding"}`,
    ),
    cstep(
      "Degree of composite action",
      "ΣQ{n}/C{f}",
      ratio,
      "ratio",
      "Commentary §I3.2",
      undefined,
      ratio < 0.25 ? "below the 25 % recommended minimum" : undefined,
    ),
  ];
  const lsSteps: CalcStep[] = [
    cstep("Depth of the concrete compression block", "a", a, "length", "Commentary §I3.2a", "C / (0.85f′{c} b)"),
    cstep("Top of steel to concrete force", "Y{2}", Y2, "length", "Manual Table 3-19", "Y{con} − a/2"),
  ];
  if (p.pna === "slab")
    lsSteps.push(
      cstep(
        "Plastic neutral axis in the slab",
        "a",
        a,
        "length",
        "§I3.2a(a)",
        undefined,
        "steel section fully in tension",
      ),
      cstep("Nominal flexural strength", "M{n}", p.Mn, "moment", "§I3.2a(a)", "F{y}A{s}(d/2 + Y{2})"),
    );
  else
    lsSteps.push(
      cstep("Compression force in the steel section", "C{s}", p.Cs, "force", "§I3.2a(a)", "(F{y}A{s} − C) / 2"),
      cstep(
        `Plastic neutral axis in the ${p.pna}, below top of steel`,
        "Y{1}",
        p.Y1,
        "length",
        "Manual Table 3-19",
        p.pna === "flange" ? "C{s} / (F{y} b{f})" : "t{f} + (C{s}/F{y} − b{f}t{f}) / t{w}",
      ),
      cstep("Depth of steel compression resultant", "y{C}", p.yC, "length", "§I3.2a(a)"),
      cstep("Tension force in the steel section", "T", p.T, "force", "§I3.2a(a)", "C + C{s}"),
      cstep("Nominal flexural strength", "M{n}", p.Mn, "moment", "§I3.2a(a)", "F{y}A{s} d/2 + C Y{2} − 2C{s} y{C}"),
    );
  return {
    kind: "flexure",
    quantity: "moment",
    nominal: p.Mn,
    phi: RESISTANCE.flexure.phi,
    omega: RESISTANCE.flexure.omega,
    governing: "PSD",
    limitStates: [{ id: "PSD", name: "Plastic stress distribution", ref: "§I3.2a(a)", nominal: p.Mn, steps: lsSteps }],
    section: "§I3.2a Positive flexural strength — composite beam with steel headed stud anchors",
    steps,
    warnings:
      ratio < 0.25 && sumQn < Cf
        ? ["Degree of composite action is below the 25 % minimum recommended in the Commentary to §I3.2d."]
        : [],
    Cconc,
    Csteel,
    sumQn,
    Cf,
    ratio,
    controls,
    a,
    Ycon,
    plastic: p,
  };
}

/** Elastic properties for deflection: transformed Itr, lower-bound ILB, and effective Ieff (Commentary Eq. C-I3-4). */
export function elasticProps(
  shape: Shape,
  Fy: number,
  b: number,
  slab: SlabGeometry,
  Ec: number,
  flex: Pick<CompositeFlexureResult, "plastic" | "sumQn" | "Cf">,
): ElasticProps {
  const s = steelOf(shape);
  const n = E / Ec;
  const tc = effectiveConcreteThickness(slab),
    Ycon = slabDepth(slab);
  const bt = b / n,
    yS = Ycon + s.d / 2;
  let x = tc,
    ybar = (bt * tc * (tc / 2) + s.As * yS) / (bt * tc + s.As);
  if (ybar < tc) {
    x = (-s.As + Math.sqrt(s.As ** 2 + 2 * bt * s.As * yS)) / bt;
    ybar = x;
  }
  const Itr = s.Ix + s.As * (yS - ybar) ** 2 + (bt * x ** 3) / 12 + bt * x * (ybar - x / 2) ** 2;
  const { ILB, YENA } = lowerBoundI(shape, Fy, flex.plastic.C, flex.plastic.Y2);
  const eta = flex.Cf > 0 ? Math.min(1, flex.sumQn / flex.Cf) : 0;
  const Ieff = s.Ix + Math.sqrt(eta) * (Itr - s.Ix);
  const steps: CalcStep[] = [
    cstep("Modular ratio", "n", n, "ratio", "§I3.1", "E / E{c}"),
    cstep(
      "Transformed moment of inertia (full composite)",
      "I{tr}",
      Itr,
      "inertia",
      "Commentary §I3.2",
      undefined,
      x < tc ? "ENA within the slab — concrete below the ENA cracked" : "ENA below the slab",
    ),
    cstep(
      "Lower-bound elastic neutral axis, above bottom of steel",
      "Y{ENA}",
      YENA,
      "length",
      "Manual Table 3-20",
      "[A{s}d/2 + (ΣQ{n}/F{y})(d + Y{2})] / [A{s} + ΣQ{n}/F{y}]",
    ),
    cstep(
      "Lower-bound moment of inertia",
      "I{LB}",
      ILB,
      "inertia",
      "Manual Table 3-20",
      "I{x} + A{s}(Y{ENA} − d/2)² + (ΣQ{n}/F{y})(d + Y{2} − Y{ENA})²",
    ),
    cstep(
      "Effective moment of inertia",
      "I{eff}",
      Ieff,
      "inertia",
      "Commentary Eq. C-I3-4",
      "I{s} + √(ΣQ{n}/C{f})(I{tr} − I{s})",
    ),
  ];
  return { n, Itr, ytr: ybar, ILB, YENA, Ieff, steps };
}
