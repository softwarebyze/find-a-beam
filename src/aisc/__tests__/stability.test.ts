import { describe, expect, it } from "vitest";
import { Cm, Pe1, B1, EFFECTIVE_LENGTH_CASES, magnificationReport } from "../stability";
describe("Appendix 8 member magnification", () => {
  it("Cm preserves the Appendix 8 end-moment sign convention", () => {
    expect(Cm(100, 100)).toBeCloseTo(.2); // Equal reverse-curvature end actions, M1/M2 = +1.
    expect(Cm(-100, 100)).toBe(1); // Single curvature, M1/M2 = -1.
    expect(Cm(0, 100)).toBe(.6);
    expect(Cm(100, 50)).toBeCloseTo(.4);
    expect(Cm(0, 0)).toBe(1);
  });
  it("Pe1 uses the supplied analysis stiffness and effective length", () => {
    // π²*(29000*100)/120² = 1987.6287 kip.
    expect(Pe1(29000 * 100, 120)).toBeCloseTo(1987.628664, 5);
    expect(Pe1(.8 * 29000 * 100, 120)).toBeCloseTo(.8 * Pe1(29000*100, 120));
  });
  it("B1 floors at one, applies α=1/1.6, and flags elastic instability", () => {
    expect(B1(100, 1000, .6)).toBe(1);
    expect(B1(200, 1000, 1)).toBe(1.25);
    expect(B1(200, 1000, 1, "ASD")).toBeCloseTo(1 / .68);
    expect(B1(1000, 1000, 1)).toBe(Infinity);
    expect(B1(0, Infinity, .6)).toBe(1);
    expect(() => B1(-1, 1000, 1)).toThrow(RangeError);
  });
  it("provides cited, unit-aware report steps", () => {
    const r = magnificationReport(200, 29000 * 100, 120, 1, "ASD");
    expect(r.B1).toBeCloseTo(B1(200, Pe1(29000*100,120), 1, "ASD"));
    for (const step of r.steps) expect(Boolean(step.quantity && step.ref)).toBe(true);
    expect(r.steps[0]!.quantity).toBe("span");
  });
});
describe("Commentary Table C-A-7.1", () => {
  it("retains the six published theoretical and recommended K values", () => {
    expect(EFFECTIVE_LENGTH_CASES.map(c => c.theoreticalK)).toEqual([.5,.7,1,1,2,2]);
    expect(EFFECTIVE_LENGTH_CASES.map(c => c.recommendedK)).toEqual([.65,.8,1,1.2,2.1,2]);
    expect(EFFECTIVE_LENGTH_CASES.every(c => c.description && c.ref && c.quantity === "ratio")).toBe(true);
  });
});
