import { describe, expect, it } from "vitest";
import { analyzeBoltGroup, analyzeWeldGroup, eccentricBoltGroup, eccentricWeldGroup } from "../connections/groups";
import type { BoltCoord, WeldSegment } from "../connections/types";
const bolts: BoltCoord[] = Array.from({ length: 6 }, (_, i) => ({ x: (i % 2) * 3, y: Math.floor(i / 2) * 3 }));
const parallel: WeldSegment[] = [
  { x1: 0, y1: 0, x2: 0, y2: 10 },
  { x1: 4, y1: 0, x2: 4, y2: 10 },
];
// No unverified Manual table coefficients are used: hand elastic calculations and IC invariants below.
describe("Manual Part 7 bolt group equilibrium", () => {
  it.each([0, 15, 30, 45, 60, 75, 90, 180])("concentric C = n at %s degrees", (angle) => {
    expect(eccentricBoltGroup({ bolts, ex: 0, angle }).C).toBeCloseTo(6, 8);
  });
  it.each(["IC", "elastic"] as const)("%s coefficient decreases with eccentricity", (method) => {
    const values = [0, 1, 3, 6, 12, 30].map((ex) => eccentricBoltGroup({ bolts, ex, method }).C);
    values.slice(1).forEach((v, i) => expect(v).toBeLessThan(values[i]!));
  });
  it.each([0, 15, 30, 45, 60, 75, 90, 135])("IC force and moment equilibrium at angle %s", (angle) => {
    const r = analyzeBoltGroup({ bolts, ex: 4, angle });
    const sx = r.forces.reduce((s, p) => s + p.fx, 0),
      sy = r.forces.reduce((s, p) => s + p.fy, 0),
      m = r.forces.reduce((s, p) => s + p.x * p.fy - p.y * p.fx, 0);
    expect(sx).toBeCloseTo(r.C * Math.sin((angle * Math.PI) / 180), 6);
    expect(sy).toBeCloseTo(-r.C * Math.cos((angle * Math.PI) / 180), 6);
    expect(m).toBeCloseTo(-4 * r.C, 6);
    expect(r.equilibriumError).toBeLessThan(1e-7);
    expect(r.ic).toBeDefined();
  });
  it("uses the empirical bolt load-deformation law without increasing its asymptotic strength", () => {
    const result = analyzeBoltGroup({ bolts, ex: 3 });
    const max = Math.max(...result.forces.map((f) => Math.hypot(f.fx, f.fy)));
    expect(max).toBeCloseTo((1 - Math.exp(-10 * 0.34)) ** 0.55, 10);
    const radii = result.forces.map((f) => Math.hypot(f.x - result.ic!.x, f.y - result.ic!.y));
    const rmax = Math.max(...radii);
    result.forces.forEach((f, i) =>
      expect(Math.hypot(f.fx, f.fy)).toBeCloseTo((1 - Math.exp((-10 * 0.34 * radii[i]!) / rmax)) ** 0.55, 8),
    );
  });
  it("small eccentricity stays within 2% of the concentric bolt count", () => {
    const C = eccentricBoltGroup({ bolts, ex: 1e-5 }).C;
    expect(C / bolts.length).toBeGreaterThan(0.98);
    expect(C).toBeLessThan(bolts.length);
  });
  it("elastic hand calc: J=49.5, unit force=(e*y/J, -1/6-e*x/J)", () => {
    const max = Math.hypot((3 * 3) / 49.5, 1 / 6 + (3 * 1.5) / 49.5);
    expect(eccentricBoltGroup({ bolts, ex: 3, method: "elastic" }).C).toBeCloseTo(1 / max, 10);
  });
  it("IC symmetry under opposite eccentricity", () => {
    const a = eccentricBoltGroup({ bolts, ex: 3 }),
      b = eccentricBoltGroup({ bolts, ex: -3 });
    expect(a.C).toBeCloseTo(b.C, 7);
    expect(a.ic!.x).toBeCloseTo(-b.ic!.x, 6);
  });
  it("is invariant under translation and scale of geometry/eccentricity", () => {
    const a = eccentricBoltGroup({ bolts, ex: 4, angle: 30 });
    expect(
      eccentricBoltGroup({ bolts: bolts.map((p) => ({ x: p.x + 100, y: p.y - 20 })), ex: 4, angle: 30 }).C,
    ).toBeCloseTo(a.C, 8);
    expect(
      eccentricBoltGroup({ bolts: bolts.map((p) => ({ x: p.x * 3, y: p.y * 3 })), ex: 12, angle: 30 }).C,
    ).toBeCloseTo(a.C, 8);
  });
  it("supports unsymmetric custom patterns", () => {
    const r = analyzeBoltGroup({
      bolts: [
        { x: 0, y: 0 },
        { x: 4, y: 1 },
        { x: 1, y: 5 },
        { x: 3, y: 3 },
      ],
      ex: 2.3,
      angle: 37,
    });
    expect(r.C).toBeGreaterThan(0);
    expect(r.equilibriumError).toBeLessThan(1e-7);
  });
  it("rejects duplicate points, empty patterns and invalid loads", () => {
    expect(() => eccentricBoltGroup({ bolts: [], ex: 1 })).toThrow();
    expect(() =>
      eccentricBoltGroup({
        bolts: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        ex: 1,
      }),
    ).toThrow();
    expect(() => eccentricBoltGroup({ bolts, ex: NaN })).toThrow();
  });
});
describe("Manual Part 8 weld group equilibrium", () => {
  it("concentric longitudinal parallel lines match independent weld strength", () => {
    const r = analyzeWeldGroup({ segments: parallel, ex: 0 });
    expect(r.effectiveLength).toBeCloseTo(20, 6);
    expect(r.C * 10).toBeCloseTo(((0.6 * 70 * 0.707) / 16) * 20, 6);
  });
  it("concentric transverse parallel lines gain 1.5 strength", () => {
    const r = analyzeWeldGroup({ segments: parallel, ex: 0, angle: 90 });
    expect(r.effectiveLength).toBeCloseTo(30, 6);
  });
  it.each(["IC", "elastic"] as const)("%s C decreases with eccentricity for parallel lines", (method) => {
    const values = [0, 2, 5, 10, 20].map((ex) => eccentricWeldGroup({ segments: parallel, ex, method }).C);
    values.slice(1).forEach((v, i) => expect(v).toBeLessThan(values[i]!));
  });
  it.each(
    [
      parallel,
      [...parallel, { x1: 0, y1: 0, x2: 4, y2: 0 }],
      [...parallel, { x1: 0, y1: 0, x2: 4, y2: 0 }, { x1: 0, y1: 10, x2: 4, y2: 10 }],
    ].map((segments) => ({ segments })),
  )("converges with midpoint refinement and satisfies equilibrium", ({ segments }) => {
    const a = analyzeWeldGroup({ segments, ex: 5, angle: 30 }, 120),
      b = analyzeWeldGroup({ segments, ex: 5, angle: 30 }, 480);
    expect(Math.abs(a.C - b.C) / b.C).toBeLessThan(0.003);
    expect(a.equilibriumError).toBeLessThan(1e-7);
  });
  it("IC/elastic return compatible nominal coefficient conventions", () => {
    const r = analyzeWeldGroup({ segments: parallel, ex: 0, method: "elastic" });
    expect(r.C * 10).toBeCloseTo(((0.6 * 70 * 0.707) / 16) * 20, 6);
  });
  it("rejects empty or zero-length welds", () => {
    expect(() => eccentricWeldGroup({ segments: [], ex: 1 })).toThrow();
    expect(() => eccentricWeldGroup({ segments: [{ x1: 0, y1: 0, x2: 0, y2: 0 }], ex: 1 })).toThrow();
  });
});
