/**
 * Double-angle connections — Manual Part 10: all-bolted (Table 10-1 procedure) and
 * welded to the beam web / bolted to the support (Weld A, Table 10-2 procedure).
 */
import { req, type Shape } from "@/data/shapes";
import type { BoltCoord } from "../types";
import {
  bearingLimitState,
  connectionResult,
  detail,
  holeSize,
  makeCheck,
  rowClearDistances,
  weldGroupLimitState,
} from "./common";
import type { ConnectionKit } from "./kit";
import {
  beamChecks,
  boltGroupShear,
  boltRowDetailing,
  elementShearChecks,
  fitDetailing,
  supportBearingPly,
  supportDetailing,
} from "./parts";
import type { DetailCheck, ShearCheck, ShearConnectionInput, ShearConnectionReport } from "./types";

/** Leg lengths of a single angle, ordered so `first` is the requested leg. */
export function angleLegs(angle: Shape, first: "long" | "short"): { first: number; second: number } {
  const b = req(angle, "b"),
    d = req(angle, "d");
  const long = Math.max(b, d),
    short = Math.min(b, d);
  return first === "long" ? { first: long, second: short } : { first: short, second: long };
}

export function doubleAngle(kit: ConnectionKit, input: ShearConnectionInput): ShearConnectionReport {
  const da = input.doubleAngle;
  if (!da) throw new RangeError("Double-angle input is required");
  const { bolts, method, R, beam, weld } = input;
  const { bolt, n, s, top } = bolts;
  const db = bolt.d;
  const hole = holeSize(kit, db, bolts.hole);
  const ta = req(da.angle, "t");
  const { first: legBeam, second: legOSL } = angleLegs(da.angle, da.legOnBeam);
  const L = (n - 1) * s + 2 * da.Lev;
  const angleTop = top - da.Lev,
    angleBottom = angleTop + L;
  const tw = req(beam, "tw");
  const gBeam = input.setback + input.LehBeam;
  const LehAngle = legBeam - gBeam;
  const LehOSL = legOSL - da.gOSL;
  const welded = da.beamSide === "welded";
  const warnings: string[] = [];
  const checks: ShearCheck[] = [];

  const detailing: DetailCheck[] = [
    ...boltRowDetailing(kit, input, [
      { label: "angles (support legs)", Lev: da.Lev, Leh: LehOSL },
      ...(welded
        ? []
        : [
            { label: "angles (beam legs)", Leh: LehAngle },
            { label: "beam web", Leh: input.LehBeam, Lev: input.cope.kind !== "none" ? top - input.cope.dct : undefined },
          ]),
    ]),
    ...fitDetailing(input, angleTop, angleBottom, "angles"),
    ...supportDetailing(input),
    detail("angle-t", "Angle thickness ≤ 5/8 in. for end-rotation flexibility", ta, 0.625, "max", "Manual Part 10", { advisory: true }),
    detail("osl-gage", "Support-leg gage clears the angle fillet (g ≥ k{des} + d{b}/2)", da.gOSL, req(da.angle, "kdes") + db / 2, "min", "Manual Part 10", { advisory: true }),
  ];

  // ---------- Beam side ----------
  const beamCoords: BoltCoord[] = Array.from({ length: n }, (_, i) => ({ x: gBeam, y: top + i * s }));
  let weldSegments: { x1: number; y1: number; x2: number; y2: number }[] | undefined;
  if (!welded) {
    const shear = boltGroupShear(kit, bolt, 2, beamCoords, 0, method, "Bolt shear, beam web (double shear)");
    checks.push(makeCheck("bolt-shear-beam", "Bolt shear at beam web", "Bolts", shear.check, R, method));
    const angleBearing = bearingLimitState(kit, "BB", db, hole, { label: "angles (beam legs)", t: ta, Fu: da.material.Fu, lcs: rowClearDistances(n, s, hole, da.Lev), multiplier: 2 });
    checks.push(makeCheck("bearing-angles-beam", "Bolt bearing on angles (beam legs)", "Bolts", connectionResult("§J3.11 · angles", [angleBearing], method), R, method));
    const webEdge = input.cope.kind !== "none" ? top - input.cope.dct : undefined;
    const webBearing = bearingLimitState(kit, "BB", db, hole, { label: "beam web", t: tw, Fu: input.beamMaterial.Fu, lcs: rowClearDistances(n, s, hole, webEdge) });
    checks.push(makeCheck("bearing-web", "Bolt bearing on beam web", "Bolts", connectionResult("§J3.11 · beam web", [webBearing], method), R, method));
  } else {
    const kl = legBeam - input.setback;
    weldSegments = [
      { x1: legBeam, y1: angleTop, x2: legBeam, y2: angleBottom },
      { x1: input.setback, y1: angleTop, x2: legBeam, y2: angleTop },
      { x1: input.setback, y1: angleBottom, x2: legBeam, y2: angleBottom },
    ];
    const xbar = (L * legBeam + 2 * kl * (input.setback + kl / 2)) / (L + 2 * kl);
    const ls = weldGroupLimitState(kit, "W", "Weld A: C-shaped fillet welds, two angles", { segments: weldSegments, ex: xbar }, weld);
    ls.nominal *= 2;
    ls.steps.unshift(
      { label: "Horizontal return length", symbol: "kl", expr: "leg − setback", value: kl, quantity: "length", ref: "Manual Part 8" },
      { label: "Weld group centroid from heel (reaction at the support face)", symbol: "x{bar}", value: xbar, quantity: "length", ref: "Manual Part 10" },
    );
    ls.steps.push({ label: "Two angles", symbol: "R{n}", expr: "2 C C{1} D l", value: ls.nominal, quantity: "force" });
    checks.push(makeCheck("weld-beam", "Weld A to beam web", "Welds", connectionResult("Manual Part 10 · Weld A", [ls], method), R, method));
    detailing.push(
      detail("weld-min", "Minimum fillet weld size", weld.w, kit.minFilletWeldSize(Math.min(ta, tw)), "min", "Table J2.4"),
      detail("weld-max", "Maximum fillet weld size along angle edge", weld.w, kit.maxFilletWeldSize(ta), "max", "§J2.2b"),
    );
    const base = kit.weldBaseMetalShear({ t: tw, Fy: input.beamMaterial.Fy, Fu: input.beamMaterial.Fu, length: L });
    base.steps.unshift({ label: "Welds on both faces of the web share one shear plane of length L", symbol: "l", value: L, quantity: "length", ref: "Manual Part 9" });
    checks.push(makeCheck("beam-base-metal", "Beam web base metal at Weld A", "Supported beam", base, R, method));
  }

  // ---------- Support side ----------
  const oslCoords: BoltCoord[] = [];
  for (const side of [-1, 1]) for (let i = 0; i < n; i++) oslCoords.push({ x: side * (da.gOSL + tw / 2), y: top + i * s });
  const shearOSL = boltGroupShear(kit, bolt, 1, oslCoords, 0, method, "Bolt shear, support legs (single shear)");
  checks.push(makeCheck("bolt-shear-support", "Bolt shear at support", "Bolts", shearOSL.check, R, method));
  const oslBearing = bearingLimitState(kit, "BB", db, hole, { label: "angles (support legs)", t: ta, Fu: da.material.Fu, lcs: rowClearDistances(n, s, hole, da.Lev), multiplier: 2 });
  checks.push(makeCheck("bearing-angles-support", "Bolt bearing on angles (support legs)", "Bolts", connectionResult("§J3.11 · angles", [oslBearing], method), R, method));
  const sup = supportBearingPly(input, 2);
  if (sup) {
    const supBearing = bearingLimitState(kit, "BB", db, holeSize(kit, db, "STD"), { ...sup, lcs: rowClearDistances(n, s, holeSize(kit, db, "STD"), undefined) });
    checks.push(makeCheck("bearing-support", `Bolt bearing on ${sup.label}`, "Support", connectionResult(`§J3.11 · ${sup.label}`, [supBearing], method), R, method));
    if (input.support.kind !== "column-flange")
      warnings.push("Where beams frame to both sides of the support web, bolts shared by both connections must be checked for the combined reactions.");
  }

  // ---------- Angles ----------
  checks.push(
    ...elementShearChecks(kit, input, {
      label: "angles",
      idPrefix: "angles",
      t: ta,
      mat: da.material,
      L,
      n,
      plies: 2,
      hole,
      block: { Lev: da.Lev, Leh: LehOSL, cols: 1, g: 0 },
    }),
  );
  if (!welded) {
    const extra = elementShearChecks(kit, input, {
      label: "angles (beam legs)",
      idPrefix: "angles-beam",
      t: ta,
      mat: da.material,
      L,
      n,
      plies: 2,
      hole,
      block: { Lev: da.Lev, Leh: LehAngle, cols: 1, g: 0 },
    }).filter((c) => c.id.endsWith("block-shear"));
    checks.push(...extra);
  }

  // ---------- Beam ----------
  checks.push(...beamChecks(kit, input, { bolted: welded ? undefined : { n, cols: 1, g: 0, hole }, eCope: input.cope.c + input.setback }));

  return {
    input,
    checks,
    detailing,
    warnings,
    procedure: welded ? "Manual Part 10 · double angle, welded to beam web, bolted to support" : "Manual Part 10 · all-bolted double angle",
    geometry: {
      bolts: welded ? [] : beamCoords,
      supportBoltsY: Array.from({ length: n }, (_, i) => top + i * s),
      top: angleTop,
      bottom: angleBottom,
      width: legBeam,
      a: gBeam,
      e: 0,
      t: ta,
      legA: legBeam,
      legB: legOSL,
      weldSegments,
    },
    maxRatio: 0,
    pass: false,
  };
}
