import { describe, expect, it } from "vitest";
import { momentConnection, type MomentConnectionInput } from "../connections/moment";
import { findShape } from "@/data/shapes";
import { materialById } from "@/data/materials";
const beam = findShape("W18X35")!,
  column = findShape("W14X90")!,
  mat = materialById("A992")!;
const input: MomentConnectionInput = {
  M: 1800,
  V: 30,
  type: "bolted-flange-plate",
  plateWidth: 6,
  plateThickness: 0.75,
  plateLength: 16,
  plateFy: 50,
  plateFu: 65,
  bolt: { d: 0.75, group: "A", threads: "N" },
  rows: 4,
  spacing: 3,
  endDistance: 1.5,
  gage: 3,
  setback: 0.5,
  weldSize: 0.3125,
  FEXX: 70,
  tabThickness: 0.375,
  tabHeight: 12,
  tabBolts: 4,
  tabWeldSize: 0.25,
  columnAxial: 200,
  columnEndDistance: 60,
};
const run = (p: Partial<MomentConnectionInput> = {}) => momentConnection(beam, column, mat, mat, { ...input, ...p });
const check = (id: string, p: Partial<MomentConnectionInput> = {}) => run(p).checks.find((c) => c.id === id)!;
describe("Manual Part 12 flange force model — independent hand calculations and shared bolt/weld functions", () => {
  it("flange force is M/d in kip-in/in", () => expect(run().flangeForce).toBeCloseTo(1800 / 17.7, 6));
  it("flange plate gross yielding φFybt", () =>
    expect(check("plate-yield").capacity).toBeCloseTo(0.9 * 50 * 6 * 0.75, 6));
  it("flange plate net rupture includes hole + 1/16 deduction", () =>
    expect(check("plate-rupture").capacity).toBeCloseTo(0.75 * 65 * (6 - 2 * (0.75 + 1 / 16 + 1 / 16)) * 0.75, 6));
  it("eight Group A N single shear bolts", () =>
    expect(check("flange-bolts").capacity).toBeCloseTo((8 * 0.75 * 54 * Math.PI * 0.75 ** 2) / 4, 6));
  it("flange plate block shear caps rupture by shear yielding", () => {
    const path = 1.5 + 3 * 3,
      hole = 0.875,
      Agv = 2 * path * 0.75,
      Anv = Agv - 2 * 3.5 * hole * 0.75,
      Ant = (3 - hole) * 0.75;
    expect(check("plate-block").capacity).toBeCloseTo(
      0.75 * Math.min(0.6 * 65 * Anv + 65 * Ant, 0.6 * 50 * Agv + 65 * Ant),
      6,
    );
  });
  it("beam F13.1 uses elastic Sx and moment demand", () => {
    const c = check("beam-flange-rupture");
    expect(c.result.quantity).toBe("moment");
    expect(c.demand).toBe(1800);
    expect(c.capacity).toBeCloseTo(((0.9 * 65 * (6 - 2 * 0.875)) / 6) * 57.6, 6);
  });
  it("column J10 flange force and panel shear are separate", () => {
    const r = run({ storyShear: 20 });
    expect(r.column.checks.find((c) => c.id === "J10.1")!.demand).toBeCloseTo(r.flangeForce);
    expect(r.column.checks.find((c) => c.id === "J10.6")!.demand).toBeCloseTo(r.flangeForce - 20);
  });
  it("ASD changes available plate strength", () =>
    expect(check("plate-yield", { method: "ASD" }).capacity).toBeCloseTo((50 * 6 * 0.75) / 1.67, 6));
  it("invalid flange edge distance fails detailing", () =>
    expect(check("flange-layout", { gage: 5 }).ratio).toBe(Infinity));
  it("larger moment increases ratios and triggers column stiffeners", () => {
    const r = run({ M: 15000 });
    expect(r.pass).toBe(false);
    expect(r.column.stiffener.required).toBe(true);
    expect(r.column.doubler.required).toBe(true);
  });
  it("CJP flange base metal controls with matching filler", () => {
    const r = run({ type: "welded-flange" });
    expect(r.checks.some((c) => c.id === "flange-bolts")).toBe(false);
    expect(r.checks.find((c) => c.id === "cjp-flange")!.capacity).toBeCloseTo(0.9 * 50 * 6 * 0.425, 6);
  });
  it("CJP insufficient filler cannot pass", () =>
    expect(check("matching-filler", { type: "welded-flange", FEXX: 60 }).ratio).toBe(Infinity));
  it("web tab has eccentric bolt, weld, block-shear and interaction checks", () =>
    expect(run().checks.map((c) => c.id)).toEqual(
      expect.arrayContaining(["tab-bolts", "tab-weld", "tab-block", "tab-bending", "tab-interaction", "web-bearing"]),
    ));
  it("tab eccentricity reduces bolt capacity below concentric", () =>
    expect(check("tab-bolts").capacity).toBeLessThan((4 * 0.75 * 54 * Math.PI * 0.75 ** 2) / 4));
  it("eccentric weld coefficient matches an independent elastic line-group calculation", () => {
    // Two 12-in vertical welds: L=24, J=2*h^3/12=288 in^3.
    // e=2: Leff=24/sqrt(1+(6e/h)^2)=16.9706 in.
    const Leff = 24 / Math.sqrt(2);
    const hand = 0.75 * 0.6 * 70 * 0.707 * 0.25 * Leff;
    // Shared midpoint quadrature plus a conservative 1% endpoint allowance.
    expect(check("tab-weld").capacity / hand).toBeGreaterThan(0.98);
    expect(check("tab-weld").capacity / hand).toBeLessThanOrEqual(1);
  });
  it("bad row count throws", () => expect(() => run({ rows: 0 })).toThrow(/integer/));
  it("welded flange scope warns about FR qualification", () =>
    expect(run({ type: "welded-flange" }).warnings.join(" ")).toContain("stiffness"));
});
