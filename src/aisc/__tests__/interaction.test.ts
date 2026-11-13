import { describe, expect, it } from "vitest";
import { interaction, tensionLtbFactor, type SeparatePlaneInteractionInput } from "../interaction";
import { UnsupportedError } from "../types";

describe("H1-1a/b combined forces", () => {
  it("switches at axial ratio .2 with a continuous interaction surface", () => {
    expect(interaction({ Pr: 20, Pc: 100, Mrx: 90, Mcx: 100 }).equation).toBe("H1-1a");
    expect(interaction({ Pr: 20, Pc: 100, Mrx: 90, Mcx: 100 }).ratio).toBeCloseTo(1);
    expect(interaction({ Pr: 19.99999, Pc: 100, Mrx: 90, Mcx: 100 }).ratio).toBeCloseTo(1, 6);
    expect(interaction({ Pr: 10, Pc: 100, Mrx: 20, Mcx: 100, Mry: -30, Mcy: 100 }).ratio).toBeCloseTo(.55);
  });
  it("treats H1 demands as magnitudes and rejects missing minor-axis strength", () => {
    expect(interaction({ Pr: -40, Pc: 100, Mrx: -30, Mcx: 100 }).ratio).toBeCloseTo(.4 + 8/9 * .3);
    expect(() => interaction({ Pr: 10, Pc: 100, Mrx: 20, Mcx: 100, Mry: 1 })).toThrow(RangeError);
    expect(() => interaction({ Pr: 10, Pc: 0, Mrx: 20, Mcx: 100 })).toThrow(RangeError);
  });
});
const separate: SeparatePlaneInteractionInput = { mode: "H1.3", doublySymmetricRolledCompact: true, Lcz: 120, Lcy: 120, Pr: 40, Pc: 100, Pcx: 200, Pcy: 100, Mrx: 60, Mcx: 100, McxYield: 200, McxLTB: 100, Cb: 1 };
describe("H1.3 independent plane checks", () => {
  it("takes max of in-plane H1 and out-of-plane H1-3", () => {
    // In-plane=.2+(8/9)*.3=.4666667; out=.4*(1.5-.5*.4)+.6²=.88.
    const r = interaction(separate);
    expect(r.ratio).toBeCloseTo(.88); expect(r.equation).toBe("H1-3"); expect(r.checks).toHaveLength(2);
  });
  it("allows yielding in-plane to govern", () => {
    const r = interaction({ ...separate, McxYield: 70, Cb: 2 });
    expect(r.equation).toBe("H1-1a"); expect(r.ratio).toBeCloseTo(.2 + 8/9 * 60/70);
  });
  it("rejects ineligible length ratios and minor-axis moments", () => {
    expect(() => interaction({ ...separate, Lcz: 121 })).toThrow(UnsupportedError);
    expect(() => interaction({ ...separate, Mry: 5, Mcy: 100 })).toThrow(UnsupportedError);
  });
  it("does not report pass for axial force beyond out-of-plane capacity", () => {
    expect(interaction({ ...separate, Pr: 400, Pcx: 10000, Mrx: 0 }).ratio).toBeGreaterThan(1);
  });
});
describe("H2-1 pointwise signed stresses", () => {
  it("preserves cancellation at each point and checks all critical points", () => {
    const r = interaction({ mode: "H2", points: [
      { label: "A", fra: 10, Fca: 20, frbw: -15, Fcbw: 30, frbz: 5, Fcbz: 25 },
      { label: "B", fra: 10, Fca: 20, frbw: 15, Fcbw: 30, frbz: -5, Fcbz: 25 },
    ] });
    expect(r.checks!.map(c => c.ratio)).toEqual([.2, .8]); expect(r.ratio).toBe(.8); expect(r.equation).toBe("H2-1");
  });
  it("handles tension stress sense and rejects invalid denominators", () => {
    expect(interaction({ mode: "H2", points: [{ fra: -10, Fca: 20, frbw: -15, Fcbw: 30 }] }).ratio).toBe(1);
    expect(() => interaction({ mode: "H2", points: [] })).toThrow(RangeError);
    expect(() => interaction({ mode: "H2", points: [{ fra: 1, Fca: 0, frbw: 1, Fcbw: 10 }] })).toThrow(RangeError);
  });
});
describe("H1.2 tension lateral-torsional benefit", () => {
  it("computes H1-2 Pey and √(1+αPr/Pey), for each method", () => {
    const Pey = Math.PI ** 2 * 29000 * 100 / 120 ** 2;
    expect(tensionLtbFactor(100, 100, 120).Pey).toBeCloseTo(Pey);
    expect(tensionLtbFactor(100, 100, 120).factor).toBeCloseTo(Math.sqrt(1+100/Pey));
    expect(tensionLtbFactor(100, 100, 120, "ASD").factor).toBeCloseTo(Math.sqrt(1+160/Pey));
    expect(tensionLtbFactor(100, 100, 0).factor).toBe(1);
  });
  it("every interaction step has quantity and reference", () => {
    for (const r of [interaction(separate), interaction({ Pr: 10, Pc: 100, Mrx: 10, Mcx: 100 }), interaction({ mode: "H2", points: [{ fra: 1, Fca: 10, frbw: 1, Fcbw: 10 }] })]) {
      for (const step of r.steps) expect(Boolean(step.quantity && step.ref)).toBe(true);
    }
  });
});
