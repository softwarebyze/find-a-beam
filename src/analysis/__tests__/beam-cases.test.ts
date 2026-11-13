import { describe, expect, it } from "vitest";
import { BEAM_CASES, beamCaseById, DEFAULT_BEAM_PARAMETERS as defaults, superpose, analyzeBeam } from "../beam-cases";
const p = { ...defaults, L: 240, w: 0.08, P: 12, E: 29000, I: 700 };
const solve = (id: string) => beamCaseById(id).solve(p);
const close = (actual: number, expected: number) =>
  expect(actual).toBeCloseTo(expected, Math.max(3, 8 - Math.floor(Math.log10(Math.abs(expected) || 1))));
describe("Manual Table 3-23 closed forms", () => {
  it("simple uniform", () => {
    const b = solve("simple-uniform");
    close(b.max.M.value, (p.w * p.L ** 2) / 8);
    close(b.max.delta.value, (5 * p.w * p.L ** 4) / (384 * p.E * p.I));
    close(b.max.M.x, p.L / 2);
  });
  it("simple center point", () => {
    const b = solve("simple-center");
    close(b.max.M.value, (p.P * p.L) / 4);
    close(b.max.delta.value, (p.P * p.L ** 3) / (48 * p.E * p.I));
  });
  it("fixed uniform", () => {
    const b = solve("fixed-uniform");
    close(b.M(0), (-p.w * p.L ** 2) / 12);
    close(b.M(p.L / 2), (p.w * p.L ** 2) / 24);
    close(b.max.delta.value, (p.w * p.L ** 4) / (384 * p.E * p.I));
  });
  it("fixed center point", () => {
    const b = solve("fixed-center");
    close(Math.abs(b.max.M.value), (p.P * p.L) / 8);
    close(b.max.delta.value, (p.P * p.L ** 3) / (192 * p.E * p.I));
  });
  it("propped uniform positive and negative maxima", () => {
    const b = solve("propped-uniform");
    close(b.M(0), (-p.w * p.L ** 2) / 8);
    close(b.M((5 * p.L) / 8), (9 * p.w * p.L ** 2) / 128);
    close(b.reactions[1]!.force, (3 * p.w * p.L) / 8);
  });
  it("cantilever end and fixed-end-increasing triangle", () => {
    close(solve("cantilever-end").max.delta.value, (p.P * p.L ** 3) / (3 * p.E * p.I));
    close(solve("cantilever-triangle").max.delta.value, (p.w * p.L ** 4) / (30 * p.E * p.I));
  });
  it("triangular and tent loads", () => {
    close(solve("simple-triangle").max.M.value, (p.w * p.L ** 2) / (9 * Math.sqrt(3)));
    close(solve("simple-tent").max.delta.value, (p.w * p.L ** 4) / (120 * p.E * p.I));
  });
  it("continuous two equal spans", () => {
    const b = solve("continuous-uniform");
    close(b.M(p.L / 2), (-p.w * (p.L / 2) ** 2) / 8);
    close(b.reactions[1]!.force, (5 * p.w * (p.L / 2)) / 4);
  });
});
describe.each(BEAM_CASES)("$name equilibrium and compatibility", (c) => {
  const b = c.solve(p);
  it("balances vertical force and moments", () => {
    const total =
      b.loading.points.reduce((s, q) => s + q.P, 0) +
      b.loading.distributed.reduce((s, q) => s + ((q.wStart + q.wEnd) * (q.end - q.start)) / 2, 0);
    const moment =
      b.loading.points.reduce((s, q) => s + q.P * q.x, 0) +
      b.loading.distributed.reduce((s, q) => {
        const len = q.end - q.start;
        return s + (q.start * (q.wStart + q.wEnd) * len) / 2 + len ** 2 * (q.wStart / 2 + (q.wEnd - q.wStart) / 3);
      }, 0);
    close(
      b.reactions.reduce((s, r) => s + r.force, 0),
      total,
    );
    close(
      b.reactions.reduce((s, r) => s + r.force * r.x + r.moment, 0),
      moment,
    );
    b.loading.supports.forEach((s) => {
      close(b.delta(s.x), 0);
      if (s.fixed) close(b.slope(s.x), 0);
    });
  });
  it("double integration of M/EI reproduces deflection", () => {
    // Trapezoidal integration with first moment; enough subdivisions for a 1e-5 in tolerance.
    const n = 4000,
      dx = b.L / n;
    let rotation = b.slope(0),
      displacement = b.delta(0);
    for (let i = 0; i < n; i++) {
      const x = i * dx;
      const k0 = -b.M(x + dx * 1e-7) / (p.E * p.I),
        k1 = -b.M(x + dx - dx * 1e-7) / (p.E * p.I);
      displacement += rotation * dx + ((2 * k0 + k1) * dx * dx) / 6;
      rotation += ((k0 + k1) * dx) / 2;
      if (i % 400 === 399) expect(displacement).toBeCloseTo(b.delta(x + dx), 5);
    }
  });
});
it("superposition preserves diagrams, reactions and stiffness", () => {
  const a = solve("simple-uniform"),
    b = solve("simple-center"),
    sum = superpose([a, b], [1.2, 1.6]);
  for (let x = 0; x <= p.L; x += 7) {
    close(sum.M(x), 1.2 * a.M(x) + 1.6 * b.M(x));
    close(sum.delta(x), 1.2 * a.delta(x) + 1.6 * b.delta(x));
  }
  expect(() => superpose([a, solve("cantilever-end")])).toThrow(/identical/);
});
it("rejects invalid geometry and stiffness", () => {
  expect(() => beamCaseById("simple-partial").solve({ ...p, a: 180, b: 60 })).toThrow();
  expect(() => analyzeBeam({ L: 0, E: 29000, I: 1, supports: [], points: [], distributed: [] })).toThrow();
});

it("arbitrary simple point load has the closed-form maximum away from the load", () => {
  const params = { ...p, a: p.L * 0.12 };
  const beam = beamCaseById("simple-point").solve(params),
    c = params.a;
  close(beam.max.delta.value, (p.P * c * (p.L ** 2 - c ** 2) ** 1.5) / (9 * Math.sqrt(3) * p.L * p.E * p.I));
  close(beam.max.delta.x, p.L - Math.sqrt((p.L ** 2 - c ** 2) / 3));
});
it("overhang end loading captures backspan uplift when it exceeds end deflection", () => {
  const params = { ...p, a: 5 },
    span = params.L - params.a;
  const beam = beamCaseById("overhang-end").solve(params);
  close(beam.delta(params.L), (params.P * params.a ** 2 * params.L) / (3 * params.E * params.I));
  close(Math.abs(beam.max.delta.value), (params.P * params.a * span ** 2) / (9 * Math.sqrt(3) * params.E * params.I));
  expect(beam.max.delta.value).toBeLessThan(0);
});
it("polynomial extrema match the propped and continuous rotation roots", () => {
  const t = (15 - Math.sqrt(33)) / 16,
    b = solve("propped-uniform");
  close(b.max.delta.x, t * p.L);
  close(b.max.delta.value, (p.w * p.L ** 4 * t ** 2 * (3 - 5 * t + 2 * t ** 2)) / (48 * p.E * p.I));
  const continuous = solve("continuous-uniform"),
    s = p.L / 2,
    u = (1 + Math.sqrt(33)) / 16;
  close(continuous.max.delta.value, (p.w * s ** 4 * (2 * u ** 4 - 3 * u ** 3 + u)) / (48 * p.E * p.I));
});
