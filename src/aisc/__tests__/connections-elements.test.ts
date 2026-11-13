import { describe, expect, it } from "vitest";
import { available } from "../common";
import { flexuralBucklingFcr } from "../compression";
import { blockShear } from "../tension";
import {
  boltedSpliceEffectiveArea,
  elementBlockShear,
  elementBoltedSpliceTensionRupture,
  elementCompression,
  elementShearRupture,
  elementShearYielding,
  elementTensionRupture,
  elementTensionYielding,
} from "../connections/elements";
const input = { Fy: 36, Fu: 58, Ag: 4, An: 3, Ae: 2.8, Agv: 5, Anv: 4 };
describe("AISC connecting elements §J4", () => {
  it("J4-1 gross tensile yielding hand calculation", () =>
    expect(available(elementTensionYielding(input), "LRFD")).toBeCloseTo(0.9 * 36 * 4));
  it("J4-2 effective net tensile rupture hand calculation", () =>
    expect(available(elementTensionRupture(input), "ASD")).toBeCloseTo((58 * 2.8) / 2));
  it("caps bolted splice plates explicitly without capping welded plates", () => {
    expect(boltedSpliceEffectiveArea(4, 3.9)).toBe(3.4);
    expect(elementBoltedSpliceTensionRupture({ ...input, An: 4, Ae: 3.9 }).nominal).toBeCloseTo(58 * 3.4);
    expect(elementTensionRupture({ ...input, An: 4, Ae: 3.9 }).nominal).toBeCloseTo(58 * 3.9);
  });
  it("J4-3/J4-4 separate shear factors", () => {
    expect(available(elementShearYielding(input), "LRFD")).toBeCloseTo(0.6 * 36 * 5);
    expect(available(elementShearRupture(input), "LRFD")).toBeCloseTo(0.75 * 0.6 * 58 * 4);
  });
  it("reuses the existing J4-5 block shear implementation", () => {
    const data = { Agv: 5, Anv: 4, Ant: 1, Fy: 36, Fu: 58, Ubs: 0.5 };
    expect(elementBlockShear(data).nominal).toBe(blockShear(data).nominal);
    expect(available(elementBlockShear(data), "ASD")).toBe(blockShear({ ...data, method: "ASD" }).available);
  });
  it.each([0, 25])("J4-6 KL/r=%s permits yielding", (KL) =>
    expect(elementCompression({ ...input, KL, r: 1 }).nominal).toBe(36 * 4),
  );
  it.each([25.01, 80, 200])("Chapter E flexural buckling at KL/r=%s", (KL) => {
    const expected = flexuralBucklingFcr(36, (Math.PI ** 2 * 29000) / KL ** 2) * 4;
    expect(elementCompression({ ...input, KL, r: 1 }).nominal).toBeCloseTo(expected, 10);
  });
  it("rejects unestablished slenderness, inconsistent net areas and material", () => {
    expect(() => elementCompression(input)).toThrow();
    expect(() => elementTensionRupture({ ...input, Ae: 5 })).toThrow();
    expect(() => elementShearYielding({ ...input, Fy: 100 })).toThrow();
  });
});
