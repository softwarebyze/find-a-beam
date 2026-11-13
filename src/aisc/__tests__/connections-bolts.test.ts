import { describe, expect, it } from "vitest";
import { available } from "../common";
import {
  boltArea,
  boltBearing,
  boltCombinedTension,
  boltShear,
  boltTension,
  minEdgeDistance,
  minimumPretension,
  minSpacing,
  nominalBoltStress,
  nominalHoleDiameter,
  nominalHoleDimensions,
  slipResistance,
} from "../connections/bolts";
const bolt = { d: 0.75, group: "A" as const, threads: "N" as const };
describe("AISC 360-22 bolt strength", () => {
  it("matches Manual Table 7-1: 3/4 Group 120-N single shear 17.9 kip", () => {
    expect(available(boltShear({ bolt }), "LRFD")).toBeCloseTo(17.9, 1);
    expect(available(boltShear({ bolt }), "ASD")).toBeCloseTo(11.9282, 3);
  });
  it("uses nominal body area and scales shear planes, not tension", () => {
    expect(boltArea(0.75)).toBeCloseTo((Math.PI * 0.75 ** 2) / 4, 12);
    expect(boltShear({ bolt, planes: 2 }).nominal).toBeCloseTo(2 * boltShear({ bolt }).nominal, 12);
    expect(boltTension(bolt).nominal).toBeCloseTo((90 * Math.PI * 0.75 ** 2) / 4, 10);
  });
  it.each([
    ["A307", 45, 27, 27],
    ["A", 90, 54, 68],
    ["B", 113, 68, 84],
    ["C", 150, 90, 113],
  ] as const)("Table J3.2 %s stresses", (group, Fnt, N, X) => {
    expect(nominalBoltStress(group, "N")).toEqual({ Fnt, Fnv: N });
    expect(nominalBoltStress(group, "X")).toEqual({ Fnt, Fnv: X });
  });
  it("applies undeveloped filler reduction and lower bound (§J5.2)", () => {
    expect(boltShear({ bolt, fillerThickness: 0.5 }).nominal / boltShear({ bolt }).nominal).toBeCloseTo(0.9, 12);
    expect(boltShear({ bolt, fillerThickness: 2 }).nominal / boltShear({ bolt }).nominal).toBeCloseTo(0.85, 12);
  });
  it.each(["LRFD", "ASD"] as const)("J3-3 combined stress hand calculation on %s basis", (method) => {
    // Fnt'=min(90,117-90 frv/(phi*54 or 54/Omega)). frv is per-plane stress.
    const stress = method === "LRFD" ? 20 : 15,
      rv = method === "LRFD" ? 0.75 * 54 : 54 / 2;
    const result = boltCombinedTension({ bolt, frv: stress, method, planes: 2 });
    expect(result.nominal).toBeCloseTo(Math.min(90, 117 - (90 * stress) / rv) * boltArea(0.75), 10);
    expect(boltCombinedTension({ bolt, frv: rv * 1.001, method }).nominal).toBe(0);
  });
  it("J3-6a/c: independent bearing and tearout checks", () => {
    const r = boltBearing({ d: 0.75, t: 0.375, Fu: 58, lc: 1.25 });
    expect(r.limitStates[0]!.nominal).toBeCloseTo(2.4 * 0.75 * 0.375 * 58, 10);
    expect(r.limitStates[1]!.nominal).toBeCloseTo(1.2 * 1.25 * 0.375 * 58, 10);
    expect(r.governing).toBe("TO");
    expect(r.limitStates.map((s) => s.ref)).toEqual(["Eq. J3-6a", "Eq. J3-6c"]);
  });
  it("J3-6b/d allows service deformation and e/f reduces transverse long slots", () => {
    expect(boltBearing({ d: 0.75, t: 1, Fu: 58, lc: 2, deformationConsidered: false }).nominal).toBeCloseTo(
      3 * 0.75 * 58,
    );
    const r = boltBearing({
      d: 0.75,
      t: 1,
      Fu: 58,
      lc: 1,
      holeType: "LSL",
      slot: "perpendicular",
      deformationConsidered: false,
    });
    expect(r.nominal).toBe(58);
    expect(r.limitStates.map((s) => s.ref)).toEqual(["Eq. J3-6e", "Eq. J3-6f"]);
    expect(boltBearing({ d: 0.75, t: 1, Fu: 58, lc: 0 }).nominal).toBe(0);
  });
  it("Table 7-3 style slip resistance: 0.30 × 1.13 × 28 = 9.492 kip", () => {
    expect(available(slipResistance({ bolt, surface: "A" }), "LRFD")).toBeCloseTo(9.492, 10);
    expect(available(slipResistance({ bolt, surface: "B" }), "ASD")).toBeCloseTo((0.5 * 1.13 * 28) / 1.5, 10);
    expect(slipResistance({ bolt, surface: "A", ns: 2, hf: 0.85 }).nominal).toBeCloseTo(9.492 * 2 * 0.85, 10);
  });
  it.each([
    ["STD", "parallel", 1, 1.5],
    ["SSL", "perpendicular", 1, 1.5],
    ["OVS", "parallel", 0.85, 1.76],
    ["SSL", "parallel", 0.85, 1.76],
    ["LSL", "parallel", 0.7, 2.14],
  ] as const)("slip hole factors %s/%s", (holeType, slot, phi, omega) => {
    const r = slipResistance({ bolt, surface: "A", holeType, slot });
    expect(r.phi).toBe(phi);
    expect(r.omega).toBe(omega);
  });
  it("Table J3.1 includes Group 200 restrictions", () => {
    expect(minimumPretension(0.75, "A")).toBe(28);
    expect(minimumPretension(1.5, "A")).toBe(118);
    expect(minimumPretension(1.25, "B")).toBe(102);
    expect(minimumPretension(1.125, "C")).toBe(113);
    expect(() => minimumPretension(0.75, "C")).toThrow();
    expect(() => boltShear({ bolt: { ...bolt, group: "C" } })).toThrow();
  });
  it("Table J3.3 standard/oversize/slot dimensions including large bolts", () => {
    expect(nominalHoleDiameter(0.75)).toBe(13 / 16);
    expect(nominalHoleDiameter(1)).toBe(1.125);
    expect(nominalHoleDiameter(1.5)).toBe(1.625);
    expect(nominalHoleDimensions(0.625, "OVS")).toEqual({ width: 13 / 16, length: 13 / 16 });
    expect(nominalHoleDimensions(1, "SSL")).toEqual({ width: 1.125, length: 1.3125 });
    expect(nominalHoleDimensions(1.25, "SSL")).toEqual({ width: 1.375, length: 1.625 });
    expect(nominalHoleDimensions(0.875, "LSL").length).toBe(2.1875);
  });
  it("Table J3.4 and §J3.4 detailing", () => {
    expect(minEdgeDistance(0.75)).toBe(1);
    expect(minEdgeDistance(1.125)).toBe(1.5);
    expect(minEdgeDistance(1.5)).toBe(1.875);
    expect(minSpacing(0.75)).toEqual({ min: 2, preferred: 2.25 });
  });
  it("rejects invalid physical inputs", () => {
    expect(() => boltArea(NaN)).toThrow();
    expect(() => boltShear({ bolt, planes: 1.5 })).toThrow();
    expect(() => slipResistance({ bolt: { ...bolt, group: "A307" }, surface: "A" })).toThrow();
    expect(() => boltBearing({ d: 0.75, t: -1, Fu: 58, lc: 1 })).toThrow();
  });
});
