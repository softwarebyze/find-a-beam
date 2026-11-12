/** Verification against tabulated values in the AISC Steel Construction Manual, 16th Ed. */
import { describe, expect, it } from "vitest";
import { materialById } from "@/data/materials";
import { findShape } from "@/data/shapes";
import { available, compressionStrength, flexuralStrength, shearStrength } from "@/aisc";

const A992 = materialById("A992")!;
const shape = (n: string) => findShape(n)!;
const kipft = (kipin: number) => kipin / 12;

describe("Manual Table 3-2 (W-shapes, Fy = 50 ksi)", () => {
  it("W18×50: φMpx = 379 kip-ft, Lp = 5.83 ft, Lr = 16.9 ft, φVnx = 192 kips", () => {
    const f = flexuralStrength(shape("W18X50"), A992, { axis: "major", Lb: 0 });
    expect(kipft(available(f, "LRFD"))).toBeCloseTo(379, 0);
    expect(kipft(available(f, "ASD"))).toBeCloseTo(252, 0);
    expect(f.Lp! / 12).toBeCloseTo(5.83, 1);
    expect(f.Lr! / 12).toBeCloseTo(16.9, 0);
    const v = shearStrength(shape("W18X50"), A992, { axis: "major" });
    expect(available(v, "LRFD")).toBeCloseTo(192, -1);
  });

  it("W14×90 (noncompact flange): φMpx = 574 kip-ft", () => {
    const f = flexuralStrength(shape("W14X90"), A992, { axis: "major", Lb: 0 });
    expect(f.governing).toBe("FLB");
    expect(kipft(available(f, "LRFD"))).toBeCloseTo(574, -1);
  });
});

describe("Manual Table 4-1a (W-shape columns, Fy = 50 ksi)", () => {
  it("W14×90 at Lc = 10 ft: φPn ≈ 1100 kips", () => {
    const c = compressionStrength(shape("W14X90"), A992, { Lcx: 120, Lcy: 120 });
    expect(available(c, "LRFD")).toBeGreaterThan(1090);
    expect(available(c, "LRFD")).toBeLessThan(1115);
  });
});
