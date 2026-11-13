/**
 * Brace members and brace-to-gusset connections — AISC Manual (16th Ed.) Part 13; ANSI/AISC 360-22
 * §§D2, D3 (Table D3.1), J2, J3, J4. Units: kip, in., ksi.
 *
 * Supported braces (connection in the plane of the gusset):
 *  - HSS (rectangular or round), slotted over a single concentric gusset, four longitudinal fillet welds.
 *  - Double angle (2L) straddling the gusset, bolted (double shear) or welded at heel and toe.
 *  - WT with the flange against the gusset, bolted (two lines straddling the stem) or welded at the flange tips.
 *  - W-shape with the web against the gusset, bolted (single shear).
 */
import { familyOf, findShape, num, req, type Shape } from "@/data/shapes";
import type { Material } from "@/data/materials";
import type { CalcStep, DesignMethod } from "../../types";
import { blockShear, shearLagReport, type ShearLagInput } from "../../tension";
import {
  boltBearing,
  boltShear,
  elementShearRupture,
  elementTensionRupture,
  elementTensionYielding,
  filletWeld,
  minEdgeDistance,
  minSpacing,
  nominalHoleDiameter,
  type BoltSpec,
  type ConnectionResult,
} from "@/aisc/connections";
import { connection, count, positive, state } from "../result";
import { connectionCheck, type ConnectionCheck } from "../concentrated-forces";

export type BraceKind = "hss-rect" | "hss-round" | "2L" | "WT" | "W";

export function braceKindOf(s: Shape): BraceKind | undefined {
  const f = familyOf(s);
  if (f === "hss-rect") return "hss-rect";
  if (f === "hss-round" || f === "pipe") return "hss-round";
  if (f === "double-angle") return "2L";
  if (f === "tee") return "WT";
  if (f === "i-shape") return "W";
  return undefined;
}

export type BraceAttachment =
  | {
      kind: "bolted";
      bolt: BoltSpec;
      /** Bolts per line along the brace */
      rows: number;
      /** Bolt lines across the brace (2L: 1–2 in the connected leg; WT: 2; W: ≥ 2) */
      lines: number;
      pitch: number;
      /** Spacing between bolt lines, in. (WT: gage across the stem) */
      lineGage: number;
      /** 2L only: gage from the heel to the first bolt line (default: Manual Table 1-7A workable gage) */
      heelGage?: number;
      /** End distance on the brace from the brace end to the first bolt row, in. */
      braceEnd: number;
    }
  | {
      kind: "welded";
      /** Fillet weld leg size, in. */
      w: number;
      /** Length of each longitudinal weld, in. */
      length: number;
      FEXX?: number;
      /** HSS only: slot width minus gusset thickness, in. (default 1/8) */
      slotClearance?: number;
    };

/** Manual Table 1-7A workable gage for a single line in an angle leg, in. */
export function workableGage(leg: number): number {
  const table: [number, number][] = [
    [8, 4.5],
    [7, 4],
    [6, 3.5],
    [5, 3],
    [4, 2.5],
    [3.5, 2],
    [3, 1.75],
    [2.5, 1.375],
    [2, 1.125],
  ];
  for (const [l, g] of table) if (leg >= l - 1e-9) return g;
  return leg / 2;
}

/** Single angle making up a 2L, and the connected (back-to-back) leg length and x̄ perpendicular to it. */
export function doubleAngleParts(s: Shape): { single: Shape; leg: number; outstanding: number; t: number; xBar: number; ybar: number } {
  const m = /^2(L[\d.\-/]+X[\d.\-/]+X[\d.\-/]+)/.exec(s.label);
  const single = m ? findShape(m[1]!) : undefined;
  if (!single) throw new RangeError(`Cannot resolve the single angle of ${s.label}`);
  const leg = req(s, "d"),
    outstanding = req(s, "b"),
    t = req(s, "t");
  const longLeg = Math.max(req(single, "b"), req(single, "d"));
  const connectedIsLong = Math.abs(leg - longLeg) < 1e-6;
  // Shapes Database: x is measured from the back of the long leg, y from the back of the short leg.
  const xBar = connectedIsLong ? req(single, "x") : req(single, "y");
  return { single, leg, outstanding, t, xBar, ybar: req(s, "y") };
}

export interface BraceGeometry {
  kind: BraceKind;
  /** In-plane footprint across the brace axis (relative to the connection centerline), in. */
  wMin: number;
  wMax: number;
  /** Connection band across the axis used for the Whitmore spread, in. */
  cMin: number;
  cMax: number;
  /** Connection length l (first to last bolt row, or weld length), in. */
  l: number;
  /** Distance from the brace end to the Whitmore section along the axis, in. */
  endToWhitmore: number;
  /** Bolt coordinates (s along the axis from the Whitmore section toward the brace, w across), in. */
  bolts: { s: number; w: number }[];
  /** Weld lines (w positions), welded braces */
  weldLines: number[];
  /** Bolt hole diameter, in. */
  dh?: number;
  /** Lines and rows (bolted) */
  lines: number;
  rows: number;
}

export function braceGeometry(brace: Shape, at: BraceAttachment): BraceGeometry {
  const kind = braceKindOf(brace);
  if (!kind) throw new RangeError("Brace must be an HSS, pipe, double angle, WT or W-shape");
  if (kind.startsWith("hss") && at.kind !== "welded") throw new RangeError("HSS braces are slotted and welded to the gusset in this module");
  if (kind === "W" && at.kind !== "bolted") throw new RangeError("W-shape braces are web-bolted to the gusset in this module");
  let wMin: number, wMax: number, cMin: number, cMax: number;
  const bolts: { s: number; w: number }[] = [];
  const weldLines: number[] = [];
  if (at.kind === "bolted") {
    const rows = count(at.rows, "Bolts per line"),
      lines = count(at.lines, "Bolt lines");
    if (rows < 2) throw new RangeError("Provide at least two bolts per line (Table D3.1 shear lag requires a connection length)");
    const s = positive(at.pitch, "Pitch"),
      gl = lines > 1 ? positive(at.lineGage, "Bolt line spacing") : 0;
    const spread = (lines - 1) * gl;
    cMin = -spread / 2;
    cMax = spread / 2;
    if (kind === "2L") {
      const { leg } = doubleAngleParts(brace);
      const g1 = at.heelGage ?? workableGage(leg);
      const heel = -(g1 + spread / 2);
      wMin = heel;
      wMax = heel + leg;
      if (g1 + spread >= leg) throw new RangeError("Bolt lines do not fit in the connected angle leg");
    } else if (kind === "WT") {
      if (lines !== 2) throw new RangeError("WT flange connections use two bolt lines straddling the stem");
      const bf = req(brace, "bf");
      wMin = -bf / 2;
      wMax = bf / 2;
      if (gl >= bf) throw new RangeError("Gage exceeds the WT flange width");
    } else {
      if (lines < 2) throw new RangeError("Use at least two bolt lines in the W-shape web");
      const d = req(brace, "d");
      wMin = -d / 2;
      wMax = d / 2;
      const T = num(brace, "T") ?? d - 2 * req(brace, "kdes");
      if (spread > T - 2 * minEdgeDistance(at.bolt.d)) throw new RangeError("Bolt lines do not fit within the W-shape web clear depth T");
    }
    for (let j = 0; j < lines; j++) for (let i = 0; i < rows; i++) bolts.push({ s: i * s, w: cMin + j * gl });
    return { kind, wMin, wMax, cMin, cMax, l: (rows - 1) * s, endToWhitmore: positive(at.braceEnd, "Brace end distance"), bolts, weldLines, dh: nominalHoleDiameter(at.bolt.d), lines, rows };
  }
  const l = positive(at.length, "Weld length");
  if (kind === "hss-rect") {
    const H = req(brace, "Ht");
    wMin = -H / 2;
    wMax = H / 2;
  } else if (kind === "hss-round") {
    const D = req(brace, "OD");
    wMin = -D / 2;
    wMax = D / 2;
  } else if (kind === "2L") {
    const { leg, ybar } = doubleAngleParts(brace);
    // Welded: brace axis at the centroid; heel at −ȳ.
    wMin = -ybar;
    wMax = leg - ybar;
  } else {
    const bf = req(brace, "bf");
    wMin = -bf / 2;
    wMax = bf / 2;
  }
  cMin = wMin;
  cMax = wMax;
  weldLines.push(wMin, wMax);
  return { kind, wMin, wMax, cMin, cMax, l, endToWhitmore: 0, bolts, weldLines, lines: 2, rows: 0 };
}

export interface BraceConnectionInput {
  method: DesignMethod;
  brace: Shape;
  braceMat: Material;
  gussetT: number;
  gussetFy: number;
  gussetFu: number;
  attachment: BraceAttachment;
  /** Required brace tension (≥ 0) and compression (≥ 0), kips */
  Pt: number;
  Pc: number;
  /** Bolted: distance from the bolt farthest from the WP to the gusset edge along the brace axis, in. */
  gussetEdge?: number;
}

export interface BraceConnectionChecks {
  checks: ConnectionCheck[];
  steps: CalcStep[];
  warnings: string[];
  Ag: number;
  An: number;
  Ae: number;
  U: number;
}

function sumBolts(name: string, ref: string, perBolt: { label: string; rn: number; count: number }[], extra: CalcStep[]): ConnectionResult {
  const total = perBolt.reduce((s, b) => s + b.rn * b.count, 0);
  const ls = state("BG", name, total, ref, "Σ min(r{nv}, r{n,bearing/tearout})");
  ls.steps = [
    ...extra,
    ...perBolt.map((b) => ({ label: `${b.label} (× ${b.count})`, symbol: "r{n}", value: b.rn, quantity: "force" as const, ref })),
    { label: "Bolt group nominal strength", symbol: "R{n}", value: total, quantity: "force", ref },
  ];
  return connection(`§J3.7, §J3.11 ${name}`, [ls]);
}

function blockShearResult(label: string, Agv: number, Anv: number, Ant: number, Fy: number, Fu: number, method: DesignMethod): ConnectionResult | undefined {
  if (!(Agv > 0) || !(Anv > 0) || !(Ant > 0)) return undefined;
  const bs = blockShear({ Agv, Anv, Ant, Fy, Fu, method });
  return connection(`§J4.3 Block shear — ${label}`, bs.limitStates, [
    { label: "Gross shear area", symbol: "A{gv}", value: Agv, quantity: "area", ref: "§J4.3" },
    { label: "Net shear area", symbol: "A{nv}", value: Anv, quantity: "area", ref: "§J4.3" },
    { label: "Net tension area", symbol: "A{nt}", value: Ant, quantity: "area", ref: "§J4.3" },
  ]);
}

/** Brace member end checks and brace-to-gusset connection checks. */
export function braceConnectionChecks(input: BraceConnectionInput, geo: BraceGeometry): BraceConnectionChecks {
  const { method, brace, braceMat, attachment: at } = input;
  const tg = positive(input.gussetT, "Gusset thickness");
  const { gussetFy: Fyg, gussetFu: Fug } = input;
  const P = Math.max(input.Pt, input.Pc);
  const { Fy, Fu } = braceMat;
  const kind = geo.kind;
  const checks: ConnectionCheck[] = [];
  const steps: CalcStep[] = [];
  const warnings: string[] = [];
  const Ag = req(brace, "A");
  let An = Ag,
    lag: { U: number; steps: CalcStep[] };

  if (at.kind === "bolted") {
    const dh = geo.dh!,
      dEff = dh + 1 / 16,
      s = at.pitch,
      rows = geo.rows,
      lines = geo.lines;
    const Le = at.braceEnd;
    const eg = input.gussetEdge ?? Infinity;
    // Ply thickness, planes, holes
    let tBrace: number, planes: number, holeArea: number;
    if (kind === "2L") {
      const { t } = doubleAngleParts(brace);
      tBrace = 2 * t;
      planes = 2;
      holeArea = lines * 2 * dEff * t;
      const { xBar } = doubleAngleParts(brace);
      lag = shearLagReport({ case: 8, fastenersPerLine: rows, xBar, length: (rows - 1) * s });
    } else if (kind === "WT") {
      const tf = req(brace, "tf");
      tBrace = tf;
      planes = 1;
      holeArea = lines * dEff * tf;
      const xBar = req(brace, "y"),
        length = (rows - 1) * s;
      const c: ShearLagInput =
        rows >= 3 ? { case: 7, connection: "flange", fastenersPerLine: rows, bf: req(brace, "bf"), d: 2 * req(brace, "d"), xBar, length } : { case: 2, xBar, length };
      lag = shearLagReport(c);
    } else {
      const tw = req(brace, "tw"),
        bf = req(brace, "bf"),
        tf = req(brace, "tf"),
        d = req(brace, "d");
      tBrace = tw;
      planes = 1;
      holeArea = lines * dEff * tw;
      // x̄ of the half-W (two channels split along the web), Commentary Fig. C-D3.1.
      const xBar = ((bf * bf * tf) / 4 + ((d - 2 * tf) * tw * tw) / 8) / (Ag / 2);
      const length = (rows - 1) * s;
      lag = shearLagReport(rows >= 4 ? { case: 7, connection: "web", fastenersPerLine: rows, bf, d, xBar, length } : { case: 2, xBar, length });
    }
    An = Ag - holeArea;
    steps.push({ label: "Brace net area at the bolt holes", symbol: "A{n}", value: An, quantity: "area", expr: "A{g} − Σ(d{h} + 1/16)t", ref: "§B4.3b" });
    // Bolt group strengths (tension and compression bearing paths)
    const shear = boltShear({ bolt: at.bolt, planes });
    const br = (t: number, F: number, lc: number) => boltBearing({ d: at.bolt.d, t, Fu: F, lc }).nominal;
    const big = 1e3;
    const rnOf = (tPly: number, F: number, lc: number) => Math.min(shear.nominal, br(tPly, F, lc));
    // Tension: brace tears toward its end (bolt nearest WP), gusset toward its free edge (bolt farthest from WP).
    const tension: { label: string; rn: number; count: number }[] = [];
    const interior = Math.min(rnOf(tBrace, Fu, s - dh), rnOf(tg, Fug, s - dh));
    if (rows >= 3) tension.push({ label: "Interior bolts", rn: interior, count: lines * (rows - 2) });
    tension.push({ label: "Bolt nearest brace end", rn: Math.min(rnOf(tBrace, Fu, Le - dh / 2), rnOf(tg, Fug, s - dh)), count: lines });
    tension.push({ label: "Bolt nearest gusset edge", rn: Math.min(rnOf(tBrace, Fu, s - dh), rnOf(tg, Fug, Number.isFinite(eg) ? eg - dh / 2 : big)), count: lines });
    const compression: { label: string; rn: number; count: number }[] = [
      { label: "Bolts bearing on interior spacing", rn: Math.min(rnOf(tBrace, Fu, s - dh), rnOf(tg, Fug, s - dh)), count: lines * (rows - 1) },
      { label: "Bolt with full bearing", rn: Math.min(rnOf(tBrace, Fu, big), rnOf(tg, Fug, big)), count: lines },
    ];
    const extra: CalcStep[] = [
      { label: "Bolt shear per bolt", symbol: "r{nv}", value: shear.nominal, quantity: "force", ref: "Eq. J3-1", note: `${planes} shear plane${planes > 1 ? "s" : ""}` },
      { label: "Brace ply thickness in bearing", symbol: "t", value: tBrace, quantity: "length", ref: "§J3.11" },
      { label: "Gusset thickness", symbol: "t{g}", value: tg, quantity: "length", ref: "§J3.11" },
    ];
    if (input.Pt > 0) checks.push(connectionCheck("BG-T", "Brace bolts — tension (shear, bearing, tearout)", input.Pt, sumBolts("Bolt group, brace in tension", "§J3.7; Eqs. J3-6a, J3-6c", tension, extra), method));
    if (input.Pc > 0) checks.push(connectionCheck("BG-C", "Brace bolts — compression (shear, bearing)", input.Pc, sumBolts("Bolt group, brace in compression", "§J3.7; Eq. J3-6a", compression, extra), method));
    // Block shear on the brace (tension)
    const Lv = Le + (rows - 1) * s;
    let braceBS: ConnectionResult | undefined;
    if (kind === "2L") {
      const { t, leg } = doubleAngleParts(brace);
      const g1 = at.heelGage ?? workableGage(leg);
      const toe = leg - g1 - (lines - 1) * at.lineGage;
      braceBS = blockShearResult("angle legs (two angles)", 2 * Lv * t, 2 * (Lv - (rows - 0.5) * dEff) * t, 2 * (toe + (lines - 1) * (at.lineGage - dEff) - 0.5 * dEff) * t, Fy, Fu, method);
    } else if (kind === "WT") {
      const tf = req(brace, "tf"),
        bf = req(brace, "bf");
      braceBS = blockShearResult("WT flange outstands", 2 * Lv * tf, 2 * (Lv - (rows - 0.5) * dEff) * tf, 2 * ((bf - at.lineGage) / 2 - 0.5 * dEff) * tf, Fy, Fu, method);
    } else {
      const tw = req(brace, "tw");
      braceBS = blockShearResult("W web between outer lines", 2 * Lv * tw, 2 * (Lv - (rows - 0.5) * dEff) * tw, (lines - 1) * (at.lineGage - dEff) * tw, Fy, Fu, method);
    }
    if (braceBS && input.Pt > 0) checks.push(connectionCheck("BBS", "Brace block shear", input.Pt, braceBS, method));
    // Gusset block shear (tension)
    if (input.Pt > 0 && Number.isFinite(eg)) {
      const Lg = eg + (rows - 1) * s;
      const gBS =
        lines > 1
          ? blockShearResult("gusset at bolt group", 2 * Lg * tg, 2 * (Lg - (rows - 0.5) * dEff) * tg, (lines - 1) * (at.lineGage - dEff) * tg, Fyg, Fug, method)
          : undefined;
      if (gBS) checks.push(connectionCheck("GBS", "Gusset block shear", input.Pt, gBS, method));
      else warnings.push("Single bolt line: gusset block shear degenerates to bolt tearout, which is included in the bolt group strength.");
    }
    const mins = minSpacing(at.bolt.d);
    if (s < mins.min) warnings.push(`Bolt pitch is below the §J3.3 minimum 2-2/3d (${mins.min.toFixed(3)} in.).`);
    const me = minEdgeDistance(at.bolt.d);
    if (Le < me) warnings.push(`Brace end distance is below the Table J3.4 minimum (${me} in.).`);
    if (Number.isFinite(eg) && eg < me) warnings.push(`Gusset edge distance beyond the last bolt is below the Table J3.4 minimum (${me} in.).`);
  } else {
    const l = at.length;
    const weld = filletWeld({ w: at.w, length: l, FEXX: at.FEXX ?? 70 });
    const nWelds = 4 - (kind === "WT" ? 2 : 0);
    const wr = connection(`${weld.section} — ${nWelds} longitudinal welds`, [
      {
        ...weld.limitStates[0]!,
        nominal: nWelds * weld.nominal,
        name: `${nWelds} longitudinal fillet welds`,
        steps: [...weld.steps, ...weld.limitStates[0]!.steps, { label: `${nWelds} welds`, symbol: "R{n}", value: nWelds * weld.nominal, quantity: "force", ref: "§J2.4" }],
      },
    ], [], weld.warnings);
    checks.push(connectionCheck("BW", "Brace-to-gusset fillet welds", P, wr, method));
    // Base metal shear rupture along the welds
    let tWall: number;
    if (kind === "hss-rect" || kind === "hss-round") {
      tWall = req(brace, "tdes");
      const clr = at.slotClearance ?? 0.125;
      An = Ag - 2 * tWall * (tg + clr);
      steps.push({ label: "HSS net area at the slot", symbol: "A{n}", value: An, quantity: "area", expr: "A{g} − 2t(t{g} + clearance)", ref: "§B4.3b" });
      lag =
        kind === "hss-round"
          ? shearLagReport({ case: 5, section: "round", D: req(brace, "OD"), gussetThickness: tg, length: l })
          : shearLagReport({ case: 5, section: "rectangular", B: req(brace, "B"), H: req(brace, "Ht"), t: tWall, gussetThickness: tg, length: l });
      checks.push(connectionCheck("BSR", "HSS wall shear rupture along welds", P, elementShearRupture({ Fy, Fu, Agv: 4 * l * tWall, Anv: 4 * l * tWall }), method));
    } else if (kind === "2L") {
      const { t, xBar, leg } = doubleAngleParts(brace);
      tWall = t;
      lag = shearLagReport({ case: 4, xBar, length: l, width: leg });
      checks.push(connectionCheck("BSR", "Angle shear rupture along welds", P, elementShearRupture({ Fy, Fu, Agv: 4 * l * t, Anv: 4 * l * t }), method));
    } else {
      const tf = req(brace, "tf");
      tWall = tf;
      lag = shearLagReport({ case: 4, xBar: req(brace, "y"), length: l, width: req(brace, "bf") });
      checks.push(connectionCheck("BSR", "WT flange shear rupture along welds", P, elementShearRupture({ Fy, Fu, Agv: 2 * l * tf, Anv: 2 * l * tf }), method));
    }
    checks.push(connectionCheck("GSR", "Gusset shear rupture along welds", P, elementShearRupture({ Fy: Fyg, Fu: Fug, Agv: 2 * l * tg, Anv: 2 * l * tg }), method));
    if (input.Pt > 0) {
      const width = geo.cMax - geo.cMin;
      const gBS = blockShearResult("gusset around welds", 2 * l * tg, 2 * l * tg, width * tg, Fyg, Fug, method);
      if (gBS) checks.push(connectionCheck("GBS", "Gusset block shear", input.Pt, gBS, method));
    }
    void tWall;
  }
  const U = lag.U;
  const Ae = U * An;
  steps.push(...lag.steps, { label: "Brace effective net area", symbol: "A{e}", value: Ae, quantity: "area", expr: "UA{n}", ref: "§D3" });
  if (input.Pt > 0) {
    const y = elementTensionYielding({ Fy, Fu, Ag });
    y.section = "§D2(a) Brace tension yielding on the gross section";
    checks.push(connectionCheck("BTY", "Brace tension yielding", input.Pt, y, method));
    const r = elementTensionRupture({ Fy, Fu, Ag, An, Ae });
    r.section = "§D2(b) Brace tension rupture on the effective net section";
    checks.push(connectionCheck("BTR", "Brace tension rupture (net section)", input.Pt, r, method));
  }
  warnings.push("Brace member compression strength (Chapter E) is a member check and is not evaluated here.");
  return { checks, steps, warnings, Ag, An, Ae, U };
}
