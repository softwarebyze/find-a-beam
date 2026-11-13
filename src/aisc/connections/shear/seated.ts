/** Unstiffened seated connections — Manual Part 10. */
import { req } from "@/data/shapes";
import type { BoltCoord } from "../types";
import {
  bearingLimitState,
  connectionResult,
  detail,
  holeSize,
  limitState,
  makeCheck,
  PHI,
  rowClearDistances,
  scaled,
  sixteenths,
} from "./common";
import { angleLegs } from "./double-angle";
import type { ConnectionKit } from "./kit";
import { beamChecks, supportBearingPly, supportDetailing, supportWeldBaseMetal } from "./parts";
import type { DetailCheck, ShearCheck, ShearConnectionInput, ShearConnectionReport } from "./types";
import { webLocalCripplingAtEnd, webLocalYieldingAtEnd } from "./web-local";

export function seated(kit: ConnectionKit, input: ShearConnectionInput): ShearConnectionReport {
  const st = input.seated;
  if (!st) throw new RangeError("Seated-connection input is required");
  const { bolts, method, R, beam, beamMaterial, weld } = input;
  const { bolt } = bolts;
  const db = bolt.d;
  const d = req(beam, "d");
  const ta = req(st.angle, "t");
  const { first: bh, second: bv } = angleLegs(st.angle, st.horizontalLeg);
  const lb = bh - input.setback;
  if (!(lb > 0)) throw new RangeError("Setback exceeds the seat leg; no bearing length");
  const eSeat = input.setback + lb / 2;
  const ka = ta + 3 / 8;
  const ef = eSeat - ka;
  const checks: ShearCheck[] = [];
  const warnings: string[] = [
    "A top angle (or side angle) is required to provide lateral and torsional stability at the beam end (Manual Part 10).",
  ];

  // ---------- Supported beam: concentrated force at the end ----------
  const wly = webLocalYieldingAtEnd(beam, beamMaterial, lb);
  checks.push(makeCheck("beam-wly", "Beam web local yielding", "Supported beam", connectionResult("§J10.2 · end reaction on seat", [wly], method), R, method));
  const wcr = webLocalCripplingAtEnd(beam, beamMaterial, lb);
  checks.push(makeCheck("beam-wcr", "Beam web local crippling", "Supported beam", connectionResult("§J10.3 · end reaction on seat", [wcr], method), R, method));

  // ---------- Seat angle ----------
  const { Fy } = st.material;
  const Z = (st.La * ta ** 2) / 4;
  const Mn = Fy * Z;
  if (ef > 0) {
    checks.push(
      makeCheck(
        "seat-flexure",
        "Seat angle flexural yielding",
        "Connecting element",
        connectionResult("Manual Part 10 · unstiffened seat", [
          limitState("SF", "Flexural yielding of the outstanding leg", "Manual Part 10", Mn / ef, PHI.flexure, [
            { label: "Bearing length on seat", symbol: "l{b}", expr: "seat leg − setback", value: lb, quantity: "length" },
            { label: "Reaction from support face (center of bearing)", symbol: "e", expr: "setback + l{b}/2", value: eSeat, quantity: "length", ref: "Manual Part 10" },
            { label: "Critical section from back of vertical leg", symbol: "k{a}", expr: "t + 3/8", value: ka, quantity: "length", ref: "Manual Part 10" },
            { label: "Lever arm to critical section", symbol: "e{f}", expr: "e − k{a}", value: ef, quantity: "length" },
            { label: "Plastic section modulus of the leg", symbol: "Z", expr: "L{a}t²/4", value: Z, quantity: "modulus" },
            { label: "Nominal flexural strength", symbol: "M{n}", expr: "F{y}Z", value: Mn, quantity: "moment", ref: "Manual Part 9" },
            { label: "Equivalent end reaction", symbol: "R{n}", expr: "M{n}/e{f}", value: Mn / ef, quantity: "force" },
          ]),
        ], method),
        R,
        method,
      ),
    );
  } else warnings.push("Reaction falls inside the angle fillet; seat flexure does not govern.");
  const sy = kit.elementShearYielding({ Fy, Fu: st.material.Fu, Agv: st.La * ta });
  const syl = scaled(sy, "SY", "Shear yielding of the outstanding leg", 1);
  syl.steps.unshift({ label: "Gross shear area", symbol: "A{gv}", expr: "L{a}t", value: st.La * ta, quantity: "area", ref: "§J4.2" });
  checks.push(makeCheck("seat-shear", "Seat angle shear yielding", "Connecting element", connectionResult("§J4.2(a) · seat angle", [syl], method), R, method));

  // ---------- Attachment to support ----------
  const detailing: DetailCheck[] = [
    detail("seat-lb", "Bearing length l{b} ≥ k{des} of beam", lb, req(beam, "kdes"), "min", "Manual Part 10", { advisory: true }),
    ...supportDetailing(input),
  ];
  let supportBoltsY: number[] = [];
  if (st.attach === "bolted") {
    const hole = holeSize(kit, db, bolts.hole);
    const rows = st.rows;
    supportBoltsY = Array.from({ length: rows }, (_, i) => d + st.g1 + i * bolts.s);
    const coords: BoltCoord[] = supportBoltsY.flatMap((y) => [{ x: -st.gw / 2, y }, { x: st.gw / 2, y }]);
    const minEdge = kit.minEdgeDistance(db);
    const last = st.g1 + (rows - 1) * bolts.s;
    detailing.push(
      detail("seat-edge-v", "Bottom edge distance, vertical leg", bv - last, minEdge, "min", "Table J3.4"),
      detail("seat-edge-h", "End distance across angle length", (st.La - st.gw) / 2, minEdge, "min", "Table J3.4"),
      detail("seat-gw", "Gage across angle ≥ 2⅔d", st.gw, (8 / 3) * db, "min", "§J3.3"),
      detail("seat-g1", "First row clears angle fillet (g ≥ k{des} + d{b}/2)", st.g1, req(st.angle, "kdes") + db / 2, "min", "Manual Part 10", { advisory: true }),
    );
    if (rows > 1) detailing.push(detail("spacing", "Bolt spacing s ≥ 2⅔d", bolts.s, (8 / 3) * db, "min", "§J3.3"));
    const shear = (() => {
      const rn = kit.boltShear({ bolt, planes: 1 });
      const ls = scaled(rn, "BS", "Bolt shear (eccentricity neglected for seats)", coords.length, {
        label: "Bolt group shear strength",
        symbol: "R{n}",
        expr: "n r{n}",
        value: coords.length * rn.nominal,
        quantity: "force",
        ref: "Manual Part 10",
      });
      return connectionResult("§J3.7 · seat to support", [ls], method, [], rn.warnings);
    })();
    checks.push(makeCheck("bolt-shear", "Bolt shear", "Bolts", shear, R, method));
    const angleBearing = bearingLimitState(kit, "BB", db, hole, { label: "seat vertical leg", t: ta, Fu: st.material.Fu, lcs: rowClearDistances(rows, bolts.s, hole, st.g1), multiplier: 2 });
    checks.push(makeCheck("bearing-seat", "Bolt bearing on seat angle", "Bolts", connectionResult("§J3.11 · seat angle", [angleBearing], method), R, method));
    const sup = supportBearingPly(input, 2);
    if (sup) {
      const std = holeSize(kit, db, "STD");
      const supBearing = bearingLimitState(kit, "BB", db, std, { ...sup, lcs: rowClearDistances(rows, bolts.s, std, undefined) });
      checks.push(makeCheck("bearing-support", `Bolt bearing on ${sup.label}`, "Support", connectionResult(`§J3.11 · ${sup.label}`, [supBearing], method), R, method));
    }
  } else {
    const Lw = bv;
    const unit = kit.filletWeld({ w: weld.w, length: Lw, FEXX: weld.FEXX, theta: 0 });
    const perIn = unit.nominal / Lw;
    const Rn = (2 * Lw * perIn) / Math.sqrt(1 + 36 * (eSeat / Lw) ** 2);
    const ls = {
      ...(unit.limitStates[0] ?? { phi: 0.75, omega: 2.0 }),
      id: "W",
      name: "Two vertical fillet welds, out-of-plane eccentricity",
      ref: "Manual Part 8",
      nominal: Rn,
      steps: [
        { label: "Weld size", symbol: "w", value: weld.w, quantity: "length" as const, note: `${sixteenths(weld.w)}/16 in.` },
        { label: "Length of each vertical weld", symbol: "l", value: Lw, quantity: "length" as const },
        ...unit.steps,
        ...unit.limitStates.flatMap((l) => l.steps),
        { label: "Nominal strength per inch", symbol: "r{n}", value: perIn, quantity: "lineLoad" as const, ref: "Eq. J2-3" },
        { label: "Out-of-plane eccentricity", symbol: "e", value: eSeat, quantity: "length" as const },
        {
          label: "Elastic method: direct shear R/2l with bending stress 3Re/l²",
          symbol: "R{n}",
          expr: "2 l r{n} / √(1 + 36e²/l²)",
          value: Rn,
          quantity: "force" as const,
          ref: "Manual Part 8 (elastic method)",
        },
      ],
    };
    checks.push(makeCheck("weld", "Welds to support", "Welds", connectionResult("§J2.4 · seat to support", [ls], method, [], unit.warnings), R, method));
    detailing.push(detail("weld-min", "Minimum fillet weld size", weld.w, kit.minFilletWeldSize(ta), "min", "Table J2.4"));
    const base = supportWeldBaseMetal(kit, input, Lw, 2);
    if (base) checks.push(base);
  }

  checks.push(...beamChecks(kit, input, { eCope: input.cope.c + input.setback }));

  return {
    input,
    checks,
    detailing,
    warnings,
    procedure: `Manual Part 10 · unstiffened seated connection, ${st.attach} to support`,
    geometry: { bolts: [], supportBoltsY, top: d, bottom: d + bv, width: bh, a: input.setback, e: eSeat, lb, eSeat, t: ta, legA: bh, legB: bv },
    maxRatio: 0,
    pass: false,
  };
}
