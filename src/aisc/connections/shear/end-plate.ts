/** Shear end-plate connections — Manual Part 10. */
import { req } from "@/data/shapes";
import type { BoltCoord } from "../types";
import { bearingLimitState, connectionResult, detail, holeSize, makeCheck, rowClearDistances, sixteenths } from "./common";
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

export function endPlate(kit: ConnectionKit, input: ShearConnectionInput): ShearConnectionReport {
  const ep = input.endPlate;
  if (!ep) throw new RangeError("End-plate input is required");
  const { bolts, method, R, beam, beamMaterial, weld } = input;
  const { bolt, n, s, top } = bolts;
  const db = bolt.d;
  const hole = holeSize(kit, db, bolts.hole);
  const tw = req(beam, "tw");
  const L = (n - 1) * s + 2 * ep.Lev;
  const plateTop = top - ep.Lev,
    plateBottom = plateTop + L;
  const Leh = (ep.width - ep.gage) / 2;
  const Lw = L - 2 * weld.w;
  const warnings: string[] = [];
  const checks: ShearCheck[] = [];

  const detailing: DetailCheck[] = [
    ...boltRowDetailing(kit, input, [{ label: "end plate", Lev: ep.Lev, Leh }]),
    ...fitDetailing(input, plateTop, plateBottom, "end plate"),
    ...supportDetailing(input),
    detail("ep-t", "End-plate thickness ≤ 3/8 in. for end-rotation flexibility", ep.tp, 0.375, "max", "Manual Part 10", { advisory: true }),
    detail("ep-gage", "Gage clears the web and welds (g ≥ t{w} + 2w + d{b})", ep.gage, tw + 2 * weld.w + db, "min", "Manual Part 10", { advisory: true }),
    detail("weld-min", "Minimum fillet weld size", weld.w, kit.minFilletWeldSize(Math.min(ep.tp, tw)), "min", "Table J2.4"),
  ];

  const coords: BoltCoord[] = [];
  for (const side of [-1, 1]) for (let i = 0; i < n; i++) coords.push({ x: (side * ep.gage) / 2, y: top + i * s });
  const shear = boltGroupShear(kit, bolt, 1, coords, 0, method, "Bolt shear (single shear)");
  checks.push(makeCheck("bolt-shear", "Bolt shear", "Bolts", shear.check, R, method));
  const plateBearing = bearingLimitState(kit, "BB", db, hole, { label: "end plate", t: ep.tp, Fu: ep.material.Fu, lcs: rowClearDistances(n, s, hole, ep.Lev), multiplier: 2 });
  checks.push(makeCheck("bearing-plate", "Bolt bearing on end plate", "Bolts", connectionResult("§J3.11 · end plate", [plateBearing], method), R, method));
  const sup = supportBearingPly(input, 2);
  if (sup) {
    const std = holeSize(kit, db, "STD");
    const supBearing = bearingLimitState(kit, "BB", db, std, { ...sup, lcs: rowClearDistances(n, s, std, undefined) });
    checks.push(makeCheck("bearing-support", `Bolt bearing on ${sup.label}`, "Support", connectionResult(`§J3.11 · ${sup.label}`, [supBearing], method), R, method));
    if (input.support.kind !== "column-flange")
      warnings.push("Where beams frame to both sides of the support web, bolts shared by both connections must be checked for the combined reactions.");
  }

  checks.push(
    ...elementShearChecks(kit, input, {
      label: "end plate",
      idPrefix: "plate",
      t: ep.tp,
      mat: ep.material,
      L,
      n,
      plies: 2,
      hole,
      block: { Lev: ep.Lev, Leh, cols: 1, g: 0 },
    }),
  );

  if (!(Lw > 0)) throw new RangeError("End plate is too short for the weld size");
  const wr = kit.filletWeld({ w: weld.w, length: Lw, FEXX: weld.FEXX, theta: 0 });
  const weldLs = {
    ...wr.limitStates[0]!,
    id: "W",
    name: "Fillet welds, both sides of beam web",
    nominal: 2 * wr.nominal,
    steps: [
      { label: "Weld size", symbol: "w", value: weld.w, quantity: "length" as const, note: `${sixteenths(weld.w)}/16 in.` },
      { label: "Effective weld length per side (weld terminations)", symbol: "l", expr: "L − 2w", value: Lw, quantity: "length" as const, ref: "Manual Part 10" },
      ...wr.steps,
      ...wr.limitStates.flatMap((l) => l.steps),
      { label: "Two welds", symbol: "R{n}", expr: "2 F{nw}A{we}", value: 2 * wr.nominal, quantity: "force" as const, ref: "Eq. J2-3" },
    ],
  };
  checks.push(makeCheck("weld", "Weld to beam web", "Welds", connectionResult("§J2.4 · end plate to beam web", [weldLs], method, [], wr.warnings), R, method));
  const base = kit.weldBaseMetalShear({ t: tw, Fy: beamMaterial.Fy, Fu: beamMaterial.Fu, length: Lw });
  base.steps.unshift({ label: "Welds on both faces of the web share one shear plane", symbol: "l", value: Lw, quantity: "length", ref: "Manual Part 9" });
  checks.push(makeCheck("beam-base-metal", "Beam web base metal at weld", "Supported beam", base, R, method));

  checks.push(...beamChecks(kit, input, { eCope: input.cope.c + ep.tp }));

  return {
    input,
    checks,
    detailing,
    warnings,
    procedure: "Manual Part 10 · shear end plate",
    geometry: { bolts: [], supportBoltsY: Array.from({ length: n }, (_, i) => top + i * s), top: plateTop, bottom: plateBottom, width: ep.tp, a: ep.tp, e: 0, t: ep.tp },
    maxRatio: 0,
    pass: false,
  };
}
