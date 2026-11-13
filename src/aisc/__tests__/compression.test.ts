import { describe, expect, it } from "vitest";
import { E, G, materialById, preferredMaterial } from "@/data/materials";
import { SHAPES, familyOf, findShape, req, type Shape } from "@/data/shapes";
import { available } from "../common";
import { classifyCompression } from "../classify-compression";
import { compressionStrength, flexuralBucklingFcr } from "../compression";
import { UnsupportedError } from "../types";
import { effectiveCompressionArea } from "../compression/effective-area";
import { componentAngle, singlySymmetricElasticStress, unsymmetricElasticStress } from "../compression/buckling";
const mat = materialById("A992")!, a36 = materialById("A36")!;
const shape = (name: string): Shape => { const s = findShape(name); if (!s) throw Error(name); return s; };

// Independent E3 arithmetic, using Manual Part 1 A and ry and Fy = 50 ksi.
// Example W14x90, 10 ft: L/r = 120/3.70 = 32.4324;
// Fe = 286218.5276/(32.4324²) = 272.1064 ksi;
// φPn = .9(26.5)(50)(.658^(50/272.1064)) = 1104.2238 kip.
// These are equation-derived expectations, not claimed transcriptions of Table 4-1a.
const columns = [
  ["W14X90", [1192.5, 1104.2238, 1003.0105, 876.7044, 596.8246]],
  ["W14X120", [1588.5, 1473.3182, 1341.0138, 1175.5054, 806.8102]],
  ["W12X65", [859.5, 765.7897, 662.8863, 541.6271, 303.6562]],
  ["W10X49", [648, 550.4261, 448.8528, 337.3424, 161.944]],
  ["W8X31", [410.85, 317.4094, 229.9008, 146.1137, 64.9394]],
] as const;
describe("W column verification at Table 4-1a lengths (independent E3 calculations)", () => {
  for (const [label, values] of columns) for (const [i, ft] of [0, 10, 15, 20, 30].entries()) it(`${label}, ${ft} ft`, () => {
    const result = compressionStrength(shape(label), mat, { Lcx: 12 * ft, Lcy: 12 * ft });
    expect(available(result, "LRFD")).toBeCloseTo(values[i]!, 3);
    expect(available(result, "ASD")).toBeCloseTo(values[i]! / (0.9 * 1.67), 3);
  });
});
describe("Table B4.1a classification", () => {
  it.each([
    ["W14X90", [1, 5]], ["C7X14.75", [1, 5]], ["WT7X45", [1, 4]],
    ["L4X4X1/2", [3, 3]], ["2L4X4X1/2X3/8", [3, 3]],
    ["HSS10X6X1/4", [6, 6]], ["HSS8.625X0.250", [9]], ["Pipe8STD", [9]],
  ] as const)("%s uses the right cases", (label, cases) => {
    expect(classifyCompression(shape(label), mat).elements.map(e => Number(e.ref.split(" ").at(-1)))).toEqual([...cases]);
  });
  it("uses full channel flange width and the tee stem depth", () => {
    expect(classifyCompression(shape("C7X14.75"), mat).elements[0]!.lambda).toBe(6.28);
    expect(classifyCompression(shape("WT10.5X28.5"), mat).elements[1]!.lambda).toBe(25.9);
    expect(classifyCompression(shape("WT10.5X28.5"), mat).overall).toBe("slender");
  });
  it("uses 0.11E/Fy, not the flexural limit, for round sections", () => {
    expect(classifyCompression(shape("HSS8.625X0.250"), mat).elements[0]!.lambdaR).toBeCloseTo(63.8);
  });
});
describe("HSS/pipe columns, independent calculations at Table 4-4 through 4-7 lengths", () => {
  it.each([
    ["HSS8X8X3/8", "A500C-rect", 419.4341],
    ["HSS8.625X0.250", "A500C-round", 227.7598],
    ["Pipe8STD", "A53B", 227.1954],
  ])("%s at 10 ft", (label, material, expected) => {
    // E3: φPn = .9 Ag Fy .658^(Fy (120/ry)^2 / (π² 29000)).
    expect(available(compressionStrength(shape(String(label)), materialById(String(material))!, { Lcx: 120, Lcy: 120 }), "LRFD")).toBeCloseTo(Number(expected), 3);
  });
});
describe("E4 torsional and flexural-torsional buckling", () => {
  it("uses Cw and Lcz for doubly symmetric torsional buckling", () => {
    const s = shape("W14X90"), c = compressionStrength(s, mat, { Lcx: 12, Lcy: 12, Lcz: 1200 });
    const Fe = (Math.PI ** 2 * E * 16000 / 1200 ** 2 + G * 4.06) / (999 + 362);
    expect(c.governing).toBe("TB"); expect(c.Fe).toBeCloseTo(Fe, 10);
    expect(c.Fcr).toBeCloseTo(flexuralBucklingFcr(50, Fe), 10);
  });
  it("couples channels to the symmetry x-axis, not the y-axis", () => {
    const s = shape("C7X14.75"), c = compressionStrength(s, a36, { Lcx: 240, Lcy: 12, Lcz: 240 });
    const Fex = Math.PI ** 2 * E / (240 / 2.51) ** 2;
    const Fez = (Math.PI ** 2 * E * 13.1 / 240 ** 2 + G * .267) / (4.33 * 2.75 ** 2);
    const expected = (Fex + Fez) / (2 * .875) * (1 - Math.sqrt(1 - 4 * Fex * Fez * .875 / (Fex + Fez) ** 2));
    expect(c.governing).toBe("FTB"); expect(c.Fe).toBeCloseTo(expected, 10);
  });
  it("uses tee y-axis coupling (Table 4-9 family), with database ro and H", () => {
    // WT7x45: Fey = 272.10636, Fez = 102.20905, E4-3 gives Fe = 100.33367 ksi.
    const c = compressionStrength(shape("WT7X45"), mat, { Lcx: 0, Lcy: 120 });
    expect(c.governing).toBe("FTB"); expect(c.Fe).toBeCloseTo(100.33366845, 7);
    expect(available(c, "LRFD")).toBeCloseTo(482.1716199, 6);
  });
  it("double-angle torsion uses both component J values and ignores permitted warping term", () => {
    const s = shape("2L4X4X1/2X3/8"), c = compressionStrength(s, a36, { Lcx: 0, Lcy: 120 });
    const fey = Math.PI ** 2 * E / (120 / 1.83) ** 2, fez = G * 2 * .322 / (7.5 * 2.38 ** 2);
    const expected = (fey + fez) / (2 * .848) * (1 - Math.sqrt(1 - 4 * fey * fez * .848 / (fey + fez) ** 2));
    expect(c.Fe).toBeCloseTo(expected, 8); expect(c.governing).toBe("FTB");
  });
  it("finds the lowest cubic root and recovers symmetric limiting cases", () => {
    const [fx, fy, fz, x, y, ro] = [100, 150, 200, .3, .4, 1];
    const f = unsymmetricElasticStress(fx, fy, fz, x, y, ro);
    const polynomial = (v: number) => (v-fx)*(v-fy)*(v-fz)-v*v*(v-fy)*(x/ro)**2-v*v*(v-fx)*(y/ro)**2;
    expect(f).toBeGreaterThan(0); expect(f).toBeLessThan(100); expect(polynomial(f)).toBeCloseTo(0, 6);
    expect(unsymmetricElasticStress(100, 150, 200, 0, 0, 1)).toBeCloseTo(100, 10);
    expect(unsymmetricElasticStress(Infinity, Infinity, 200, .3, .4, 1)).toBeCloseTo(200, 10);
    expect(singlySymmetricElasticStress(Infinity, 100, .9)).toBe(100);
  });
  it("single-angle flexure uses principal w/z axes", () => {
    const s = shape("L4X4X1/2"), c = compressionStrength(s, a36, { Lcx: 120, Lcy: 120 });
    const fb = c.limitStates.find(l => l.id === "FB-y")!;
    expect(fb.nominal).toBeCloseTo(3.75 * flexuralBucklingFcr(36, Math.PI ** 2 * E / (120 / .776) ** 2), 10);
    expect(c.warnings.join(" ")).toContain("principal");
  });
});
describe("E5 and E6 slenderness", () => {
  it.each([[60, false, 72 + .75 * 60 / 1.21], [120, false, 32 + 1.25 * 120 / 1.21], [60, true, 60 + .8 * 60 / 1.21], [120, true, 45 + 120 / 1.21]] as const)("E5 L=%s, box/space=%s", (L, trussWeb, expected) => {
    const c = compressionStrength(shape("L4X4X1/2"), a36, { Lcx: L, Lcy: L, singleAngle: { connectedLeg: "long", trussWeb } });
    expect(c.slenderness).toBeCloseTo(expected, 10); expect(c.governing).toMatch(/^FB/);
  });
  it("uses the radius parallel to the long leg and applies short-leg correction", () => {
    const s = shape("L6X4X3/8");
    const long = compressionStrength(s, a36, { Lcx: 60, Lcy: 60, singleAngle: { connectedLeg: "long" } });
    expect(long.slenderness).toBeCloseTo(72 + .75 * 60 / 1.16);
    const short = compressionStrength(s, a36, { Lcx: 60, Lcy: 60, singleAngle: { connectedLeg: "short" } });
    expect(short.slenderness).toBeCloseTo(Math.max(72 + .75 * 60 / 1.93 + 4 * (1.5 ** 2 - 1), .95 * 60 / .87));
  });
  it("rejects E5 outside its applicability", () => {
    expect(() => compressionStrength(shape("L4X4X1/2"), a36, { Lcx: 600, Lcy: 600, singleAngle: { connectedLeg: "long" } })).toThrow(UnsupportedError);
    expect(() => compressionStrength(shape("L4X4X1/2"), a36, { Lcx: 60, Lcy: 120, singleAngle: { connectedLeg: "long" } })).toThrow(UnsupportedError);
  });
  it.each([["snug", 24, Math.hypot(120 / 1.83, 24 / .776)], ["welded-pretensioned", 24, 120 / 1.83], ["welded-pretensioned", 36, Math.hypot(120 / 1.83, .5 * 36 / .776)]] as const)("E6 %s spacing %s", (connectorType, connectorSpacing, expected) => {
    const c = compressionStrength(shape("2L4X4X1/2X3/8"), a36, { Lcx: 0, Lcy: 120, connectorType, connectorSpacing });
    expect(c.steps.find(s => s.symbol === "(L{c}/r){m}")!.value).toBeCloseTo(expected);
    expect(componentAngle(shape("2L4X3X5/8X3/8LLBB")).label).toBe("L4X3X5/8");
  });
});
describe("E7 effective widths and area", () => {
  it("reduces a slender W web at short length and restores full width at low stress", () => {
    const s = shape("W21X57"), cls = classifyCompression(s, mat);
    // h=46.3(.405); Fel=(1.31*1.49*sqrt(29000/50)/46.3)^2*50.
    const root = 1.31 * 1.49 * Math.sqrt(29000 / 50) / 46.3;
    const expected = 16.7 - 46.3 * .405 ** 2 * (1 - (1 - .18 * root) * root);
    expect(effectiveCompressionArea(s, 50, 50, cls).Ae).toBeCloseTo(expected, 10);
    expect(effectiveCompressionArea(s, 50, 5, cls).Ae).toBe(16.7);
  });
  it("reduces both walls of a slender rectangular HSS", () => {
    const s = shape("HSS10X6X1/4");
    const root = 1.38 * 1.4 * Math.sqrt(29000 / 50) / 39.9;
    const Ae = 7.1 - 2 * 9.3 * .233 * (1 - (1 - .2 * root) * root);
    const c = compressionStrength(s, mat, { Lcx: 0, Lcy: 0 });
    expect(c.nominal).toBeCloseTo(50 * Ae, 9);
  });
  it("reduces a tee stem and both angle legs", () => {
    const tee = shape("WT10.5X28.5"), angle = shape("L5X3-1/2X1/4");
    const a = effectiveCompressionArea(tee, 50, 50, classifyCompression(tee, mat));
    expect(a.Ae).toBeLessThan(req(tee, "A")); expect(a.steps.some(s => s.ref === "Eq. E7-3")).toBe(true);
    const b = effectiveCompressionArea(angle, 36, 36, classifyCompression(angle, a36));
    expect(b.steps.filter(s => s.ref === "Eq. E7-3")).toHaveLength(2);
    expect(b.Ae).toBeGreaterThan(0); expect(b.Ae).toBeLessThan(req(angle, "A"));
    expect(compressionStrength(angle, a36, { Lcx: 60, Lcy: 60 }).limitStates.some(l => l.id === "FTB")).toBe(false);
  });
  it("round E7-7 reduction and upper applicability bound", () => {
    const s = { ...shape("HSS8.625X0.250"), "D/t": 100 };
    const c = compressionStrength(s, mat, { Lcx: 0, Lcy: 0 });
    expect(c.nominal).toBeCloseTo(50 * 6.14 * (.038 * 29000 / (50 * 100) + 2/3));
    expect(() => compressionStrength({ ...s, "D/t": .45 * 29000 / 50 }, mat, { Lcx: 0, Lcy: 0 })).toThrow(UnsupportedError);
  });
});
describe("complete shape-database compression sweep", () => {
  it("returns positive finite strengths and cited reports at 0, 10, and 30 ft", () => {
    const unsupported: string[] = [];
    for (const s of SHAPES) for (const L of [0, 120, 360]) {
      try {
        const c = compressionStrength(s, preferredMaterial(s.type, familyOf(s)), { Lcx: L, Lcy: L });
        expect(Number.isFinite(c.nominal), `${s.label} ${L}`).toBe(true); expect(c.nominal).toBeGreaterThan(0);
        expect(c.Fcr).toBeGreaterThan(0);
        for (const ls of c.limitStates) {
          expect("quantity" in ls && ls.quantity === "force").toBe(true); expect(ls.ref).toBeTruthy();
          for (const step of ls.steps) { expect(step.ref).toBeTruthy(); expect(step.quantity).toBeTruthy(); }
        }
        for (const step of c.steps) { expect(step.ref).toBeTruthy(); expect(step.quantity).toBeTruthy(); }
      } catch (e) { if (e instanceof UnsupportedError) unsupported.push(s.label); else throw e; }
    }
    // Current database lies inside E7.2; every listed shape has component properties.
    expect(unsupported).toEqual([]);
  });
  it("rejects negative lengths and warns for L/r > 200", () => {
    expect(() => compressionStrength(shape("W14X90"), mat, { Lcx: -1, Lcy: 0 })).toThrow(RangeError);
    expect(compressionStrength(shape("W8X31"), mat, { Lcx: 600, Lcy: 600 }).warnings.join(" ")).toContain("200");
  });
});
