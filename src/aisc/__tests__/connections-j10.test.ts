import { describe, expect, it } from "vitest";
import { concentratedForces, type ConcentratedForceInput } from "../connections/concentrated-forces";
import { findShape, SHAPES, req } from "@/data/shapes";
import { materialById } from "@/data/materials";
const w = findShape("W24X55")!,
  mat = materialById("A992")!;
const input: ConcentratedForceInput = {
  force: 66,
  bearingLength: 7.5,
  endDistance: 96,
  Lb: 240,
  Mr: 3800,
  flangeRotationRestrained: true,
};
const run = (patch: Partial<ConcentratedForceInput> = {}) => concentratedForces(w, mat, { ...input, ...patch });
const state = (id: string, patch: Partial<ConcentratedForceInput> = {}) => run(patch).checks.find((c) => c.id === id)!;
describe("J10 rolled I-shape concentrated forces — independent hand calculations", () => {
  // W24x55 DB: d=23.6 bf=7.01 tf=.505 tw=.395 kdes=1.01 h/tw=54.6.
  // Hand calc: 50*.395*(5*1.01+7.5)=247.8625 kip; no intermediate rounding.
  it("interior web local yielding uses kdes", () => expect(state("J10.2").result.nominal).toBeCloseTo(247.8625, 5));
  it("end yielding uses 2.5k", () =>
    expect(state("J10.2", { endDistance: 0 }).result.nominal).toBeCloseTo(50 * 0.395 * (2.5 * 1.01 + 7.5), 6));
  it("at d yielding retains end branch", () =>
    expect(state("J10.2", { endDistance: 23.6 }).result.section).toContain("J10-3"));
  it("interior web crippling", () =>
    expect(state("J10.3").result.nominal).toBeCloseTo(
      0.8 * 0.395 ** 2 * (1 + ((3 * 7.5) / 23.6) * (0.395 / 0.505) ** 1.5) * Math.sqrt((29000 * 50 * 0.505) / 0.395),
      5,
    ));
  it("short end bearing uses J10-5a", () =>
    expect(state("J10.3", { bearingLength: 2, endDistance: 0 }).result.section).toContain("J10-5a"));
  it("long end bearing uses J10-5b", () =>
    expect(state("J10.3", { endDistance: 0 }).result.nominal).toBeCloseTo(
      0.4 *
        0.395 ** 2 *
        (1 + ((4 * 7.5) / 23.6 - 0.2) * (0.395 / 0.505) ** 1.5) *
        Math.sqrt((29000 * 50 * 0.505) / 0.395),
      5,
    ));
  it("d/2 boundary is interior crippling", () =>
    expect(state("J10.3", { endDistance: 11.8 }).result.section).toContain("J10-4"));
  it("tension flange bending", () =>
    expect(state("J10.1", { loading: "tension" }).result.nominal).toBeCloseTo(6.25 * 50 * 0.505 ** 2, 6));
  it("flange bending end reduction", () =>
    expect(state("J10.1", { loading: "tension", endDistance: 0 }).result.nominal).toBeCloseTo(
      (6.25 * 50 * 0.505 ** 2) / 2,
      6,
    ));
  it("narrow load omits flange bending", () =>
    expect(run({ loading: "tension", loadedWidth: 1 }).checks.some((c) => c.id === "J10.1")).toBe(false));
  it("restrained flange rotation sidesway equation", () => {
    const h = 0.395 * 54.6,
      r = 54.6 / (240 / 7.01);
    expect(state("J10.4").result.nominal).toBeCloseTo(((960000 * 0.395 ** 3 * 0.505) / h ** 2) * (1 + 0.4 * r ** 3), 6);
    expect(state("J10.4").capacity).toBeCloseTo(0.85 * state("J10.4").result.nominal, 6);
  });
  it("unrestrained flange rotation equation", () => {
    const h = 0.395 * 54.6,
      r = 54.6 / (240 / 7.01);
    expect(state("J10.4", { flangeRotationRestrained: false }).result.nominal).toBeCloseTo(
      ((960000 * 0.395 ** 3 * 0.505) / h ** 2) * 0.4 * r ** 3,
      6,
    );
  });
  it("high moment halves Cr", () =>
    expect(state("J10.4", { Mr: 5700 }).result.nominal).toBeCloseTo(state("J10.4").result.nominal / 2, 6));
  it("ASD moment threshold uses 1.5Ma", () =>
    expect(state("J10.4", { Mr: 3800, method: "ASD" }).result.nominal).toBeCloseTo(
      state("J10.4").result.nominal / 2,
      6,
    ));
  it("lateral restraint omits sidesway", () =>
    expect(run({ lateralMovementRestrained: true }).checks.some((c) => c.id === "J10.4")).toBe(false));
  it("short Lb excludes sidesway at geometry limit", () =>
    expect(run({ Lb: 10 }).checks.some((c) => c.id === "J10.4")).toBe(false));
  it("opposed compression buckling with end reduction", () => {
    const n = (24 * 0.395 ** 3 * Math.sqrt(29000 * 50)) / (0.395 * 54.6);
    expect(state("J10.5", { oppositeCompression: true }).result.nominal).toBeCloseTo(n, 6);
    expect(state("J10.5", { oppositeCompression: true, endDistance: 0 }).result.nominal).toBeCloseTo(n / 2, 6);
  });
  it.each([
    [false, 0, "J10-9", 1],
    [false, 500, "J10-10", 1.4 - 500 / 810],
    [true, 0, "J10-11", 1],
    [true, 700, "J10-12", 1.9 - (1.2 * 700) / 810],
  ] as const)("panel stability=%s axial=%s", (frame, axial, ref, reduction) => {
    const c = state("J10.6", { panelShear: 100, axialForce: axial, beamDepth: 18, frameStabilityConsidered: frame });
    const flange = frame ? 1 + (3 * 7.01 * 0.505 ** 2) / (18 * 23.6 * 0.395) : 1;
    expect(c.result.section).toContain(ref);
    expect(c.result.nominal).toBeCloseTo(0.6 * 50 * 23.6 * 0.395 * flange * reduction, 5);
  });
  it("ASD panel axial factor is 1.6", () =>
    expect(state("J10.6", { panelShear: 100, axialForce: 400, method: "ASD" }).result.nominal).toBeCloseTo(
      0.6 * 50 * 23.6 * 0.395 * (1.4 - (1.6 * 400) / 810),
      5,
    ));
  it("unframed end requires full-depth pair at zero demand", () => {
    const r = run({ force: 0, unframedEnd: true, lateralMovementRestrained: true });
    expect(r.pass).toBe(false);
    expect(r.stiffener.required).toBe(true);
    expect(r.stiffener.length).toBeCloseTo(0.395 * 54.6);
  });
  it("stiffener pair has required geometric minimums and carries deficit", () => {
    const r = run({ force: 600, loading: "couple" });
    expect(r.stiffener.thickness).toBeGreaterThanOrEqual(0.505 / 2);
    expect(r.stiffener.thickness).toBeGreaterThanOrEqual(r.stiffener.width / 16);
    expect(r.stiffener.capacity).toBeGreaterThanOrEqual(r.stiffener.force);
  });
  it("panel doubler is rounded up and non-slender for shear", () => {
    const r = run({ panelShear: 500 });
    expect(r.doubler.required).toBe(true);
    expect((r.doubler.thickness * 16) % 1).toBeCloseTo(0);
    expect(r.h / r.doubler.thickness).toBeLessThanOrEqual(1.1 * Math.sqrt((5.34 * 29000) / 50));
  });
  it("rejects HSS", () => expect(() => concentratedForces(findShape("HSS8X8X1/2")!, mat, input)).toThrow(/I-shape/));
  it("rejects negative bearing length", () => expect(() => run({ bearingLength: -1 })).toThrow());
  it("accepts every rolled I-shape from database", () => {
    for (const s of SHAPES.filter((s) => ["W", "M", "S", "HP"].includes(s.type))) {
      const r = concentratedForces(s, mat, { ...input, endDistance: req(s, "d") * 2 });
      expect(r.checks.every((c) => Number.isFinite(c.capacity))).toBe(true);
    }
  });
});
