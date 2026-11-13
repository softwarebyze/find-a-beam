/**
 * Supported-beam checks at a simple shear connection — Manual Part 9 (coped beams) and AISC 360-22 §J4.
 * Single (top) cope: Manual Eqs. 9-6 to 9-14 (Dowswell, 15th/16th Ed. procedure).
 * Double cope: Cheng–Yura lateral-torsional model (fd) or the plate-buckling Q method.
 */
import { E } from "@/data/materials";
import { req, type Shape } from "@/data/shapes";
import type { Material } from "@/data/materials";
import type { CalcStep, DesignMethod, LimitState } from "../../types";
import type { ConnectionResult } from "../types";
import { connectionResult, limitState, netWidth, PHI, positive, scaled, type HoleSize } from "./common";
import type { ConnectionKit } from "./kit";
import type { CopeInput } from "./types";

interface Rect {
  b: number;
  h: number;
  /** Bottom of rectangle measured up from the bottom fiber */
  y0: number;
}

export interface CopedSection {
  kind: CopeInput["kind"];
  /** Depth of the remaining section, in. */
  ho: number;
  Snet: number;
  Znet: number;
  /** Elastic neutral axis from the bottom fiber */
  ybar: number;
}

function sectionOf(rects: Rect[]): { Snet: number; Znet: number; ybar: number; h: number } {
  const A = rects.reduce((s, r) => s + r.b * r.h, 0);
  const h = Math.max(...rects.map((r) => r.y0 + r.h));
  const ybar = rects.reduce((s, r) => s + r.b * r.h * (r.y0 + r.h / 2), 0) / A;
  const I = rects.reduce((s, r) => s + (r.b * r.h ** 3) / 12 + r.b * r.h * (r.y0 + r.h / 2 - ybar) ** 2, 0);
  const Snet = I / Math.max(ybar, h - ybar);
  // Plastic neutral axis: equal areas above and below.
  let below = 0,
    ypna = 0;
  for (const r of [...rects].sort((p, q) => p.y0 - q.y0)) {
    const a = r.b * r.h;
    if (below + a >= A / 2) {
      ypna = r.y0 + (A / 2 - below) / r.b;
      break;
    }
    below += a;
  }
  const Znet = rects.reduce((s, r) => {
    const lo = r.y0 - ypna,
      hi = r.y0 + r.h - ypna;
    const absMoment = lo >= 0 || hi <= 0 ? Math.abs(hi * hi - lo * lo) : lo * lo + hi * hi;
    return s + (r.b * absMoment) / 2;
  }, 0);
  return { Snet, Znet, ybar, h };
}

/** Net elastic and plastic section moduli at the cope (fillets neglected, Manual Table 9-2 basis). */
export function copedSection(beam: Shape, cope: CopeInput): CopedSection {
  const d = req(beam, "d"),
    tw = req(beam, "tw"),
    tf = req(beam, "tf"),
    bf = req(beam, "bf");
  if (cope.kind === "none") {
    const hw = d - 2 * tf;
    const s = sectionOf([
      { b: bf, h: tf, y0: 0 },
      { b: tw, h: hw, y0: tf },
      { b: bf, h: tf, y0: d - tf },
    ]);
    return { kind: "none", ho: d, ...s };
  }
  if (cope.kind === "top") {
    const ho = d - positive(cope.dct, "top cope depth");
    if (ho <= tf) throw new RangeError("Top cope removes the full web");
    const s = sectionOf([
      { b: bf, h: tf, y0: 0 },
      { b: tw, h: ho - tf, y0: tf },
    ]);
    return { kind: "top", ho, ...s };
  }
  const ho = d - positive(cope.dct, "top cope depth") - positive(cope.dcb, "bottom cope depth");
  if (!(ho > 0)) throw new RangeError("Copes leave no web depth");
  return { kind: "both", ho, Snet: (tw * ho ** 2) / 6, Znet: (tw * ho ** 2) / 4, ybar: ho / 2 };
}

/** Manual Part 9 inelastic plate-buckling reduction Q (λ with the 475/280 constants). */
export function plateBucklingQ(
  ho: number,
  t: number,
  c: number,
  Fy: number,
): { lambda: number; Q: number; steps: CalcStep[] } {
  const lambda = (ho * Math.sqrt(Fy)) / (10 * t * Math.sqrt(475 + 280 * (ho / c) ** 2));
  const Q = lambda <= 0.7 ? 1 : lambda <= 1.41 ? 1.34 - 0.486 * lambda : 1.3 / lambda ** 2;
  return {
    lambda,
    Q,
    steps: [
      {
        label: "Slenderness parameter",
        symbol: "λ",
        expr: "h{o}√F{y} / [10 t √(475 + 280(h{o}/c)²)]",
        value: lambda,
        ref: "Manual Part 9",
      },
      {
        label: "Buckling reduction factor",
        symbol: "Q",
        expr: lambda <= 0.7 ? "1 (λ ≤ 0.7)" : lambda <= 1.41 ? "1.34 − 0.486λ (0.7 < λ ≤ 1.41)" : "1.30/λ² (λ > 1.41)",
        value: Q,
        ref: "Manual Part 9",
      },
    ],
  };
}

/**
 * Flexural strength of the coped section expressed as an end reaction Rn = Mn/e, where e is the
 * distance from the support face (point of inflection) to the face of the cope (Manual Eq. 9-5).
 */
export function copeFlexure(
  beam: Shape,
  mat: Material,
  cope: CopeInput,
  e: number,
  method: DesignMethod,
): ConnectionResult {
  if (cope.kind === "none") throw new RangeError("Beam is not coped");
  const d = req(beam, "d"),
    tw = req(beam, "tw");
  const c = positive(cope.c, "cope length");
  positive(e, "cope eccentricity e");
  const { Fy } = mat;
  const sec = copedSection(beam, cope);
  const { ho, Snet, Znet } = sec;
  const pre: CalcStep[] = [
    { label: "Depth of the coped section", symbol: "h{o}", expr: cope.kind === "top" ? "d − d{c}" : "d − d{ct} − d{cb}", value: ho, quantity: "length", ref: "Manual Part 9" },
    { label: "Net elastic section modulus at the cope", symbol: "S{net}", value: Snet, quantity: "modulus", ref: "Manual Table 9-2 basis" },
    { label: "Net plastic section modulus at the cope", symbol: "Z{net}", value: Znet, quantity: "modulus", ref: "Manual Part 9" },
    { label: "Support face to face of cope", symbol: "e", expr: "c + setback", value: e, quantity: "length", ref: "Manual Eq. 9-5" },
  ];
  const warnings: string[] = [
    "Assumes the compression flange is laterally braced at the face of the cope and the connection element extends at least h{o}/2 (Manual Part 9).",
  ];
  const limitStates: LimitState[] = [];
  if (cope.kind === "top") {
    const cd = c / d,
      ch = c / ho;
    const f = cd <= 1 ? 2 * cd : Math.min(1 + cd, 3);
    const k = ch <= 1 ? 2.2 * (ho / c) ** 1.65 : (2.2 * ho) / c;
    const k1 = Math.max(f * k, 1.61);
    const lambda = ho / tw;
    const lambdaP = 0.475 * Math.sqrt((k1 * E) / Fy);
    const Mp = Fy * Znet,
      My = Fy * Snet;
    const steps: CalcStep[] = [
      { label: "Buckling adjustment factor", symbol: "f", expr: cd <= 1 ? "2c/d (c/d ≤ 1.0)" : "1 + c/d ≤ 3 (c/d > 1.0)", value: f, ref: cd <= 1 ? "Manual Eq. 9-14a" : "Manual Eq. 9-14b" },
      { label: "Plate buckling coefficient", symbol: "k", expr: ch <= 1 ? "2.2(h{o}/c)^1.65 (c/h{o} ≤ 1.0)" : "2.2h{o}/c (c/h{o} > 1.0)", value: k, ref: ch <= 1 ? "Manual Eq. 9-13a" : "Manual Eq. 9-13b" },
      { label: "Modified plate buckling coefficient", symbol: "k{1}", expr: "fk ≥ 1.61", value: k1, ref: "Manual Eq. 9-10" },
      { label: "Web slenderness of coped section", symbol: "λ", expr: "h{o}/t{w}", value: lambda, ref: "Manual Eq. 9-11" },
      { label: "Compact limit", symbol: "λ{p}", expr: "0.475√(k{1}E/F{y})", value: lambdaP, ref: "Manual Eq. 9-12" },
      { label: "Plastic moment of coped section", symbol: "M{p}", expr: "F{y}Z{net}", value: Mp, quantity: "moment" },
      { label: "Yield moment of coped section", symbol: "M{y}", expr: "F{y}S{net}", value: My, quantity: "moment" },
    ];
    let Mn: number;
    if (lambda <= lambdaP) {
      Mn = Mp;
      steps.push({ label: "Compact cope (λ ≤ λp)", symbol: "M{n}", expr: "M{p}", value: Mn, quantity: "moment", ref: "Manual Eq. 9-6" });
    } else if (lambda <= 2 * lambdaP) {
      Mn = Mp - (Mp - My) * (lambda / lambdaP - 1);
      steps.push({ label: "Inelastic local buckling (λp < λ ≤ 2λp)", symbol: "M{n}", expr: "M{p} − (M{p} − M{y})(λ/λ{p} − 1)", value: Mn, quantity: "moment", ref: "Manual Eq. 9-7" });
    } else {
      const Fcr = (0.903 * E * k1) / lambda ** 2;
      Mn = Fcr * Snet;
      steps.push(
        { label: "Elastic buckling stress", symbol: "F{cr}", expr: "0.903Ek{1}/λ²", value: Fcr, quantity: "stress", ref: "Manual Eq. 9-9" },
        { label: "Elastic local buckling (λ > 2λp)", symbol: "M{n}", expr: "F{cr}S{net}", value: Mn, quantity: "moment", ref: "Manual Eq. 9-8" },
      );
    }
    steps.push({ label: "Equivalent end reaction", symbol: "R{n}", expr: "M{n}/e", value: Mn / e, quantity: "force", ref: "Manual Eq. 9-5" });
    limitStates.push(limitState("CF", "Flexural yielding and local buckling of the coped section", "Manual Part 9", Mn / e, PHI.flexure, steps));
  } else {
    const steps: CalcStep[] = [];
    let Fcr: number;
    const dc = cope.dct;
    if (c <= 2 * d && dc <= 0.2 * d) {
      const fd = 3.5 - 7.5 * (dc / d);
      const Fe = (0.62 * Math.PI * E * tw ** 2 * fd) / (c * ho);
      Fcr = Math.min(Fe, Fy);
      steps.push(
        { label: "Adjustment factor (c ≤ 2d, d{c} ≤ 0.2d)", symbol: "f{d}", expr: "3.5 − 7.5(d{c}/d)", value: fd, ref: "Manual Part 9, double cope" },
        { label: "Critical stress", symbol: "F{cr}", expr: "0.62πE t{w}² f{d}/(c h{o}) ≤ F{y}", value: Fcr, quantity: "stress", ref: "Manual Part 9, double cope" },
      );
    } else {
      const q = plateBucklingQ(ho, tw, c, Fy);
      Fcr = Fy * q.Q;
      steps.push(...q.steps, { label: "Critical stress (c > 2d or d{c} > 0.2d)", symbol: "F{cr}", expr: "F{y}Q", value: Fcr, quantity: "stress", ref: "Manual Part 9" });
    }
    const Mn = Fcr * Snet;
    steps.push(
      { label: "Nominal flexural strength", symbol: "M{n}", expr: "F{cr}S{net}", value: Mn, quantity: "moment", ref: "Manual Part 9" },
      { label: "Equivalent end reaction", symbol: "R{n}", expr: "M{n}/e", value: Mn / e, quantity: "force", ref: "Manual Eq. 9-5" },
    );
    limitStates.push(limitState("CF", "Flexural yielding and local web buckling of the double-coped section", "Manual Part 9", Mn / e, PHI.flexure, steps));
    if (cope.dcb !== cope.dct) warnings.push("Unequal cope depths: d{c} is taken as the top (compression) cope depth.");
  }
  return connectionResult(
    cope.kind === "top" ? "Manual Part 9 · beam coped at the top flange" : "Manual Part 9 · beam coped at both flanges",
    limitStates,
    method,
    pre,
    warnings,
  );
}

/** Gross shear area of the web at the connection: tw × ho (coped) or tw × d. */
export function webShearYielding(
  kit: ConnectionKit,
  beam: Shape,
  mat: Material,
  cope: CopeInput,
  method: DesignMethod,
  overDepth?: number,
): ConnectionResult {
  const tw = req(beam, "tw");
  const ho = overDepth ?? copedSection(beam, cope).ho;
  const Agv = tw * ho;
  const r = kit.elementShearYielding({ Fy: mat.Fy, Fu: mat.Fu, Agv });
  const ls = scaled(r, "WSY", "Shear yielding of the beam web", 1);
  ls.steps.unshift({
    label: overDepth !== undefined ? "Gross shear area along the connection" : "Gross shear area of web",
    symbol: "A{gv}",
    expr: overDepth !== undefined ? "t{w} l" : cope.kind === "none" ? "t{w} d" : "t{w} h{o}",
    value: Agv,
    quantity: "area",
    ref: "§J4.2",
  });
  return connectionResult("§J4.2(a) · supported beam web", [ls], method);
}

export function webShearRupture(
  kit: ConnectionKit,
  beam: Shape,
  mat: Material,
  cope: CopeInput,
  n: number,
  hole: HoleSize,
  method: DesignMethod,
): ConnectionResult {
  const tw = req(beam, "tw");
  const ho = copedSection(beam, cope).ho;
  const Anv = tw * (ho - n * netWidth(hole.y));
  if (!(Anv > 0)) throw new RangeError("Bolt holes remove the full web depth");
  const r = kit.elementShearRupture({ Fy: mat.Fy, Fu: mat.Fu, Anv });
  const ls = scaled(r, "WSR", "Shear rupture of the beam web at the bolt line", 1);
  ls.steps.unshift({
    label: "Net shear area at bolt line",
    symbol: "A{nv}",
    expr: `t{w}[${cope.kind === "none" ? "d" : "h{o}"} − n(d{h} + 1/16)]`,
    value: Anv,
    quantity: "area",
    ref: "§B4.3b",
  });
  return connectionResult("§J4.2(b) · supported beam web", [ls], method);
}

/**
 * Block shear of a coped beam web: vertical shear plane through the far bolt line up to the cope,
 * horizontal tension plane to the beam end. Ubs = 0.5 for two or more bolt lines (Commentary §J4.3).
 */
export function webBlockShear(
  kit: ConnectionKit,
  beam: Shape,
  mat: Material,
  geom: { Lev: number; n: number; s: number; Leh: number; cols: number; g: number },
  hole: HoleSize,
  method: DesignMethod,
): ConnectionResult {
  const tw = req(beam, "tw");
  const { Lev, n, s, Leh, cols, g } = geom;
  const Agv = (Lev + (n - 1) * s) * tw;
  const Anv = Agv - (n - 0.5) * netWidth(hole.y) * tw;
  const Ant = (Leh + (cols - 1) * g - (cols - 0.5) * netWidth(hole.x)) * tw;
  const Ubs = cols > 1 ? 0.5 : 1;
  return blockShearResult(kit, "WBS", "Block shear rupture of the coped beam web", { Agv, Anv, Ant, Ubs }, mat, method, "§J4.3 · coped beam web");
}

export function blockShearResult(
  kit: ConnectionKit,
  id: string,
  name: string,
  areas: { Agv: number; Anv: number; Ant: number; Ubs: number },
  mat: Material,
  method: DesignMethod,
  section: string,
  exprs: { Agv?: string; Anv?: string; Ant?: string } = {},
): ConnectionResult {
  const { Agv, Anv, Ant, Ubs } = areas;
  if (!(Anv > 0) || !(Ant > 0)) throw new RangeError("Edge distances leave no net area for block shear");
  const r = kit.elementBlockShear({ Agv, Anv, Ant, Fy: mat.Fy, Fu: mat.Fu, Ubs, method });
  const ls = scaled(r, id, name, 1);
  ls.steps.unshift(
    { label: "Gross area in shear", symbol: "A{gv}", expr: exprs.Agv ?? "[L{ev} + (n − 1)s] t", value: Agv, quantity: "area", ref: "§J4.3" },
    { label: "Net area in shear", symbol: "A{nv}", expr: exprs.Anv ?? "A{gv} − (n − 0.5)(d{h} + 1/16) t", value: Anv, quantity: "area", ref: "§J4.3" },
    { label: "Net area in tension", symbol: "A{nt}", expr: exprs.Ant ?? "[L{eh} − 0.5(d{h} + 1/16)] t", value: Ant, quantity: "area", ref: "§J4.3" },
    { label: "Tension stress distribution factor", symbol: "U{bs}", value: Ubs, ref: "§J4.3" },
  );
  return connectionResult(section, [ls], method);
}
