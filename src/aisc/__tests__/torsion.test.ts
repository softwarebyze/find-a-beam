import { describe, expect, it } from "vitest";
import { torsionalStrength, openTorsion, openTorsionCheck } from "../torsion";
import { hssTorsionInteraction } from "../interaction";
import { available } from "../common";
import { E, G, materialById } from "@/data/materials";
import { findShape, req } from "@/data/shapes";
const w = findShape("W12X26")!,
  hss = findShape("HSS6X6X1/4")!,
  mat = materialById("A500C-rect")!,
  steel = materialById("A992")!;
describe("H3 HSS torsion", () => {
  it("compact HSS hand calculation: 0.6Fy C, phi=.9, Omega=1.67", () => {
    // HSS6x6x1/4: h/t=22.75 <2.45sqrt(29000/50)=59.0, C=15.4 in³.
    const r = torsionalStrength(hss, mat, { L: 120 });
    expect(r.nominal).toBeCloseTo(0.6 * 50 * 15.4);
    expect(available(r, "LRFD")).toBeCloseTo(415.8);
    expect(available(r, "ASD")).toBeCloseTo(462 / 1.67);
  });
  it("uses all three rectangular wall regimes with the longer flat width", () => {
    const at = (lambda: number) => torsionalStrength({ ...hss, h: lambda * 0.233 }, mat, { L: 120 });
    const p = 2.45 * Math.sqrt(E / 50);
    expect(at(65).nominal).toBeCloseTo(((0.6 * 50 * p) / 65) * 15.4);
    expect(at(100).nominal).toBeCloseTo(((0.458 * Math.PI ** 2 * E) / 10000) * 15.4);
    expect(() => at(261)).toThrow();
  });
  it("round HSS takes the larger elastic stress and caps yielding", () => {
    const round = { ...hss, OD: 10, tdes: 0.1, C: 12 };
    const L = 2000,
      lambda = 100;
    expect(torsionalStrength(round, mat, { L }).nominal).toBeCloseTo(
      Math.min(30, Math.max((1.23 * E) / (Math.sqrt(L / 10) * lambda ** 1.25), (0.6 * E) / lambda ** 1.5)) * 12,
    );
    expect(() => torsionalStrength(w, steel, { L: 120 })).toThrow();
    expect(() => torsionalStrength(hss, mat, { L: 0 })).toThrow();
  });
  it("H3-6 has a linear normal term and squared sum of torsion plus larger shear ratio", () => {
    const r = hssTorsionInteraction({
      Pr: 10,
      Pc: 100,
      Mrx: 20,
      Mcx: 100,
      Mry: 5,
      Mcy: 100,
      Tr: 30,
      Tc: 100,
      Vrx: 10,
      Vcx: 100,
      Vry: 20,
      Vcy: 100,
    });
    expect(r.equation).toBe("H3-6");
    expect(r.ratio).toBeCloseTo(0.1 + 0.2 + 0.05 + (0.2 + 0.3) ** 2);
  });
  it("permits H1 at the 20% torsion boundary", () => {
    const r = hssTorsionInteraction({ Pr: 10, Pc: 100, Mrx: 20, Mcx: 100, Tr: 20, Tc: 100, Vrx: 0, Vcx: 100 });
    expect(r.torsionNeglected).toBe(true);
    expect(r.equation).toBe("H1-1b");
  });
});
describe("DG9 analytic torsion fields", () => {
  for (const load of ["midspan", "uniform"] as const)
    for (const ends of ["pinned", "fixed"] as const) {
      it(`${load} torque / ${ends} ends: symmetry, boundary conditions, equilibrium`, () => {
        const T = 20,
          L = 240,
          r = openTorsion(w, { T, L, load, ends });
        const a = r.stations[0]!,
          b = r.stations.at(-1)!,
          middle = r.stations.find((p) => p.x === 120)!;
        expect(a.theta).toBeCloseTo(0, 12);
        expect(b.theta).toBeCloseTo(0, 12);
        expect(middle.theta1).toBeCloseTo(0, 12);
        expect(ends === "pinned" ? a.theta2 : a.theta1).toBeCloseTo(0, 12);
        // GJ θ' − ECw θ''' = left reaction torque = T/2, for either symmetric case.
        expect(G * req(w, "J") * a.theta1 - E * req(w, "Cw") * a.theta3).toBeCloseTo(T / 2, 8);
        expect(middle.theta).toBeGreaterThan(0);
        for (const p of r.stations.filter((p) => p.x < 120)) {
          const internal = G * req(w, "J") * p.theta1 - E * req(w, "Cw") * p.theta3;
          expect(internal).toBeCloseTo(load === "midspan" ? T / 2 : T * (0.5 - p.x / L), 8);
        }
      });
    }
  it("midspan pinned closed form agrees with DG9 hyperbolic solution", () => {
    // Independent half-span integration: theta_mid=T/(2GJ)[L/2−tanh(kL/2)/k].
    const T = 20,
      L = 240,
      k = Math.sqrt((G * req(w, "J")) / (E * req(w, "Cw")));
    const r = openTorsion(w, { T, L, load: "midspan", ends: "pinned" });
    expect(r.stations.find((s) => s.x === L / 2)!.theta).toBeCloseTo(
      (T / (2 * G * req(w, "J"))) * (L / 2 - Math.tanh((k * L) / 2) / k),
      12,
    );
  });
  it("remains finite for long members where raw hyperbolic functions overflow", () => {
    const r = openTorsion(w, { T: 20, L: 1e6, load: "midspan", ends: "pinned" });
    expect(r.stations.every((s) => Object.values(s).every(Number.isFinite))).toBe(true);
  });
  it("uses buckling stresses and conservative combined stress envelopes on both methods", () => {
    const input = {
      T: 20,
      L: 240,
      load: "uniform" as const,
      ends: "fixed" as const,
      FcrNormal: 20,
      FcrShear: 10,
      Mx: 100,
      Vy: 5,
    };
    const r = openTorsionCheck(w, steel, input),
      asd = openTorsionCheck(w, steel, { ...input, method: "ASD" });
    expect(r.ratio).toBeGreaterThan(0);
    expect(asd.ratio / r.ratio).toBeCloseTo(0.9 * 1.67);
    expect(() => openTorsionCheck(w, steel, { ...input, FcrNormal: 0 })).toThrow();
  });
  it("is linear in load, and fixed warping reduces twist", () => {
    const base = { T: 20, L: 240, load: "uniform" as const };
    const p = openTorsion(w, { ...base, ends: "pinned" }),
      f = openTorsion(w, { ...base, ends: "fixed" }),
      double = openTorsion(w, { ...base, T: 40, ends: "fixed" });
    expect(f.stations.find((s) => s.x === 120)!.theta).toBeLessThan(p.stations.find((s) => s.x === 120)!.theta);
    expect(double.stations.find((s) => s.x === 120)!.theta).toBeCloseTo(2 * f.stations.find((s) => s.x === 120)!.theta);
  });
});
