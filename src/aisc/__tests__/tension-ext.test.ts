import { describe, expect, it } from "vitest";
import { pinConnectedStrength, eyebarStrength, shearLagReport, shearLagU } from "../tension";
import { available } from "../common";
import { materialById } from "@/data/materials";
const mat = materialById("A36")!;
describe("HSS Table D3.1 Cases 5/6", () => {
  it("round single concentric gusset uses the 2022 exponential U", () => {
    const theta = Math.acos(0.5 / 6),
      x = (3 * Math.sin(theta)) / theta - 0.25;
    const r = shearLagReport({ case: 5, section: "round", D: 6, gussetThickness: 0.5, length: 16 });
    expect(r.U).toBeCloseTo((1 + (x / 16) ** 3.2) ** -10);
    expect(r.steps[0]!.value).toBeCloseTo(x);
  });
  it("rectangular single gusset uses b measured from face of gusset", () => {
    const B = 6,
      H = 8,
      t = 0.25,
      tp = 0.5,
      b = (B - tp) / 2;
    const x = b - (2 * b * b + t * H - 2 * t * t) / (2 * H + 4 * b - 4 * t);
    expect(shearLagU({ case: 5, section: "rectangular", B, H, t, gussetThickness: tp, length: 12 })).toBeCloseTo(
      1 - x / 12,
    );
  });
  it("two side gussets weight UB by B and UH by H", () => {
    const l = 12,
      B = 6,
      H = 8;
    expect(shearLagU({ case: 6, B, H, length: l })).toBeCloseTo(
      ((B * 3 * l * l) / (3 * l * l + B * B) + (H * 3 * l * l) / (3 * l * l + H * H)) / (B + H),
    );
    expect(() => shearLagU({ case: 5, section: "round", D: 6, gussetThickness: 6, length: 12 })).toThrow();
  });
});
describe("D5 pin-connected plate checks", () => {
  const input = {
    t: 0.5,
    width: 6,
    pinDiameter: 2,
    holeDiameter: 2 + 1 / 32,
    a: 3,
    centered: true,
    relativeMovement: true,
  };
  it("computes rupture, shear rupture, bearing and gross yielding", () => {
    const r = pinConnectedStrength(mat, input),
      be = 1.63;
    expect(r.limitStates.map((s) => s.nominal)).toEqual([
      58 * 2 * 0.5 * be,
      0.6 * 58 * 2 * 0.5 * (3 + 1),
      1.8 * 36 * 2 * 0.5,
      36 * 6 * 0.5,
    ]);
    expect(r.detailingPass).toBe(true);
    expect(available(r, "LRFD")).toBeCloseTo(Math.min(...r.limitStates.map((s) => s.phi! * s.nominal)));
  });
  it("applies Cr=.95 and flags movement clearance on small pins", () => {
    const a = pinConnectedStrength(mat, input),
      b = pinConnectedStrength(mat, { ...input, holeDiameter: 2 + 1 / 16 });
    expect(b.limitStates[1]!.nominal / a.limitStates[1]!.nominal).toBe(0.95);
    expect(b.detailingPass).toBe(false);
  });
  it("rejects unspecified clearance and flags insufficient end extension", () => {
    expect(() => pinConnectedStrength(mat, { ...input, holeDiameter: 2.1 })).toThrow();
    expect(pinConnectedStrength(mat, { ...input, a: 0.1 }).detailingPass).toBe(false);
  });
});
describe("D6 eyebars", () => {
  const input = {
    width: 4,
    t: 0.5,
    pinDiameter: 3.5,
    holeDiameter: 3.5 + 1 / 32,
    headDiameter: 9,
    transitionRadius: 9,
    uniformConcentricHead: true,
  };
  it("body yields at Fy Ag with D2 factors and separate dimensional checks", () => {
    const r = eyebarStrength(mat, input);
    expect(r.limitStates[0]!.nominal).toBe(72);
    expect(r.detailingPass).toBe(true);
    expect(available(r, "LRFD")).toBe(64.8);
  });
  it("limits calculated body width to 8t and checks thin-plate nuts", () => {
    const r = eyebarStrength(mat, { ...input, t: 0.25 });
    expect(r.limitStates[0]!.nominal).toBe(18);
    expect(r.detailingPass).toBe(false);
  });
  it("checks high strength hole diameter and minimum head width", () => {
    expect(eyebarStrength({ ...mat, Fy: 80, Fu: 100 }, input).detailingPass).toBe(false);
    expect(eyebarStrength(mat, { ...input, headDiameter: 8 }).detailingPass).toBe(false);
  });
});
