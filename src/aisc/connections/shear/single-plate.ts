/**
 * Single-plate (shear tab) connections — Manual Part 10, conventional and extended configurations.
 */
import { req } from "@/data/shapes";
import type { CalcStep } from "../../types";
import { boltArea } from "../index";
import type { BoltCoord } from "../types";
import {
  bearingLimitState,
  connectionResult,
  detail,
  holeSize,
  limitState,
  makeCheck,
  netWidth,
  PHI,
  rowClearDistances,
  sixteenths,
} from "./common";
import { plateBucklingQ } from "./coped-beam";
import type { ConnectionKit } from "./kit";
import {
  beamChecks,
  boltGroupShear,
  boltRowDetailing,
  elementShearChecks,
  fitDetailing,
  supportDetailing,
  supportThickness,
  supportWeldBaseMetal,
} from "./parts";
import type { DetailCheck, ShearCheck, ShearConnectionInput, ShearConnectionReport } from "./types";

/** Manual Table 10-9: conventional configuration bolt eccentricity and maximum plate / web thickness. */
export function conventionalLimits(n: number, hole: "STD" | "SSL", db: number, a: number): { e: number; tmax: number | undefined; eExpr: string; tExpr: string } {
  if (hole === "SSL") return n <= 5 ? { e: a / 2, tmax: undefined, eExpr: "a/2", tExpr: "no limit" } : { e: a / 2, tmax: db / 2 + 1 / 16, eExpr: "a/2", tExpr: "d{b}/2 + 1/16" };
  return n <= 5 ? { e: a / 2, tmax: db / 2 + 1 / 16, eExpr: "a/2", tExpr: "d{b}/2 + 1/16" } : { e: a, tmax: db / 2 - 1 / 16, eExpr: "a", tExpr: "d{b}/2 − 1/16" };
}

/**
 * Moment-only bolt group coefficient C′ (in.) by the instantaneous center method with the center at the
 * centroid: Σ rᵢ(1 − e^(−10Δᵢ))^0.55, Δᵢ = 0.34 rᵢ/r{max} (Manual Part 7 load–deformation relationship).
 */
export function momentOnlyCoefficient(bolts: BoltCoord[]): number {
  const cx = bolts.reduce((s, b) => s + b.x, 0) / bolts.length,
    cy = bolts.reduce((s, b) => s + b.y, 0) / bolts.length;
  const r = bolts.map((b) => Math.hypot(b.x - cx, b.y - cy));
  const rmax = Math.max(...r);
  if (!(rmax > 0)) return 0;
  return r.reduce((s, ri) => s + ri * (1 - Math.exp((-10 * 0.34 * ri) / rmax)) ** 0.55, 0);
}

/** Plastic section modulus of a rectangular plate L × t with a vertical row of holes (widths w at yᵢ from mid-depth). */
export function netPlasticModulus(L: number, t: number, holes: { y: number; w: number }[]): number {
  const absMoment = (lo: number, hi: number) => (lo >= 0 || hi <= 0 ? Math.abs(hi * hi - lo * lo) : lo * lo + hi * hi) / 2;
  const gross = t * absMoment(-L / 2, L / 2);
  return gross - holes.reduce((s, h) => s + t * absMoment(h.y - h.w / 2, h.y + h.w / 2), 0);
}

export function singlePlate(kit: ConnectionKit, input: ShearConnectionInput): ShearConnectionReport {
  const sp = input.singlePlate;
  if (!sp) throw new RangeError("Single-plate input is required");
  const { bolts, method, R, beam, weld } = input;
  const { bolt, n, s, top } = bolts;
  const db = bolt.d;
  const hole = holeSize(kit, db, bolts.hole);
  const cols = sp.cols,
    g = cols > 1 ? sp.gCols : 0;
  const a = input.setback + input.LehBeam;
  const L = (n - 1) * s + 2 * sp.Lev;
  const plateTop = top - sp.Lev,
    plateBottom = plateTop + L;
  const width = a + g + sp.Leh;
  const tw = req(beam, "tw");
  const warnings: string[] = [];

  const convHole = bolts.hole === "STD" || bolts.hole === "SSL" ? bolts.hole : undefined;
  const conv = convHole ? conventionalLimits(n, convHole, db, a) : undefined;
  const conventionalOK =
    cols === 1 &&
    n >= 2 &&
    n <= 12 &&
    a <= 3.5 + 1e-9 &&
    conv !== undefined &&
    (conv.tmax === undefined || Math.min(sp.tp, tw) <= conv.tmax + 1e-9);
  const config = sp.config === "auto" ? (conventionalOK ? "conventional" : "extended") : sp.config;
  if (sp.config === "auto" && !conventionalOK)
    warnings.push("Conventional-configuration limits of Manual Table 10-9 are not met; the extended configuration procedure is used.");

  const coords: BoltCoord[] = [];
  for (let j = 0; j < cols; j++) for (let i = 0; i < n; i++) coords.push({ x: a + j * g, y: top + i * s });
  const eCentroid = a + g / 2;
  const e = config === "conventional" && conv ? conv.e : eCentroid;

  // ---------- Detailing ----------
  const detailing: DetailCheck[] = [
    ...boltRowDetailing(kit, input, [
      { label: "plate", Lev: sp.Lev, Leh: sp.Leh, LehMin: 2 * db },
      { label: "beam web", Leh: input.LehBeam, LehMin: 2 * db, Lev: input.cope.kind !== "none" ? top - input.cope.dct : undefined },
    ]),
    ...fitDetailing(input, plateTop, plateBottom, "plate"),
    ...supportDetailing(input),
    detail("weld-5-8", "Fillet weld w ≥ (5/8)t{p} on both sides of plate", weld.w, (5 / 8) * sp.tp, "min", "Manual Part 10"),
  ];
  const tsup = supportThickness(input.support);
  const tThin = tsup !== undefined ? Math.min(sp.tp, tsup) : sp.tp;
  detailing.push(detail("weld-min", "Minimum fillet weld size", weld.w, kit.minFilletWeldSize(tThin), "min", "Table J2.4"));
  if (config === "conventional") {
    detailing.push(
      detail("conv-n", "Number of bolts n ≤ 12 (single vertical row)", n, 12, "max", "Manual Table 10-9", { quantity: "ratio" }),
      detail("conv-a", "Bolt line to weld line a ≤ 3½ in.", a, 3.5, "max", "Manual Part 10"),
    );
    if (cols !== 1) detailing.push(detail("conv-cols", "Single vertical row of bolts", cols, 1, "max", "Manual Part 10", { quantity: "ratio" }));
    if (!convHole) detailing.push(detail("conv-hole", "STD or SSL holes", 0, 1, "min", "Manual Table 10-9", { quantity: "ratio", note: "OVS / LSL holes require the extended configuration." }));
    if (conv?.tmax !== undefined)
      detailing.push(
        detail("conv-t", `Plate or beam web thickness ≤ ${conv.tExpr} (lesser of t{p}, t{w})`, Math.min(sp.tp, tw), conv.tmax, "max", "Manual Table 10-9"),
      );
  }

  // ---------- Bolts ----------
  const checks: ShearCheck[] = [];
  const shear = boltGroupShear(kit, bolt, 1, coords, e, method, "Bolt shear");
  const sl = shear.check.limitStates[0]!;
  sl.steps.unshift(
    config === "conventional" && conv
      ? { label: "Bolt eccentricity for the conventional configuration", symbol: "e", expr: conv.eExpr, value: e, quantity: "length", ref: "Manual Table 10-9" }
      : { label: "Eccentricity, weld line to bolt group centroid", symbol: "e", expr: cols > 1 ? "a + g/2" : "a", value: e, quantity: "length", ref: "Manual Part 10" },
  );
  checks.push(makeCheck("bolt-shear", "Bolt shear", "Bolts", shear.check, R, method));
  const factor = shear.C / coords.length;
  const plateBearing = bearingLimitState(kit, "BB", db, hole, { label: "plate", t: sp.tp, Fu: sp.material.Fu, lcs: rowClearDistances(n, s, hole, sp.Lev), multiplier: cols }, factor);
  checks.push(makeCheck("bearing-plate", "Bolt bearing on plate", "Bolts", connectionResult("§J3.11 · plate", [plateBearing], method), R, method));
  const webEdge = input.cope.kind !== "none" ? top - input.cope.dct : undefined;
  const webBearing = bearingLimitState(kit, "BB", db, hole, { label: "beam web", t: tw, Fu: input.beamMaterial.Fu, lcs: rowClearDistances(n, s, hole, webEdge), multiplier: cols }, factor);
  checks.push(makeCheck("bearing-web", "Bolt bearing on beam web", "Bolts", connectionResult("§J3.11 · beam web", [webBearing], method), R, method));

  // ---------- Plate ----------
  checks.push(
    ...elementShearChecks(kit, input, {
      label: "plate",
      idPrefix: "plate",
      t: sp.tp,
      mat: sp.material,
      L,
      n,
      plies: 1,
      hole,
      block: { Lev: sp.Lev, Leh: sp.Leh, cols, g },
    }),
  );

  if (config === "extended") {
    const { Fy, Fu } = sp.material;
    const tp = sp.tp;
    // Maximum plate thickness so the plate yields in flexure before the bolts rupture.
    const Fnv = kit.nominalBoltStress(bolt.group, bolt.threads).Fnv;
    const Ab = boltArea(db);
    const Cp = momentOnlyCoefficient(coords);
    const Mmax = (Fnv / 0.9) * Ab * Cp;
    const tmax = (6 * Mmax) / (Fy * L ** 2);
    detailing.push(
      detail("ext-tmax", "Plate or beam web thickness ≤ t{max} = 6M{max}/(F{y}L²) (lesser of t{p}, t{w})", Math.min(tp, tw), tmax, "max", "Manual Part 10", {
        note: `M{max} = (F{nv}/0.90)A{b}C′ with C′ = ${Cp.toFixed(2)} in.`,
      }),
    );

    const Vn = 0.6 * Fy * L * tp,
      Zp = (tp * L ** 2) / 4,
      Mn = Fy * Zp;
    const Vc = method === "LRFD" ? PHI.yield.phi * Vn : Vn / PHI.yield.omega;
    const Mc = method === "LRFD" ? PHI.flexure.phi * Mn : Mn / PHI.flexure.omega;
    const Rc = 1 / Math.sqrt(1 / Vc ** 2 + (eCentroid / Mc) ** 2);
    const RnEq = method === "LRFD" ? Rc / PHI.flexure.phi : Rc * PHI.flexure.omega;
    const fyStep: CalcStep[] = [
      { label: "Nominal shear yielding strength", symbol: "V{n}", expr: "0.6F{y}L t{p}", value: Vn, quantity: "force", ref: "Eq. J4-3" },
      { label: "Plastic section modulus of plate", symbol: "Z{p}", expr: "t{p}L²/4", value: Zp, quantity: "modulus" },
      { label: "Nominal flexural yielding strength", symbol: "M{n}", expr: "F{y}Z{p}", value: Mn, quantity: "moment", ref: "Manual Part 9" },
      { label: method === "LRFD" ? "Available shear (φv = 1.00)" : "Available shear (Ωv = 1.50)", symbol: "V{c}", value: Vc, quantity: "force", ref: "§J4.2" },
      { label: method === "LRFD" ? "Available flexure (φb = 0.90)" : "Available flexure (Ωb = 1.67)", symbol: "M{c}", value: Mc, quantity: "moment", ref: "Manual Part 9" },
      { label: "Reaction satisfying (V{r}/V{c})² + (M{r}/M{c})² = 1 with M{r} = R e", symbol: "R{c}", expr: "[1/V{c}² + (e/M{c})²]^(−1/2)", value: Rc, quantity: "force", ref: "Manual Part 10 (von Mises interaction)" },
      { label: "Equivalent nominal reaction", symbol: "R{n}", expr: method === "LRFD" ? "R{c}/φ{b}" : "R{c}Ω{b}", value: RnEq, quantity: "force" },
    ];
    checks.push(
      makeCheck(
        "plate-flexure-yield",
        "Plate flexural yielding with shear interaction",
        "Connecting element",
        connectionResult("Manual Part 10 · extended single plate", [limitState("FY", "Flexural yielding of the plate (shear–moment interaction)", "Manual Part 10", RnEq, PHI.flexure, fyStep)], method),
        R,
        method,
      ),
    );

    const holesAbout = Array.from({ length: n }, (_, i) => ({ y: top + i * s - (plateTop + L / 2), w: netWidth(hole.y) }));
    const Znet = netPlasticModulus(L, tp, holesAbout);
    const MnR = Fu * Znet;
    checks.push(
      makeCheck(
        "plate-flexure-rupture",
        "Plate flexural rupture",
        "Connecting element",
        connectionResult("Manual Part 9 · plate flexural rupture", [
          limitState("FR", "Flexural rupture of the plate at the bolt line", "Manual Part 9", MnR / eCentroid, PHI.rupture, [
            { label: "Net plastic section modulus (one row of holes)", symbol: "Z{net}", value: Znet, quantity: "modulus", ref: "Manual Table 15-3 basis" },
            { label: "Nominal flexural rupture strength", symbol: "M{n}", expr: "F{u}Z{net}", value: MnR, quantity: "moment", ref: "Manual Part 9" },
            { label: "Equivalent end reaction", symbol: "R{n}", expr: "M{n}/e", value: MnR / eCentroid, quantity: "force" },
          ]),
        ], method),
        R,
        method,
      ),
    );

    const q = plateBucklingQ(L, tp, a, Fy);
    const Sp = (tp * L ** 2) / 6;
    const MnB = Fy * q.Q * Sp;
    checks.push(
      makeCheck(
        "plate-buckling",
        "Plate buckling",
        "Connecting element",
        connectionResult("Manual Part 10 · extended single plate", [
          limitState("PB", "Local buckling of the plate", "Manual Part 9", MnB / eCentroid, PHI.flexure, [
            { label: "Plate depth h{o} = L, length c = a, thickness t = t{p}", symbol: "L", value: L, quantity: "length", ref: "Manual Part 10" },
            ...q.steps,
            { label: "Critical stress", symbol: "F{cr}", expr: "F{y}Q", value: Fy * q.Q, quantity: "stress", ref: "Manual Part 9" },
            { label: "Elastic section modulus of plate", symbol: "S", expr: "t{p}L²/6", value: Sp, quantity: "modulus" },
            { label: "Nominal flexural strength", symbol: "M{n}", expr: "F{cr}S", value: MnB, quantity: "moment" },
            { label: "Equivalent end reaction", symbol: "R{n}", expr: "M{n}/e", value: MnB / eCentroid, quantity: "force" },
          ]),
        ], method),
        R,
        method,
      ),
    );
    warnings.push("Extended configuration: the supported beam is assumed laterally braced at the connection (e.g. by the deck); otherwise stabilize the plate (Manual Part 10).");
  }

  // ---------- Weld and support ----------
  const wr = kit.filletWeld({ w: weld.w, length: L, FEXX: weld.FEXX, theta: 0 });
  const weldLs = {
    ...wr.limitStates[0]!,
    id: "W",
    name: "Fillet welds, both sides of plate",
    nominal: 2 * wr.nominal,
    steps: [
      { label: "Weld size", symbol: "w", value: weld.w, quantity: "length" as const, note: `${sixteenths(weld.w)}/16 in.` },
      { label: "Weld length per side", symbol: "l", expr: "L", value: L, quantity: "length" as const },
      ...wr.steps,
      ...wr.limitStates.flatMap((l) => l.steps),
      { label: "Two welds", symbol: "R{n}", expr: "2 F{nw}A{we}", value: 2 * wr.nominal, quantity: "force" as const, ref: "Eq. J2-3" },
    ],
  };
  checks.push(makeCheck("weld", "Weld to support", "Welds", connectionResult("§J2.4 · plate to support", [weldLs], method, [], wr.warnings), R, method));
  const base = supportWeldBaseMetal(kit, input, L);
  if (base) checks.push(base);

  // ---------- Beam ----------
  checks.push(...beamChecks(kit, input, { bolted: { n, cols, g, hole }, eCope: input.cope.c + input.setback }));

  return {
    input,
    checks,
    detailing,
    warnings,
    procedure: config === "conventional" ? "Manual Part 10 · single-plate, conventional configuration" : "Manual Part 10 · single-plate, extended configuration",
    geometry: { bolts: coords, supportBoltsY: [], top: plateTop, bottom: plateBottom, width, a, e, t: sp.tp, config },
    maxRatio: 0,
    pass: false,
  };
}
