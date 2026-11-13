import { describe, expect, it } from "vitest";
import { available } from "../common";
import {
  filletWeld,
  filletWeldPerInch,
  maxFilletWeldSize,
  minFilletWeldSize,
  minimumBaseMetalThickness,
  minimumBaseMetalThicknessForTwoWeldLines,
  weldBaseMetalShear,
} from "../connections/welds";
describe("AISC fillet welds", () => {
  it("Manual Part 8 E70 available strength per inch per sixteenth", () => {
    expect(filletWeldPerInch(1, "LRFD")).toBe(1.392);
    expect(filletWeldPerInch(1, "ASD")).toBeCloseTo(0.928, 12);
    expect(filletWeldPerInch(4, "LRFD", 80)).toBeCloseTo((1.392 * 4 * 80) / 70, 12);
    // Independent 0.75 × 0.6 × 70 × 0.707 × 1/16; Manual rounds the coefficient.
    expect(available(filletWeld({ w: 1 / 16, length: 1 }), "LRFD")).toBeCloseTo(1.392, 3);
  });
  it("J2-4/J2-5 effective throat and directional strength", () => {
    const longitudinal = filletWeld({ w: 0.25, length: 8 }),
      transverse = filletWeld({ w: 0.25, length: 8, theta: 90 });
    expect(longitudinal.nominal).toBeCloseTo(0.6 * 70 * 0.707 * 0.25 * 8, 12);
    expect(transverse.nominal / longitudinal.nominal).toBeCloseTo(1.5, 12);
    expect(filletWeld({ w: 0.25, length: 8, theta: -90 }).nominal).toBe(transverse.nominal);
  });
  it.each([
    [0.25, 0.125],
    [0.251, 0.1875],
    [0.5, 0.1875],
    [0.501, 0.25],
    [0.75, 0.25],
    [0.751, 0.3125],
  ])("Table J2.4 t=%s", (t, w) => expect(minFilletWeldSize(t)).toBe(w));
  it("J2.2b edge maximum at the 1/4-in. boundary", () => {
    expect(maxFilletWeldSize(0.2)).toBe(0.2);
    expect(maxFilletWeldSize(0.25)).toBe(0.1875);
    expect(maxFilletWeldSize(0.5)).toBe(0.4375);
  });
  it("limits effective size to L/4 for short welds", () =>
    expect(filletWeld({ w: 0.5, length: 1 }).nominal).toBeCloseTo(0.6 * 70 * 0.707 * 0.25));
  it("checks both yielding and rupture of unperforated base metal", () => {
    const r = weldBaseMetalShear({ t: 0.25, length: 10, Fy: 36, Fu: 58 });
    expect(available(r, "LRFD")).toBeCloseTo(Math.min(0.6 * 36 * 2.5, 0.75 * 0.6 * 58 * 2.5), 12);
    expect(available(r, "ASD")).toBeCloseTo(Math.min((0.6 * 36 * 2.5) / 1.5, (0.6 * 58 * 2.5) / 2), 12);
    expect(r.limitStates).toHaveLength(2);
  });
  it("Manual Part 9 thickness matches nominal weld and base rupture strengths", () => {
    expect(minimumBaseMetalThickness(4, 58, 1)).toBeCloseTo((3.09 * 4) / 58, 12);
    expect(minimumBaseMetalThickness(4, 58, 2)).toBeCloseTo((6.19 * 4) / 58, 12);
  });
  it("distinguishes weld lines from resisting base-metal sides", () => {
    expect(minimumBaseMetalThicknessForTwoWeldLines(4, 58, 1)).toBeCloseTo((6.19 * 4) / 58, 12);
    expect(minimumBaseMetalThicknessForTwoWeldLines(4, 58, 2)).toBeCloseTo((3.09 * 4) / 58, 12);
    expect(minimumBaseMetalThickness(4, 58, 2, 2)).toBeCloseTo((6.19 * 4) / (2 * 58), 12);
  });
  it("rejects invalid input", () => {
    expect(() => filletWeld({ w: 0, length: 1 })).toThrow();
    expect(() => filletWeld({ w: 0.25, length: NaN })).toThrow();
    expect(() => minFilletWeldSize(-1)).toThrow();
  });
});
