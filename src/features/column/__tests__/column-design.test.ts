import { describe, expect, it } from "vitest";
import { materialById } from "@/data/materials";
import { findShape } from "@/data/shapes";
import {
  columnFamilyById, columnFamilyOf, equivalentLc, evaluateColumn, governingAxial, leastR, lightestPerGroup, nominalGroup, nominalGroups,
  searchColumns, strengthCurve, strengthTable, tableLengths, transitionSlenderness,
} from "../column-design";
import { END_CONDITIONS, parseK, resolveK, serializeK } from "../effective-length";
import { applyPatch, encodeNum, parseNum } from "../url-state";

const A992 = materialById("A992")!;
const W = columnFamilyById("W")!;
const shape = (n: string) => findShape(n)!;

describe("Commentary Table C-A-7.1 effective-length factors", () => {
  it("lists the six idealized cases with theoretical and recommended K", () => {
    expect(END_CONDITIONS.map((c) => [c.id, c.theoretical, c.recommended])).toEqual([
      ["a", 0.5, 0.65], ["b", 0.7, 0.8], ["c", 1.0, 1.0], ["d", 1.0, 1.2], ["e", 2.0, 2.1], ["f", 2.0, 2.0],
    ]);
  });
  it("parses and serializes K selections", () => {
    expect(resolveK(parseK("e"))).toBe(2.1);
    expect(resolveK(parseK("1.35"))).toBe(1.35);
    expect(resolveK(parseK(null))).toBe(1.0);
    expect(resolveK(parseK("-2"))).toBe(1.0);
    expect(serializeK(parseK("b"))).toBe("b");
    expect(serializeK({ kind: "custom", K: 0.9 })).toBe("0.9");
  });
});

describe("nominal groups and families", () => {
  it("groups by nominal depth", () => {
    expect(nominalGroup(shape("W14X90"))).toBe("W14");
    expect(nominalGroup(shape("HSS8X8X1/2"))).toBe("HSS8");
    expect(nominalGroup(shape("HSS6.000X0.500"))).toBe("HSS6.000");
    expect(nominalGroup(shape("Pipe6XS"))).toBe("Pipe6");
    expect(nominalGroup(shape("Pipe6STD"))).toBe("Pipe6");
    expect(nominalGroup(shape("2L4X4X1/2X3/8"))).toBe("2L4");
  });
  it("orders W groups deepest-first", () => {
    const g = nominalGroups(W);
    expect(g[0]).toBe("W44");
    expect(g.indexOf("W14")).toBeLessThan(g.indexOf("W8"));
  });
  it("identifies column families", () => {
    expect(columnFamilyOf(shape("HSS6X6X1/2"))?.id).toBe("HSS-square");
    expect(columnFamilyOf(shape("HSS8X4X1/2"))?.id).toBe("HSS-rect");
    expect(columnFamilyOf(shape("HSS6.000X0.500"))?.id).toBe("HSS-round");
  });
});

describe("governing axial combination (ASCE/SEI 7-22)", () => {
  it("LRFD: 1.2D + 1.6L governs over 1.4D", () => {
    const g = governingAxial({ D: 100, L: 50 }, "LRFD");
    expect(g.value).toBeCloseTo(200);
    expect(g.combo.id.startsWith("LC2")).toBe(true);
  });
  it("ASD: D + L", () => {
    expect(governingAxial({ D: 100, L: 50 }, "ASD").value).toBeCloseTo(150);
  });
  it("picks the largest compression, not the largest uplift", () => {
    const g = governingAxial({ D: 20, W: -100 }, "LRFD");
    expect(g.value).toBeGreaterThan(0);
  });
});

describe("column search", () => {
  const L = { Lcx: 168, Lcy: 168, Lcz: 168 };
  it("ranks W14 columns lightest-first and flags the lightest per depth", () => {
    const { candidates } = searchColumns({ family: W, material: A992, lengths: L, Pr: 500, method: "LRFD", groups: ["W14", "W12"] });
    expect(candidates.length).toBeGreaterThan(20);
    for (let i = 1; i < candidates.length; i++) expect(candidates[i]!.shape.W as number).toBeGreaterThanOrEqual(candidates[i - 1]!.shape.W as number);
    const lightest = lightestPerGroup(candidates);
    expect(lightest.size).toBe(2);
    for (const label of lightest) {
      const c = candidates.find((x) => x.shape.label === label)!;
      expect(c.pass).toBe(true);
      const lighterSameGroup = candidates.filter((x) => x.group === c.group && x.pass && (x.shape.W as number) < (c.shape.W as number));
      expect(lighterSameGroup).toHaveLength(0);
    }
  });
  it("y-axis governs for W-shapes with equal lengths", () => {
    const { candidates } = searchColumns({ family: W, material: A992, lengths: L, Pr: 100, method: "LRFD", groups: ["W10"] });
    expect(candidates.every((c) => c.axis === "y")).toBe(true);
  });
});

describe("available strength table (Manual Table 4-1a style)", () => {
  it("W14×90, Fy = 50 ksi: φcPn = 1190 kips and Pn/Ωc = 793 kips at Lc = 0", () => {
    const rows = strengthTable(shape("W14X90"), A992, tableLengths("US"));
    expect(rows[0]!.Lc).toBe(0);
    expect(rows[0]!.phiPn).toBeCloseTo(1192.5, 0);
    expect(rows[0]!.PnOmega).toBeCloseTo(793.4, 0);
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.phiPn).toBeLessThanOrEqual(rows[i - 1]!.phiPn);
  });
  it("US rows: 0, 6…30 by 1 ft, then 32…40 by 2 ft", () => {
    const ft = tableLengths("US").map((v) => v / 12);
    expect(ft.slice(0, 3)).toEqual([0, 6, 7]);
    expect(ft.at(-1)).toBe(40);
    expect(ft).toContain(30);
    expect(ft).not.toContain(31);
  });
  it("curve starts at the squash load", () => {
    const pts = strengthCurve(shape("W14X90"), A992, "LRFD", 480, 10);
    expect(pts[0]!.y).toBeCloseTo(1192.5, 0);
    expect(pts).toHaveLength(11);
  });
});

describe("slenderness helpers", () => {
  it("4.71√(E/Fy) = 113 for Fy = 50 ksi", () => {
    expect(transitionSlenderness(50)).toBeCloseTo(113.4, 1);
  });
  it("equivalent Lc uses rx/ry", () => {
    const s = shape("W14X90");
    expect(leastR(s)).toBe(3.7);
    expect(equivalentLc(s, { Lcx: 168, Lcy: 168, Lcz: 168 })).toBeCloseTo(168);
    expect(equivalentLc(s, { Lcx: 336, Lcy: 168, Lcz: 168 })).toBeCloseTo((336 * 3.7) / 6.14);
  });
});

describe("URL state helpers", () => {
  it("round-trips numbers and removes empty keys", () => {
    expect(encodeNum(168.00000001)).toBe("168");
    expect(parseNum("12.5", 0)).toBe(12.5);
    expect(parseNum("abc", 3)).toBe(3);
    expect(parseNum(null)).toBeUndefined();
    const p = applyPatch(new URLSearchParams("a=1&b=2"), { a: undefined, c: 3.5, d: true });
    expect(p.toString()).toBe("b=2&c=3.5&d=1");
  });
});


describe("principal-axis and connection input integration", () => {
  it("reports the engine's governing axis for unequal effective lengths", () => {
    const c = evaluateColumn(shape("W14X90"), A992, { Lcx: 600, Lcy: 12, Lcz: 12 }, 100, "LRFD");
    expect("result" in c).toBe(true);
    if ("result" in c) { expect(c.result.governing).toBe("FB-x"); expect(c.axis).toBe("x"); }
  });
  it("uses the angle's principal w and z radii in the table-entry equivalent length", () => {
    const s = shape("L4X4X1/2");
    const rw = Math.sqrt((s.Iw as number) / (s.A as number));
    const rz = s.rz as number;
    const c = evaluateColumn(s, materialById("A36")!, { Lcx: 120, Lcy: 12, Lcz: 12 }, 1, "LRFD");
    if (!("result" in c)) throw new Error(c.message);
    expect(c.slx).toBeCloseTo(120 / rw);
    expect(c.sly).toBeCloseTo(12 / rz);
    expect(equivalentLc(s, { Lcx: 120, Lcy: 12, Lcz: 12 })).toBeCloseTo(Math.max(120 * leastR(s) / rw, 12 * leastR(s) / rz));
  });
  it("catches incompatible E5 settings and skips the section", () => {
    const c = evaluateColumn(shape("W14X90"), A992, { Lcx: 120, Lcy: 120, Lcz: 120, singleAngle: { connectedLeg: "long" } }, 1, "LRFD");
    expect("message" in c).toBe(true);
  });
});
