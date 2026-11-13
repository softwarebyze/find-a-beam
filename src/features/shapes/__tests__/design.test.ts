import { describe, expect, it } from "vitest";
import { findShape, SHAPES } from "@/data/shapes";
import { designSummary, ltbChartSpan, momentCurve, tensionYielding } from "../design";
import { available } from "@/aisc";

const w18x50 = findShape("W18X50")!;

describe("designSummary", () => {
  it("never throws for any shape in the database", () => {
    for (const s of SHAPES) expect(() => designSummary(s)).not.toThrow();
  });

  it("reproduces Manual Table 3-2 for W18×50 (A992)", () => {
    const d = designSummary(w18x50);
    expect(d.material.id).toBe("A992");
    if (!d.flexX.ok) throw new Error(d.flexX.error);
    expect(available(d.flexX.value, "LRFD") / 12).toBeCloseTo(379, 0);
    expect(available(d.flexX.value, "ASD") / 12).toBeCloseTo(252, 0);
    expect(d.flexX.value.Lp! / 12).toBeCloseTo(5.83, 1);
    expect(d.flexX.value.Lr! / 12).toBeCloseTo(16.9, 1);
  });

  it("reproduces Manual Table 4-1a for W14×90 (A992)", () => {
    const d = designSummary(findShape("W14X90")!);
    const [p0, p10, p20] = d.compression.map((c) => c.result);
    if (!p0?.ok || !p10?.ok || !p20?.ok) throw new Error("engine failure");
    expect(available(p0.value, "LRFD")).toBeCloseTo(0.9 * 50 * 26.5, 0);
    expect(available(p10.value, "LRFD")).toBeCloseTo(1100, -1);
    expect(available(p20.value, "LRFD")).toBeCloseTo(877, -1);
  });

  it("reports tension yielding on the gross section", () => {
    const d = designSummary(w18x50);
    if (!d.tension.ok) throw new Error(d.tension.error);
    expect(tensionYielding(d.tension.value, "LRFD")!.value).toBeCloseTo(0.9 * 50 * 14.7, 6);
    expect(tensionYielding(d.tension.value, "ASD")!.value).toBeCloseTo((50 * 14.7) / 1.67, 6);
  });
});

describe("moment curve", () => {
  it("covers past Lr and decreases monotonically", () => {
    const d = designSummary(w18x50);
    if (!d.flexX.ok) throw new Error(d.flexX.error);
    const span = ltbChartSpan(d.flexX.value)!;
    expect(span).toBeGreaterThan(d.flexX.value.Lr!);
    const c = momentCurve(w18x50, d.material, d.flexX.value, "LRFD");
    if (!c?.ok) throw new Error("no curve");
    const ys = c.value.points.map((p) => p.Mc);
    for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeLessThanOrEqual(ys[i - 1]! + 1e-9);
    expect(ys[0]! / 12).toBeCloseTo(379, 0);
  });

  it("is omitted for round HSS where LTB does not apply", () => {
    const s = findShape("HSS6.625X0.280")!;
    const d = designSummary(s);
    if (!d.flexX.ok) throw new Error(d.flexX.error);
    expect(momentCurve(s, d.material, d.flexX.value, "LRFD")).toBeUndefined();
  });
});
