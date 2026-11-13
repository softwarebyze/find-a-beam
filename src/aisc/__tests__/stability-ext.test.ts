import { describe, expect, it } from "vitest";
import {
  alignmentK,
  gFactor,
  tauB,
  storyAmplification,
  columnBracing,
  beamLateralBracing,
  beamTorsionalBracing,
} from "../stability";
describe("Commentary Appendix 7 chart solutions", () => {
  it("matches equal G=1 chart readings, without empirical K fits", () => {
    // Readings of Figures C-A-7.1/2; transcendental equation solutions refine rounded chart values.
    expect(alignmentK({ GA: 1, GB: 1, sway: true })).toBeCloseTo(1.32, 2);
    expect(alignmentK({ GA: 1, GB: 1, sway: false })).toBeCloseTo(0.77, 2);
  });
  it("recovers fixed-fixed and pinned-pinned boundaries", () => {
    expect(alignmentK({ GA: 0, GB: 0, sway: true })).toBe(1);
    expect(alignmentK({ GA: 0, GB: 0, sway: false })).toBe(0.5);
    expect(alignmentK({ GA: Infinity, GB: Infinity, sway: false })).toBe(1);
    expect(alignmentK({ GA: Infinity, GB: Infinity, sway: true })).toBe(Infinity);
    expect(alignmentK({ GA: 0, GB: Infinity, sway: false })).toBeCloseTo(0.69916, 4);
    expect(alignmentK({ GA: 0, GB: Infinity, sway: true })).toBeCloseTo(2, 6);
  });
  it("is symmetric and monotonic as joint restraint is removed", () => {
    for (const sway of [true, false]) {
      expect(alignmentK({ GA: 2, GB: 5, sway })).toBeCloseTo(alignmentK({ GA: 5, GB: 2, sway }), 10);
      expect(alignmentK({ GA: 2, GB: 5, sway })).toBeGreaterThan(alignmentK({ GA: 1, GB: 5, sway }));
    }
    expect(() => alignmentK({ GA: -1, GB: 1, sway: true })).toThrow();
  });
  it("uses sums of EI/L and the correct girder far-end factors", () => {
    const m = { E: 29000, I: 100, L: 120 };
    expect(gFactor({ columns: [m, m], girders: [m], sway: true })).toBe(2);
    expect(gFactor({ columns: [m], girders: [{ ...m, farEnd: "pinned" }], sway: true })).toBe(0.5);
    expect(gFactor({ columns: [m], girders: [{ ...m, farEnd: "fixed" }], sway: true })).toBeCloseTo(2 / 3);
    expect(gFactor({ columns: [m], girders: [{ ...m, farEnd: "fixed" }], sway: false })).toBe(0.5);
    expect(gFactor({ columns: [m], girders: [], sway: true })).toBe(Infinity);
  });
  it("reduces only inelastic column stiffness", () => {
    expect(tauB(0.5, 1)).toBe(1);
    expect(tauB(0.75, 1)).toBe(0.75);
    expect(tauB(0.4, 1, "ASD")).toBeCloseTo(4 * 0.64 * 0.36);
    expect(() => tauB(1, 1)).toThrow();
  });
});
describe("Appendix 8 story amplification", () => {
  it("matches a hand story calculation and applies ASD alpha", () => {
    // RM=.925; Pe=.925*100*144/.5=26640 kip.
    const input = { Pstory: 2000, Pmf: 1000, H: 100, L: 144, drift: 0.5 };
    const r = storyAmplification(input);
    expect(r.RM).toBe(0.925);
    expect(r.PeStory).toBe(26640);
    expect(r.B2).toBeCloseTo(1 / (1 - 2000 / 26640));
    expect(storyAmplification({ ...input, method: "ASD" }).B2).toBeCloseTo(1 / (1 - 3200 / 26640));
  });
  it("handles zero drift and instability explicitly", () => {
    expect(storyAmplification({ Pstory: 100, H: 10, L: 120, drift: 0 }).B2).toBe(1);
    expect(storyAmplification({ Pstory: 1200, H: 10, L: 120, drift: 1 }).B2).toBe(Infinity);
    expect(() => storyAmplification({ Pstory: 100, Pmf: 200, H: 10, L: 120, drift: 1 })).toThrow();
  });
});
describe("Appendix 6 requirements", () => {
  it("column panel and point strength, stiffness and connection force", () => {
    const p = columnBracing({ Pr: 300, Lbr: 120, type: "point" }),
      panel = columnBracing({ Pr: 300, Lbr: 120, type: "panel" });
    expect(p.strength).toBe(3);
    expect(p.stiffness).toBeCloseTo((8 * 300) / (0.75 * 120));
    expect(panel.strength).toBe(1.5);
    expect(panel.connectionStrength).toBe(3);
    expect(columnBracing({ Pr: 300, Lbr: 120, type: "point", method: "ASD" }).stiffness).toBe(40);
  });
  it("beam lateral point/panel Cd and stiffness", () => {
    const r = beamLateralBracing({ Mr: 2400, ho: 20, Lbr: 120, Cd: 2, type: "point" });
    expect(r.strength).toBe(4.8);
    expect(r.stiffness).toBeCloseTo((10 * 2400 * 2) / (0.75 * 120 * 20));
    expect(beamLateralBracing({ Mr: 2400, ho: 20, Lbr: 120, type: "panel" }).strength).toBe(1.2);
  });
  it("torsional brace distortion, ASD Omega=3 and stiffener sizing", () => {
    const input = { Mr: 2400, L: 360, Lbr: 120, n: 2, Iyeff: 100, ho: 18, tw: 0.35, bs: 6, tst: 0.375 };
    const r = beamTorsionalBracing(input);
    expect(r.betaT).toBeCloseTo((((3.6 * 360) / (2 * 29000 * 100)) * 2400 ** 2) / 0.75);
    expect(r.betaSec).toBeCloseTo(((3.3 * 29000) / 18) * ((18 * 0.35 ** 3) / 12 + (0.375 * 6 ** 3) / 12));
    expect(r.strength).toBeGreaterThanOrEqual(48);
    expect(beamTorsionalBracing({ ...input, method: "ASD" }).betaT / r.betaT).toBeCloseTo(2.25);
    expect(beamTorsionalBracing({ ...input, rigidWeb: true }).stiffness).toBeCloseTo(r.betaT);
    const weak = beamTorsionalBracing({ ...input, tw: 0.01, tst: 0 });
    expect(weak.effective).toBe(false);
    expect(weak.stiffness).toBe(Infinity);
    expect(beamTorsionalBracing({ ...input, tw: 0.01, tst: weak.minimumTst * 1.01 }).effective).toBe(true);
  });
});
