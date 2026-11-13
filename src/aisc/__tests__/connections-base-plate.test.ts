import { describe, expect, it } from "vitest";
import { basePlate, sizeBasePlate, type BasePlateInput } from "../connections/base-plate";
import { findShape } from "@/data/shapes";
const w = findShape("W14X90")!;
const input: BasePlateInput = {
  P: 400,
  N: 24,
  B: 24,
  thickness: 1.5,
  fc: 4,
  Fy: 36,
  pedestalN: 36,
  pedestalB: 36,
  anchorDiameter: 0.75,
  anchorGrade: "55",
  anchorCount: 4,
  anchorEdge: 2,
};
const run = (patch: Partial<BasePlateInput> = {}) => basePlate(w, { ...input, ...patch });
describe("DG1 third edition / J8 base plate — independent hand calculations, not a claimed published example", () => {
  // W14x90: d14 bf14.5. 24x24 plate, 36x36 pedestal. A2/A1=2.25,
  // φfp=.65*.85*4*1.5=3.315 ksi, fp=400/576=.694444 ksi.
  // m=(24-.95*14)/2=5.35, n=(24-.8*14.5)/2=6.2 controls.
  // t=6.2 sqrt(2*400/(.9*36*576))=1.28369 in.
  it("concentric bearing pressure and confinement", () => {
    const r = run();
    expect(r.A1).toBe(576);
    expect(r.A2).toBe(1296);
    expect(r.fpMax).toBeCloseTo(3.315, 6);
    expect(r.fp).toBeCloseTo(400 / 576, 6);
  });
  it("concentric cantilevers and thickness", () => {
    const r = run();
    expect(r.m).toBeCloseTo(5.35, 6);
    expect(r.n).toBeCloseTo(6.2, 6);
    expect(r.ell).toBeCloseTo(6.2, 6);
    expect(r.requiredThickness).toBeCloseTo(6.2 * Math.sqrt((2 * 400) / (0.9 * 36 * 576)), 6);
    expect(r.pass).toBe(true);
  });
  it("confinement is capped at two", () => expect(run({ pedestalN: 100, pedestalB: 100 }).bearingFactor).toBe(2));
  it("A2 uses a geometrically similar concentric area", () =>
    expect(run({ pedestalN: 48, pedestalB: 30 }).A2).toBe(900));
  it("ASD uses Ωc=2.31 and Ωb=1.67", () => {
    const r = run({ P: 250, method: "ASD" });
    expect(r.fpMax).toBeCloseTo((0.85 * 4 * 1.5) / 2.31, 6);
    expect(r.requiredThickness).toBeCloseTo(6.2 * Math.sqrt((2 * 250 * 1.67) / (36 * 576)), 6);
  });
  it("lambda is bounded", () => {
    expect(run({ P: 0 }).lambda).toBe(0);
    expect(run({ P: 10000 }).lambda).toBe(1);
  });
  it("small moment uniform bearing equilibrium", () => {
    const r = run({ M: 1600 });
    expect(r.regime).toBe("small moment");
    expect(r.eccentricity).toBe(4);
    expect(r.Y).toBe(16);
    expect(r.tension).toBe(0);
    expect(r.fp).toBeCloseTo(400 / (24 * 16), 6);
    expect(r.fp * 24 * r.Y * (12 - r.Y / 2)).toBeCloseTo(1600, 6);
  });
  it("large moment satisfies force and moment equilibrium", () => {
    const r = run({ M: 5000 });
    expect(r.regime).toBe("large moment");
    expect(r.equilibrium).toBe(true);
    expect(r.fp * 24 * r.Y - r.tension).toBeCloseTo(400, 6);
    expect(r.fp * 24 * r.Y * (12 - r.Y / 2) + r.tension * r.f).toBeCloseTo(5000, 6);
    expect(r.tensionThickness).toBeGreaterThan(0);
  });
  it("pure bending has balanced compression and tension", () => {
    const r = run({ P: 0, M: 2000 });
    expect(r.equilibrium).toBe(true);
    expect(r.compression).toBeCloseTo(r.tension, 6);
    expect(r.compression * (12 - r.Y / 2) + r.tension * r.f).toBeCloseTo(2000, 6);
  });
  it("negative moment is symmetric", () => expect(run({ M: -5000 }).tension).toBeCloseTo(run({ M: 5000 }).tension, 6));
  it("no equilibrium cannot pass", () => {
    const r = run({ M: 50000 });
    expect(r.equilibrium).toBe(false);
    expect(r.pass).toBe(false);
  });
  it("thinner plate increases D/C by t squared", () => {
    const a = run().checks.find((c) => c.id === "plate-compression")!,
      b = run({ thickness: 0.75 }).checks.find((c) => c.id === "plate-compression")!;
    expect(b.ratio).toBeCloseTo(4 * a.ratio, 6);
  });
  it.each(["36", "55", "105"] as const)("F1554 %s uses actual material Fu", (grade) => {
    const r = run({ anchorGrade: grade }),
      Fu = { 36: 58, 55: 75, 105: 125 }[grade];
    expect(r.checks.find((c) => c.id === "anchor-tension")!.capacity).toBeCloseTo(
      (0.75 * 0.75 * Fu * Math.PI * 0.75 ** 2) / 4,
      6,
    );
  });
  it("friction uses applied compression and φ=.65", () =>
    expect(run({ friction: true, V: 50 }).frictionCapacity).toBeCloseTo(0.65 * 0.4 * 400, 6));
  it("ASD takes no unsupported friction credit", () => {
    const r = run({ friction: true, method: "ASD" });
    expect(r.frictionCapacity).toBe(0);
    expect(r.warnings.some((w) => w.includes("ASD"))).toBe(true);
  });
  it("shear and tension interaction reduces anchor strength", () => {
    const r = run({ M: 5000, V: 40 });
    expect(r.checks.find((c) => c.id === "anchor-combined")!.capacity).toBeLessThan(
      r.checks.find((c) => c.id === "anchor-tension")!.capacity,
    );
  });
  it("rectangular HSS has no interior W yield-line term", () => {
    const r = basePlate(findShape("HSS8X8X1/2")!, { ...input, N: 18, B: 18, pedestalN: 30, pedestalB: 30, P: 100 });
    expect(r.nPrime).toBe(0);
    expect(r.m).toBeCloseTo((18 - 0.95 * 8) / 2, 6);
    expect(r.n).toBe(r.m);
  });
  it("undersized support rejected", () => expect(() => run({ pedestalN: 20 })).toThrow(/Pedestal/));
  it("bad anchors rejected", () => expect(() => run({ anchorCount: 3 })).toThrow(/even/));
  it("negative compression rejected", () => expect(() => run({ P: -10 })).toThrow());
  it("finite sizing helper yields a passing design", () => {
    const s = sizeBasePlate(w, input);
    expect(s).toBeDefined();
    expect(run(s).pass).toBe(true);
    expect((s!.thickness * 8) % 1).toBeCloseTo(0);
  });
  it("explicitly excludes concrete anchorage", () => expect(run().warnings.join(" ")).toContain("OUT OF SCOPE"));
});
