import { describe, expect, it } from "vitest";
import { findShape } from "@/data/shapes";
import { materialById } from "@/data/materials";
import { checkMember, type MemberInput } from "../member-check";
const base: MemberInput = {
  shape: findShape("HSS6X6X1/4")!,
  material: materialById("A500C-rect")!,
  method: "LRFD",
  axial: "compression",
  P: 10,
  Mx: 10,
  My: 10,
  Vx: 1,
  Vy: 1,
  Lb: 120,
  Cb: 1,
  compression: { Lcx: 120, Lcy: 120 },
  torsion: { Tu: 200, L: 120, load: "midspan", ends: "pinned" },
};
describe("member torsion integration", () => {
  it("adds a sixth HSS capacity and applies H3-6", () => {
    const r = checkMember(base);
    expect(r.errors).toEqual([]);
    expect(r.checks).toHaveLength(6);
    expect(r.interaction!.equation).toBe("H3-6");
    expect(r.status).toBe("PASS");
  });
  it("torsion can govern failure and ASD changes the capacity", () => {
    const r = checkMember({ ...base, torsion: { ...base.torsion!, Tu: 1000 } });
    expect(r.status).toBe("FAIL");
    const asd = checkMember({ ...base, method: "ASD" });
    expect(asd.checks.at(-1)!.capacity).toBeLessThan(checkMember(base).checks.at(-1)!.capacity);
  });
  it("open sections use DG9 and cannot pass without H3-9 buckling input", () => {
    const open = { ...base, shape: findShape("W12X26")!, material: materialById("A992")! };
    const incomplete = checkMember(open);
    expect(incomplete.errors.some((e) => e.check === "Open-section torsion")).toBe(true);
    expect(incomplete.status).toBe("INCOMPLETE");
    const r = checkMember({ ...open, torsion: { ...open.torsion!, Tu: 1, FcrNormal: 30, FcrShear: 20 } });
    expect(r.torsion!.stations.length).toBeGreaterThan(80);
    expect(r.errors).toEqual([]);
    expect(r.status).toBe("PASS");
  });
});
