import { describe, expect, it } from "vitest";
import { flexuralStrength } from "../flexure";
import { angleLtb } from "../flexure/angles-tees";
import { E, materialById } from "@/data/materials";
import { findShape, req } from "@/data/shapes";
const shape = findShape("L6X4X1/2")!,
  mat = materialById("A36")!;
describe("F10 principal-axis unequal-leg angle", () => {
  it("F10-4 uses signed beta from Commentary Table C-F10.1 and Cb capped at 1.5", () => {
    const Lb = 120,
      rz = req(shape, "rz"),
      t = req(shape, "t"),
      B = (-4.4 * 3.14 * rz) / (Lb * t);
    const Mcr = (((9 / 8) * E * req(shape, "A") * rz * t * 1.5) / Lb) * (Math.sqrt(1 + B * B) + B);
    const r = flexuralStrength(shape, mat, { axis: "major", Lb, Cb: 2, principalAxis: true });
    expect(r.limitStates.find((s) => s.id === "LTB")!.nominal).toBeCloseTo(
      angleLtb(36 * Math.min(7.14, 14.2, 5.04), Mcr),
    );
    expect(r.steps.filter((s) => s.label.startsWith("Principal modulus"))).toHaveLength(3);
  });
  it("short-leg compression is more stable than long-leg compression", () => {
    const input = { axis: "major" as const, Lb: 240, principalAxis: true };
    const a = flexuralStrength(shape, mat, input),
      b = flexuralStrength(shape, mat, { ...input, shortLegInCompression: true });
    expect(b.limitStates.find((s) => s.id === "LTB")!.nominal).toBeGreaterThan(
      a.limitStates.find((s) => s.id === "LTB")!.nominal,
    );
  });
  it("z-axis uses SzA/B/C and does not have lateral torsional buckling", () => {
    const r = flexuralStrength(shape, mat, { axis: "minor", Lb: 240, principalAxis: true });
    expect(r.Mp).toBeCloseTo(1.5 * 36 * Math.min(1.72, 2.08, 3.71));
    expect(r.limitStates.some((s) => s.id === "LTB")).toBe(false);
  });
  it("principal fully restrained bending reaches the section yield cap", () => {
    const r = flexuralStrength(shape, mat, { axis: "major", Lb: 0, principalAxis: true });
    expect(r.nominal).toBeCloseTo(1.5 * 36 * 5.04);
  });
});
