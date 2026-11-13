/** Hand checks against ANSI/AISC 360-22 Chapter G (kip, in., ksi). */
import { describe, expect, it } from "vitest";
import { E, materialById, preferredMaterial } from "@/data/materials";
import { familyOf, findShape, SHAPES } from "@/data/shapes";
import { available } from "../common";
import { shearStrength } from "../shear";
const fy50 = materialById("A992")!,
  a36 = materialById("A36")!;
const s = (label: string) => {
  const x = findShape(label);
  if (!x) throw new Error(label);
  return x;
};

describe("G2.1 I-shaped and channel web shear", () => {
  it.each([
    // Independent arithmetic from db d,tw: φVn=φ*.6*50*d*tw.
    ["W24X55", 23.6, 0.395, 0.9],
    ["W21X44", 20.7, 0.35, 1],
    ["W16X26", 15.7, 0.25, 0.9],
    ["W14X90", 14, 0.44, 1],
  ] as const)("%s uses the correct rolled-I resistance factors", (name, d, tw, phi) => {
    const r = shearStrength(s(name), fy50, { axis: "major" });
    expect(r.Cv1).toBe(1);
    expect(r.phi).toBe(phi);
    expect(r.omega).toBe(phi === 1 ? 1.5 : 1.67);
    expect(available(r, "LRFD")).toBeCloseTo(phi * 30 * d * tw, 9);
    expect(available(r, "ASD")).toBeCloseTo((30 * d * tw) / (phi === 1 ? 1.5 : 1.67));
  });
  it("channels use φ=.9 even when their webs are stocky", () => {
    const r = shearStrength(s("C15X33.9"), a36, { axis: "major" });
    expect(r.Aw).toBe(15 * 0.4);
    expect(r.nominal).toBeCloseTo(0.6 * 36 * 6);
    expect(r.phi).toBe(0.9);
  });
  it("G2-4 uses Cv1's two branches, including very slender webs", () => {
    const shape = { ...s("W24X55"), "h/tw": 200 },
      r = shearStrength(shape, fy50, { axis: "major" });
    const Cv = (1.1 * Math.sqrt(5.34 * 580)) / 200;
    expect(r.Cv1).toBeCloseTo(Cv);
    expect(r.nominal).toBeCloseTo(30 * 23.6 * 0.395 * Cv);
  });
  it("G2-5 accounts for spacing and uses 5.34 for a/h>3", () => {
    const shape = { ...s("W24X55"), "h/tw": 100 },
      h = 100 * 0.395;
    const stiff = shearStrength(shape, fy50, { axis: "major", a: h }),
      wide = shearStrength(shape, fy50, { axis: "major", a: 4 * h });
    expect(stiff.Cv1).toBeCloseTo((1.1 * Math.sqrt(10 * 580)) / 100);
    expect(wide.Cv1).toBeCloseTo((1.1 * Math.sqrt(5.34 * 580)) / 100);
    expect(stiff.warnings.join(" ")).toContain("§G2.4");
  });
});

describe("G3 single angles and tees, three-branch Cv2", () => {
  it("tee stem uses full depth, area d*tw and kv=1.2", () => {
    const r = shearStrength(s("WT6X13"), fy50, { axis: "major" });
    // λ=6.11/.23=26.565; threshold=1.1sqrt(1.2*580)=29.02 -> Cv2=1.
    expect(r.Aw).toBeCloseTo(6.11 * 0.23);
    expect(r.Cv1).toBe(1);
    expect(r.nominal).toBeCloseTo(30 * 6.11 * 0.23);
  });
  it("single unequal angle axes select the correct leg from the database", () => {
    const shape = s("L8X6X1");
    expect(shearStrength(shape, a36, { axis: "major" }).Aw).toBe(8);
    expect(shearStrength(shape, a36, { axis: "minor" }).Aw).toBe(6);
  });
  it.each([20, 32, 60])("angle leg slenderness %s checks each Cv2 branch", (lambda) => {
    const shape = { ...s("L4X4X1/4"), t: 4 / lambda },
      r = shearStrength(shape, fy50, { axis: "major" });
    const root = Math.sqrt(1.2 * 580),
      expected =
        lambda <= 1.1 * root ? 1 : lambda <= 1.37 * root ? (1.1 * root) / lambda : (1.51 * 1.2 * 580) / lambda ** 2;
    expect(r.Cv1).toBeCloseTo(expected);
    expect(r.nominal).toBeCloseTo(30 * 4 * (4 / lambda) * expected);
  });
  it("double angles add the two web legs", () => {
    const r = shearStrength(s("2L8X6X1LLBB"), a36, { axis: "major" });
    expect(r.Aw).toBe(16);
    expect(r.nominal).toBeCloseTo(0.6 * 36 * 16);
  });
});

describe("G4 rectangular HSS", () => {
  it("uses design thickness and two flat walls; rotates for minor axis", () => {
    const shape = s("HSS8X6X1/4"),
      x = shearStrength(shape, fy50, { axis: "major" }),
      y = shearStrength(shape, fy50, { axis: "minor" });
    expect(x.Aw).toBeCloseTo(2 * 7.3 * 0.233);
    expect(y.Aw).toBeCloseTo(2 * 5.3 * 0.233);
    expect(x.Cv1).toBe(1);
    expect(x.nominal).toBeCloseTo(30 * 2 * 7.3 * 0.233);
  });
  it("slender HSS shear walls use Cv2, not Cv1", () => {
    const shape = s("HSS12X8X3/16"),
      r = shearStrength(shape, fy50, { axis: "major" });
    // λ=11.5/.174=66.09 lies between 1.10sqrt(5*580)=59.24 and 1.37sqrt(5*580)=73.78.
    const lambda = 11.5 / 0.174,
      Cv = (1.1 * Math.sqrt(5 * 580)) / lambda;
    expect(r.Cv1).toBeCloseTo(Cv);
    const elastic = shearStrength({ ...shape, h: 20 }, fy50, { axis: "major" });
    expect(elastic.Cv1).toBeCloseTo((1.51 * 5 * 580) / (20 / 0.174) ** 2);
  });
});

describe("G5 round HSS and pipe", () => {
  it("stocky pipe is governed by .6FyAg/2", () => {
    const r = shearStrength(s("Pipe8STD"), materialById("A53B")!, { axis: "major" });
    expect(r.Aw).toBeCloseTo(7.85 / 2);
    expect(r.nominal).toBeCloseTo((0.6 * 35 * 7.85) / 2);
    expect(r.warnings.join(" ")).toContain("Lv omitted");
  });
  it("long-length bound uses .78E/(D/t)^1.5", () => {
    const shape = { ...s("HSS8.625X0.250"), OD: 20, tdes: 0.1 },
      r = shearStrength(shape, fy50, { axis: "minor" });
    const stress = (0.78 * E) / 200 ** 1.5;
    expect(r.nominal).toBeCloseTo((stress * 6.14) / 2);
  });
  it("known Lv uses the larger G5-2a/b stress, capped at .6Fy", () => {
    const shape = { ...s("HSS8.625X0.250"), OD: 20, tdes: 0.1 };
    const r = shearStrength(shape, fy50, { axis: "major", Lv: 200 });
    const a = (1.6 * E) / (Math.sqrt(200 / 20) * 200 ** 1.25),
      b = (0.78 * E) / 200 ** 1.5;
    expect(r.nominal).toBeCloseTo((Math.min(30, Math.max(a, b)) * 6.14) / 2);
    expect(shearStrength(shape, fy50, { axis: "major", Lv: 1 }).nominal).toBeCloseTo((30 * 6.14) / 2);
  });
});

describe("G6 minor-axis shear", () => {
  it.each([
    ["W24X55", 2 * 7.01 * 0.505],
    ["C15X33.9", 2 * 3.4 * 0.65],
    ["WT6X13", 6.49 * 0.38],
    ["2L8X6X1LLBB", 2 * 6 * 1],
  ] as const)("%s sums the correct number of elements", (name, area) => {
    const r = shearStrength(s(name), fy50, { axis: "minor" });
    expect(r.Aw).toBeCloseTo(area);
    expect(r.nominal).toBeCloseTo(30 * area);
    expect(r.phi).toBe(0.9);
    expect(r.section).toContain("§G6");
  });
  it("uses bf/(2tf) for I-shapes but bf/tf for channels", () => {
    const i = { ...s("W24X55"), bf: 40, tf: 0.5 },
      channel = { ...s("C15X33.9"), bf: 20, tf: 0.5 };
    const expected = (1.51 * 1.2 * 580) / 40 ** 2;
    expect(shearStrength(i, fy50, { axis: "minor" }).Cv1).toBeCloseTo(expected);
    expect(shearStrength(channel, fy50, { axis: "minor" }).Cv1).toBeCloseTo(expected);
  });
});

describe("shear validation and database sweep", () => {
  it("rejects invalid panel / shear lengths", () => {
    for (const a of [0, -1, NaN, Infinity])
      expect(() => shearStrength(s("W24X55"), fy50, { axis: "major", a })).toThrow(RangeError);
    for (const Lv of [0, -1, NaN, Infinity])
      expect(() => shearStrength(s("Pipe8STD"), a36, { axis: "major", Lv })).toThrow(RangeError);
  });
  it("every shape and both axes have finite positive strength with cited numeric steps", () => {
    for (const shape of SHAPES)
      for (const axis of ["major", "minor"] as const) {
        const r = shearStrength(shape, preferredMaterial(shape.type, familyOf(shape)), { axis });
        expect(Number.isFinite(r.nominal), `${shape.label}/${axis}`).toBe(true);
        expect(r.nominal).toBeGreaterThan(0);
        expect(r.Aw).toBeGreaterThan(0);
        expect(r.Cv1).toBeGreaterThan(0);
        expect(r.Cv1).toBeLessThanOrEqual(1);
        for (const l of r.limitStates) {
          expect(l.ref).toBeTruthy();
          expect(l).toHaveProperty("quantity", "force");
        }
        for (const x of [...r.steps, ...r.limitStates.flatMap((l) => l.steps)]) {
          expect(x.ref, shape.label).toBeTruthy();
          if (x.value !== undefined) {
            expect(x.quantity).toBeTruthy();
            expect(Number.isFinite(x.value), shape.label).toBe(true);
          }
        }
      }
  });
});
