import { describe, expect, it } from "vitest";
import { available, B1, cbFromMoments, Cm, compressionStrength, flexuralStrength, interaction, Pe1, tensionStrength } from "@/aisc";
import { E, materialById } from "@/data/materials";
import { findShape, req } from "@/data/shapes";
import { checkMember, H1_ENVELOPE, supportsH1, type MemberInput } from "../member-check";

const shape = findShape("W14X90")!, material = materialById("A992")!;
const base: MemberInput = { shape, material, method: "LRFD", axial: "compression", P: 300, Mx: 1200, My: 120, Vx: 5, Vy: 30, Lb: 120, compression: { Lcx: 168, Lcy: 168, Lcz: 168 }, Cb: 1 };

describe("member design orchestration", () => {
  it("checks all five strengths and uses the engine's H1 result on a common basis", () => {
    const report = checkMember(base);
    expect(report.errors).toEqual([]);
    expect(report.checks.map((c) => c.id)).toEqual(["axial", "mx", "my", "vx", "vy"]);
    const pc = available(compressionStrength(shape, material, base.compression), "LRFD");
    const mcx = available(flexuralStrength(shape, material, { axis: "major", Lb: 120, Cb: 1 }), "LRFD");
    const mcy = available(flexuralStrength(shape, material, { axis: "minor", Lb: 120, Cb: 1 }), "LRFD");
    const expected = interaction({ Pr: 300, Pc: pc, Mrx: 1200, Mcx: mcx, Mry: 120, Mcy: mcy });
    expect(report.interaction).toEqual(expected);
    expect(report.status).toBe("PASS");
    expect(report.ratio).toBeCloseTo(Math.max(expected.ratio, ...report.checks.map((c) => c.ratio)));
  });
  it("switches all capacities and interaction to ASD", () => {
    const lrfd = checkMember(base), asd = checkMember({ ...base, method: "ASD" });
    expect(asd.checks.every((c, i) => c.capacity < lrfd.checks[i]!.capacity)).toBe(true);
    expect(asd.interaction!.ratio).toBeGreaterThan(lrfd.interaction!.ratio);
  });
  it("uses net area and shear lag for tension, including the method-specific rupture factor", () => {
    const report = checkMember({ ...base, axial: "tension", tension: { An: 15, U: 0.8 }, method: "ASD" });
    const expected = tensionStrength(shape, material, { An: 15, U: 0.8, method: "ASD" });
    expect(report.checks[0]!.capacity).toBeCloseTo(available(expected, "ASD"));
    expect(report.checks[0]!.result.governing).toBe("TR");
  });
  it("lets a shear failure govern even if axial and interaction pass", () => {
    const report = checkMember({ ...base, P: 1, Mx: 1, My: 1, Vy: 2000 });
    expect(report.interaction!.ratio).toBeLessThan(1);
    expect(report.status).toBe("FAIL");
    expect(report.governing).toContain("Shear Vy");
  });
  it("checks negative signed moments and shears by magnitude", () => {
    const a = checkMember(base), b = checkMember({ ...base, Mx: -1200, My: -120, Vx: -5, Vy: -30 });
    expect(a.ratio).toBe(b.ratio);
  });
  it("rejects negative physical lengths or axial magnitudes without crashing", () => {
    expect(checkMember({ ...base, P: -1 }).status).toBe("INCOMPLETE");
    expect(checkMember({ ...base, compression: { Lcx: -1, Lcy: 1 } }).checks).toHaveLength(0);
  });
  it("an invalid tension connection cannot receive a pass", () => {
    const report = checkMember({ ...base, axial: "tension", P: 1, Mx: 0, My: 0, tension: { U: 0 } });
    expect(report.status).toBe("INCOMPLETE");
    expect(report.errors.some((e) => e.check === "Tension")).toBe(true);
  });
});

describe("moment gradient and Appendix 8", () => {
  it("uses signed end-moment Cm with the larger absolute end moment as demand", () => {
    const ends = { x1: -600, x2: 1200, y1: 120, y2: 0 };
    const report = checkMember({ ...base, endMoments: ends, amplification: { cmX: 1, cmY: 1, stiffness: 0.8, L1x: 168, L1y: 168 } });
    expect(report.B1x).toBeCloseTo(B1(300, Pe1(0.8 * E * req(shape, "Ix"), 168), Cm(-600, 1200), "LRFD"));
    expect(report.B1y).toBeCloseTo(B1(300, Pe1(0.8 * E * req(shape, "Iy"), 168), Cm(120, 0), "LRFD"));
    expect(report.moments.x).toBe(1200 * report.B1x);
  });
  it("uses alpha = 1.6 in ASD and keeps sway-inhibited lengths separate", () => {
    const amplification = { cmX: 1, cmY: 1, stiffness: 0.8, L1x: 120, L1y: 120 };
    const lrfd = checkMember({ ...base, amplification }), asd = checkMember({ ...base, method: "ASD", amplification });
    expect(asd.B1y).toBeGreaterThan(lrfd.B1y);
    expect(asd.B1y).toBeCloseTo(B1(300, Pe1(0.8 * E * req(shape, "Iy"), 120), 1, "ASD"));
  });
  it("reports elastic instability as FAIL rather than hiding an unbounded B1", () => {
    const report = checkMember({ ...base, P: 10000, amplification: { cmX: 1, cmY: 1, stiffness: 0.8, L1x: 240, L1y: 240 } });
    expect(report.status).toBe("FAIL");
    expect(report.ratio).toBe(Infinity);
    expect(report.interaction).toBeUndefined();
    expect(report.errors.some((e) => e.message.includes("αPr"))).toBe(true);
  });
  it("computes Cb using quarter-point samples and checks the maximum", () => {
    const report = checkMember({ ...base, cbMoments: { max: 1200, a: 600, b: 1200, c: 600 } });
    expect(report.Cb).toBe(cbFromMoments(1200, 600, 1200, 600));
    expect(checkMember({ ...base, cbMoments: { max: 100, a: 200, b: 100, c: 0 } }).status).toBe("INCOMPLETE");
    expect(checkMember({ ...base, cbMoments: { max: 100, a: 0, b: 0, c: 0 } }).errors[0]!.message).toContain("required moment");
  });
});

describe("Chapter H applicability", () => {
  it("has an envelope continuous at Pr/Pc = 0.2 and with the two exact intercepts", () => {
    expect(H1_ENVELOPE).toEqual([{ x: 0, y: 1 }, { x: 0.9, y: 0.2 }, { x: 1, y: 0 }]);
    for (const point of H1_ENVELOPE) expect(interaction({ Pr: point.y, Pc: 1, Mrx: point.x, Mcx: 1 }).ratio).toBeCloseTo(1);
  });
  it("does not silently apply H1 to an angle, channel, tee or double angle", () => {
    for (const name of ["L4X4X1/2", "C12X20.7", "WT6X20", "2L4X4X1/2X3/8"]) {
      const s = findShape(name)!;
      expect(s).toBeDefined();
      expect(supportsH1(s)).toBe(false);
      const report = checkMember({ ...base, shape: s, P: 1, Mx: 0, My: 0 });
      expect(report.status).not.toBe("PASS");
      expect(report.errors.some((e) => e.check === "Interaction")).toBe(true);
    }
  });
  it("uses supplied signed principal-axis critical-point stresses under H2", () => {
    const points = [{ fra: 5, Fca: 30, frbw: 10, Fcbw: 30, frbz: 2, Fcbz: 30 }, { fra: 5, Fca: 30, frbw: -10, Fcbw: 30, frbz: -2, Fcbz: 30 }];
    const report = checkMember({ ...base, h2: { points, confirmed: true } });
    expect(report.interaction!.equation).toBe("H2-1");
    expect(report.interaction!.ratio).toBeCloseTo(17 / 30);
    expect(checkMember({ ...base, h2: { points, confirmed: false } }).status).toBe("INCOMPLETE");
  });
  it("catches unsupported flexural edge cases and never returns a false pass", () => {
    const s = findShape("L8X4X1/2")!;
    const report = checkMember({ ...base, shape: s, material: materialById("A36")!, P: 0, Mx: 0, My: 0 });
    expect(report.status).not.toBe("PASS");
    expect(report.errors.length).toBeGreaterThan(0);
  });
});
