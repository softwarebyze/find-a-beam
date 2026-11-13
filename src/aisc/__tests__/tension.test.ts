import { describe, expect, it } from "vitest";
import { materialById, preferredMaterial } from "@/data/materials";
import { SHAPES, familyOf, findShape, req } from "@/data/shapes";
import { available } from "../common";
import { tensionStrength, shearLagU, shearLagReport, netArea, netAreaReport, blockShear } from "../tension";
const mat = materialById("A992")!, s = findShape("W14X90")!;

describe("D2 tension at Table 5-1 effective-area assumption", () => {
  it.each(["W14X90", "W14X120", "W12X65", "W10X49", "W8X31"])("%s with Ae = .75Ag", label => {
    const shape = findShape(label)!, Ag = req(shape, "A");
    const r = tensionStrength(shape, mat, { U: .75 });
    // Independent arithmetic: φPy=.9*50Ag=45Ag; φPu=.75*65*.75Ag=36.5625Ag.
    expect(available(r, "LRFD")).toBeCloseTo(36.5625 * Ag, 10);
    // ASD: min(50Ag/1.67,65*.75Ag/2) = 24.375Ag.
    expect(available(r, "ASD")).toBeCloseTo(24.375 * Ag, 10);
    expect(r.governing).toBe("TR");
  });
  it("preserves separate φ/Ω and reports the method-specific governing state", () => {
    // Choose U=.9225 between LRFD crossover .9230769 and ASD crossover .9212345.
    const lrfd = tensionStrength(s, mat, { U: .9225 }), asd = tensionStrength(s, mat, { U: .9225, method: "ASD" });
    expect(lrfd.governing).toBe("TR"); expect(asd.governing).toBe("TY");
    expect(available(lrfd, "ASD")).toBeCloseTo(50 * 26.5 / 1.67, 10);
    expect(available(asd, "LRFD")).toBeCloseTo(.75 * 65 * .9225 * 26.5, 10);
  });
  it("validates An and U rather than allowing a spurious strength", () => {
    expect(() => tensionStrength(s, mat, { An: 30 })).toThrow(RangeError);
    expect(() => tensionStrength(s, mat, { U: 1.1 })).toThrow(RangeError);
    expect(() => tensionStrength(s, mat, { An: 0 })).toThrow(RangeError);
  });
});
describe("Table D3.1 shear lag", () => {
  it("Cases 1 and 3 give 1, with the Case 3 area restriction documented", () => {
    expect(shearLagU({ case: 1 })).toBe(1); expect(shearLagU({ case: 3 })).toBe(1);
    expect(shearLagReport({ case: 3 }).steps[0]!.note).toContain("directly connected");
  });
  it("Case 2 uses 1-xbar/l and permits the open-section connected-area floor", () => {
    expect(shearLagU({ case: 2, xBar: 1.5, length: 10 })).toBe(.85);
    expect(shearLagU({ case: 2, xBar: 1.5, length: 10, connectedAreaRatio: .9 })).toBe(.9);
  });
  it("Case 4 uses the revised 360-22 formula, not old weld-length bands", () => {
    // l=6, w=4, xbar=1: (108/124)*(5/6)=.72580645.
    expect(shearLagU({ case: 4, xBar: 1, length: 6, width: 4 })).toBeCloseTo(.7258064516129032, 12);
  });
  it.each([[10,12,.9],[6,12,.85]] as const)("Case 7 flange bf=%s d=%s", (bf, d, U) => {
    expect(shearLagU({ case: 7, connection: "flange", fastenersPerLine: 3, bf, d })).toBe(U);
  });
  it("Case 7 web, Case 8 fastener counts, and alternate Case 2", () => {
    expect(shearLagU({ case: 7, connection: "web", fastenersPerLine: 4, bf: 10, d: 12 })).toBe(.7);
    expect(shearLagU({ case: 8, fastenersPerLine: 4 })).toBe(.8);
    expect(shearLagU({ case: 8, fastenersPerLine: 3 })).toBe(.6);
    expect(shearLagU({ case: 8, fastenersPerLine: 3, xBar: 1, length: 10 })).toBe(.9);
    expect(shearLagU({ case: 8, fastenersPerLine: 2, xBar: 1, length: 5 })).toBe(.8);
  });
  it("rejects inapplicable cases and nonphysical geometry", () => {
    expect(() => shearLagU({ case: 7, connection: "web", fastenersPerLine: 3, bf: 10, d: 12 })).toThrow(RangeError);
    expect(() => shearLagU({ case: 8, fastenersPerLine: 2 })).toThrow(RangeError);
    expect(() => shearLagU({ case: 2, xBar: 10, length: 5 })).toThrow(RangeError);
  });
});
describe("B4.3b net area", () => {
  it("deducts an additional 1/16 in. from the actual nominal hole size", () => {
    // 2 holes, hole diameter 13/16 in., thickness 1/2 in.: deduct .875 in².
    expect(netArea(s, [{ diameter: 13/16, thickness: .5, count: 2 }])).toBe(26.5 - .875);
    expect(netArea(s, [])).toBe(26.5);
  });
  it("adds stagger s²/4g times thickness along a candidate path", () => {
    const r = netAreaReport(s, { holes: [{ diameter: 13/16, thickness: .5, count: 2 }], stagger: [{ s: 3, g: 4, thickness: .5 }] });
    expect(r.An).toBe(26.5 - .875 + .28125);
    expect(r.steps.every(step => step.ref && step.quantity)).toBe(true);
  });
  it("rejects a path with zero net area", () => {
    expect(() => netArea(s, [{ diameter: 30, thickness: 1 }])).toThrow(RangeError);
  });
});
describe("J4-5 block shear", () => {
  it("caps shear rupture by gross shear yielding and applies the correct factors", () => {
    // Rupture: .6*65*3+65*1=182; yielding: .6*50*4+65=185 => Rn=182.
    const r = blockShear({ Agv: 4, Anv: 3, Ant: 1, Fy: 50, Fu: 65 });
    expect(r.nominal).toBe(182); expect(r.available).toBe(136.5); expect(available(r, "ASD")).toBe(91);
    expect(blockShear({ Agv: 4, Anv: 3.5, Ant: 1, Fy: 50, Fu: 65 }).nominal).toBe(185);
  });
  it("uses Ubs=.5 for nonuniform tension and validates areas", () => {
    expect(blockShear({ Agv: 4, Anv: 3, Ant: 1, Fy: 50, Fu: 65, Ubs: .5, method: "ASD" }).available).toBe(149.5 / 2);
    expect(() => blockShear({ Agv: 3, Anv: 4, Ant: 1, Fy: 50, Fu: 65 })).toThrow(RangeError);
  });
});
describe("complete tension database sweep", () => {
  it("all database shapes have finite positive available strengths and cited reports", () => {
    for (const shape of SHAPES) {
      const r = tensionStrength(shape, preferredMaterial(shape.type, familyOf(shape)), { U: .75 });
      expect(Number.isFinite(available(r, "LRFD")), shape.label).toBe(true); expect(available(r, "ASD")).toBeGreaterThan(0);
      for (const state of r.limitStates) {
        expect("quantity" in state && state.quantity === "force").toBe(true);
        for (const step of state.steps) expect(Boolean(step.quantity && step.ref)).toBe(true);
      }
      for (const step of r.steps) expect(Boolean(step.quantity && step.ref)).toBe(true);
    }
  });
});
