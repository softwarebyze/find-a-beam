import { describe, expect, it } from "vitest";
import {
  checkCandidate,
  designDemands,
  nominalDepth,
  sweepShapes,
  validateInput,
  type BeamDesignInput,
} from "@/features/beam/design";
import { findShape, req, SHAPES } from "@/data/shapes";
import { available, cbFromMoments, flexuralStrength } from "@/aisc";
import { materialFor } from "@/features/beam/design";
const config: BeamDesignInput = {
  L: 240,
  support: "simple",
  overhang: 60,
  dead: 0.025,
  live: 0.05,
  points: [],
  selfWeight: false,
  bracing: "continuous",
  Lb: 240,
  liveLimit: 360,
  totalLimit: 240,
  method: "LRFD",
};
const shape = findShape("W18X35")!;
describe("beam sizing", () => {
  it("uses factored strength and service-level deflection", () => {
    const demand = designDemands(config, 35),
      c = checkCandidate(shape, config, demand);
    expect(demand.moment.value).toBeCloseTo(((1.2 * 0.025 + 1.6 * 0.05) * 240 ** 2) / 8, 6);
    expect(demand.moment.combo.factors.L).toBe(1.6);
    expect(c.dll).toBeCloseTo((5 * 0.05 * 240 ** 4) / (384 * 29000 * req(shape, "Ix")), 7);
    expect(c.dtl).toBeCloseTo((5 * 0.075 * 240 ** 4) / (384 * 29000 * req(shape, "Ix")), 7);
    expect(c.capacity).toBeCloseTo(
      available(flexuralStrength(shape, materialFor(shape), { axis: "major", Lb: 0, Cb: 1 }), "LRFD"),
    );
  });
  it("honors ASD and candidate self-weight", () => {
    const cfg = { ...config, method: "ASD" as const, selfWeight: true };
    const d = designDemands(cfg, 35);
    expect(d.moment.value).toBeCloseTo(((0.075 + 35 / 12000) * 240 ** 2) / 8, 6);
    expect(d.moment.combo.label).toBe("D + L");
    const c = checkCandidate(shape, cfg, d);
    expect(c.capacity).toBeCloseTo(c.flexure.nominal / c.flexure.omega, 6);
  });
  it("computes Cb from the actual unbraced segment", () => {
    const cfg = { ...config, bracing: "custom" as const, Lb: 120 };
    const c = checkCandidate(shape, cfg, designDemands(cfg, 35));
    const beam = c.demand.strength.find((d) => d.combo === c.segment.combo)!.beam;
    const s = c.segment.start,
      lb = c.segment.Lb;
    const expected = cbFromMoments(c.moment, beam.M(s + lb / 4), beam.M(s + lb / 2), beam.M(s + (3 * lb) / 4));
    expect(c.segment.Cb).toBeCloseTo(expected, 6);
  });
  it("uses unity Cb at an unbraced free end even with override", () => {
    const cfg = { ...config, support: "cantilever" as const, bracing: "custom" as const, cbOverride: 2.5 };
    const c = checkCandidate(shape, cfg, designDemands(cfg, 35));
    expect(c.segment.Cb).toBe(1);
  });
  it("sorts the complete W-shape sweep by weight and evaluates every check", () => {
    const start = performance.now();
    const result = sweepShapes(
      SHAPES.filter((s) => s.type === "W"),
      { ...config, selfWeight: true },
    );
    const elapsed = performance.now() - start;
    console.info(`W-shape sweep: ${result.candidates.length} candidates, ${elapsed.toFixed(0)} ms`);
    expect(result.skipped).toEqual([]);
    expect(result.candidates.length).toBeGreaterThan(250);
    expect(result.candidates.some((c) => c.pass)).toBe(true);
    expect(result.candidates.some((c) => !c.pass)).toBe(true);
    result.candidates.forEach((c, i, all) => {
      if (i) expect(req(c.shape, "W")).toBeGreaterThanOrEqual(req(all[i - 1]!.shape, "W"));
      expect(c.pass).toBe(c.ratio <= 1 + 1e-9);
    });
  });
  it("validates invalid input before a sweep", () => {
    expect(validateInput({ ...config, L: -1 })).toBeDefined();
    expect(validateInput({ ...config, bracing: "custom", Lb: 0 })).toBeDefined();
    expect(validateInput({ ...config, support: "overhang", overhang: 240 })).toBeDefined();
  });
});

it("uses nominal series depth for the shape depth filter", () => {
  expect(nominalDepth(findShape("W18X50")!)).toBe(18);
});
it.each(["M", "S", "HP", "C", "MC", "HSS", "PIPE"])("sweeps supported %s families without uncaught errors", (type) => {
  const result = sweepShapes(
    SHAPES.filter((s) => s.type === type),
    config,
  );
  expect(result.candidates.length).toBeGreaterThan(0);
  expect(result.candidates.every((c) => Number.isFinite(c.ratio))).toBe(true);
});
