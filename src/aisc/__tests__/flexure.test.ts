/** Independent checks against ANSI/AISC 360-22 equations. Printed Manual values
 * are asserted only where known; other expected strengths use hand arithmetic. */
import { describe, expect, it } from "vitest";
import { E, materialById, preferredMaterial } from "@/data/materials";
import { familyOf, findShape, req, SHAPES, type Shape } from "@/data/shapes";
import { available } from "../common";
import { classifyFlexure } from "../classify-flexure";
import { cbFromMoments, flexuralStrength, ltbCurve } from "../flexure";
import { UnsupportedError } from "../types";
const fy50 = materialById("A992")!, a36 = materialById("A36")!, hss50 = materialById("A500C-rect")!;
const s = (label: string) => { const x = findShape(label); if (!x) throw new Error(label); return x; };
const major = (shape: Shape, Lb = 0, Cb = 1) => flexuralStrength(shape, fy50, { axis: "major", Lb, Cb });
const state = (r: ReturnType<typeof major>, id: string) => r.limitStates.find(l => l.id === id)!;

describe("Table B4.1b classification", () => {
  it("uses the full channel flange and Case 13 for minor-axis bending", () => {
    const c = classifyFlexure(s("C15X33.9"), a36, "minor").elements[0]!;
    expect(c.lambda).toBe(5.23); expect(c.ref).toContain("Case 13");
  });
  it("uses the 2022 tee stem limits from Case 14", () => {
    const c = classifyFlexure(s("WT6X13"), fy50).elements[1]!;
    expect(c.lambda).toBe(26.6); expect(c.lambdaP).toBeCloseTo(0.84 * Math.sqrt(580));
    expect(c.lambdaR).toBeCloseTo(1.52 * Math.sqrt(580)); expect(c.cls).toBe("noncompact");
  });
  it("rotates rectangular HSS flange/web dimensions for the minor axis", () => {
    const shape = s("HSS12X8X3/16"), a = classifyFlexure(shape, hss50), b = classifyFlexure(shape, hss50, "minor");
    expect(a.elements[0]!.lambda).toBeCloseTo(7.48 / 0.174);
    expect(b.elements[0]!.lambda).toBeCloseTo(11.5 / 0.174);
    expect(a.elements[1]!.lambda).toBe(b.elements[0]!.lambda);
    expect(a.elements[1]!.cls).toBe("noncompact");
  });
  it("classifies double-angle web and flange legs by F10 rules", () => {
    const c = classifyFlexure(s("2L8X6X1LLBB"), a36);
    expect(c.elements.map(e => e.lambda)).toEqual([6, 8]);
    expect(c.elements.every(e => e.ref.includes("Case 12"))).toBe(true);
  });
  it("uses E/Fy, rather than its square root, for round HSS", () => {
    const c = classifyFlexure(s("HSS8.625X0.250"), fy50).elements[0]!;
    expect(c.lambdaP).toBeCloseTo(40.6); expect(c.lambdaR).toBeCloseTo(179.8); expect(c.cls).toBe("compact");
  });
});

describe("F2 compact I-sections and channels", () => {
  it.each([
    ["W24X55", 134, 1.34], ["W21X44", 95.4, 1.26], ["W16X26", 44.2, 1.12],
  ] as const)("%s plastic strength and Lp (Manual Table 3-2 arithmetic)", (name, Z, ry) => {
    // φMp = .9(50)Z / 12 kip-ft; Lp = 1.76 ry sqrt(29000/50) in.
    const r = major(s(name));
    expect(available(r, "LRFD") / 12).toBeCloseTo(3.75 * Z, 8);
    expect(r.Lp).toBeCloseTo(1.76 * ry * Math.sqrt(580), 8);
  });
  it("checks Lr against independent elastic-stability arithmetic", () => {
    // W24x55: q=1.18/(114*23.1); Lr=1.95*1.72*(29000/35)*sqrt(q+sqrt(q²+6.76*(35/29000)²)).
    const q = 1.18 / (114 * 23.1), lr = 1.95 * 1.72 * 29000 / 35 * Math.sqrt(q + Math.sqrt(q * q + 6.76 * (35 / 29000) ** 2));
    expect(major(s("W24X55")).Lr).toBeCloseTo(lr, 10);
  });
  it("evaluates the inelastic and elastic LTB branches and yield cap", () => {
    const shape = s("W24X55"), base = major(shape), Lp = base.Lp!, Lr = base.Lr!;
    const mid = major(shape, (Lp + Lr) / 2);
    expect(mid.nominal).toBeCloseTo((6700 + 35 * 114) / 2, 8);
    expect(major(shape, Lr).nominal).toBeCloseTo(35 * 114, 8);
    const L = 2 * Lr, slender = L / 1.72;
    const elastic = Math.PI ** 2 * 29000 / slender ** 2 * Math.sqrt(1 + 0.078 * (1.18 / (114 * 23.1)) * slender ** 2) * 114;
    expect(major(shape, L).nominal).toBeCloseTo(elastic, 8);
    expect(major(shape, (Lp + Lr) / 2, 5).nominal).toBe(6700);
  });
  it("uses channel coefficient c per F2-8b, not 1.0", () => {
    const shape = s("C15X33.9"), r = flexuralStrength(shape, a36, { axis: "major", Lb: 240 });
    const c = 14.4 / 2 * Math.sqrt(8.07 / 358);
    expect(r.steps.find(x => x.symbol === "c")!.value).toBeCloseTo(c, 10);
    const q = 1.01 * c / (42 * 14.4), lr = 1.95 * 1.13 * 29000 / 25.2 * Math.sqrt(q + Math.sqrt(q ** 2 + 6.76 * (25.2 / 29000) ** 2));
    expect(r.Lr).toBeCloseTo(lr, 8); expect(r.warnings.join(" ")).toContain("shear center");
  });
});

describe("F3–F6 I-section local buckling", () => {
  it.each([["W14X90", 157, 143, 10.2], ["W12X65", 96.8, 87.9, 9.92]] as const)("F3 %s noncompact flange", (name, Z, S, lambda) => {
    // F3-1: interpolate between FyZ and .7FyS, λp=.38sqrt580, λr=sqrt580.
    const expected = 50 * Z - (50 * Z - 35 * S) * (lambda - 0.38 * Math.sqrt(580)) / (0.62 * Math.sqrt(580));
    const r = major(s(name)); expect(r.governing).toBe("FLB"); expect(r.nominal).toBeCloseTo(expected, 8);
  });
  it("F3 slender flange uses kc bounded to [0.35,0.76]", () => {
    const shape = { ...s("W24X55"), "bf/2tf": 30 };
    expect(state(major(shape), "FLB").nominal).toBeCloseTo(0.9 * E * (4 / Math.sqrt(54.6)) * 114 / 900);
  });
  it("F4 noncompact web includes Rpc, Rpt, Myc and FL", () => {
    // Synthetic doubly symmetric web λ=110: λp=90.55, λr=137.27;
    // Rpc=Mp/My-(Mp/My-1)(110-λp)/(λr-λp).
    const shape = { ...s("W24X55"), "h/tw": 110 };
    const r = major(shape), t = (110 - 3.76 * Math.sqrt(580)) / (1.94 * Math.sqrt(580));
    const Rpc = 6700 / 5700 - (6700 / 5700 - 1) * t;
    expect(r.section).toContain("§F4"); expect(r.nominal).toBeCloseTo(Rpc * 5700, 8);
    expect(r.steps.find(x => x.symbol === "R{pt}")!.value).toBeCloseTo(Rpc);
    expect(r.steps.find(x => x.symbol === "F{L}")!.value).toBe(35);
    expect(major(shape, r.Lr! * 2).governing).toBe("LTB");
  });
  it("F5 slender web uses Rpg and torsion-free elastic LTB", () => {
    const shape = { ...s("W24X55"), "h/tw": 160 }, r = major(shape);
    // aw = h tw / (bf tf) = (160*.395)*.395/(7.01*.505).
    const aw = 160 * 0.395 ** 2 / (7.01 * 0.505);
    const Rpg = 1 - Math.min(10, aw) / (1200 + 300 * Math.min(10, aw)) * (160 - 5.7 * Math.sqrt(580));
    expect(r.section).toContain("§F5"); expect(r.nominal).toBeCloseTo(Rpg * 5700);
    const rt = 7.01 / Math.sqrt(12 * (1 + aw / 6));
    const L = 2 * r.Lr!;
    expect(major(shape, L).nominal).toBeCloseTo(Rpg * Math.PI ** 2 * E / (L / rt) ** 2 * 114);
  });
  it("F6 includes channel plastic cap and correct 0.70 elastic coefficient", () => {
    const r = flexuralStrength(s("C15X33.9"), a36, { axis: "minor", Lb: 1000 });
    expect(r.nominal).toBeCloseTo(1.6 * 36 * 3.09);
    const shape = { ...s("W24X55"), "bf/2tf": 30 };
    const f = flexuralStrength(shape, fy50, { axis: "minor", Lb: 0 });
    expect(f.nominal).toBeCloseTo(0.70 * E * 8.3 / 900); expect(state(f, "FLB").steps.some(x => x.ref === "Eq. F6-4")).toBe(true);
  });
});

describe("F7 rectangular HSS", () => {
  it("HSS8x6x1/4 yields about x; noncompact flange reduces minor-axis strength", () => {
    for (const [axis, Z] of [["major", 16.9], ["minor", 13.9]] as const) {
      const r = flexuralStrength(s("HSS8X6X1/4"), hss50, { axis, Lb: 0 });
      const expected = axis === "major" ? 50 * Z : 50 * Z - (50 * Z - 50 * 12.1) * (7.3 / 0.233 - 1.12 * Math.sqrt(580)) / (0.28 * Math.sqrt(580));
      expect(r.nominal).toBeCloseTo(expected);
    }
  });
  it("noncompact flange interpolates toward FyS, not 0.7FyS", () => {
    const shape = { ...s("HSS8X6X1/4"), b: 7, B: 7.699 }, r = major(shape);
    const t = (7 / 0.233 - 1.12 * Math.sqrt(580)) / (0.28 * Math.sqrt(580));
    expect(state(r, "FLB").nominal).toBeCloseTo(845 - (845 - 710) * t);
  });
  it("slender flange uses effective width and relocates the neutral axis", () => {
    const shape = s("HSS12X8X3/16"), r = major(shape);
    const be = 1.92 * 0.174 * Math.sqrt(580) * (1 - 0.38 * Math.sqrt(580) / (7.48 / 0.174));
    const a = (7.48 - be) * 0.174, y = (12 - 0.174) / 2, Ae = 6.76 - a;
    const shift = -a * y / Ae, Ie = 140 - a * (y * y + 0.174 ** 2 / 12) - Ae * shift ** 2;
    expect(state(r, "FLB").nominal).toBeCloseTo(50 * Ie / (6 - shift));
    expect(state(r, "FLB").steps.find(x => x.symbol === "b{e}")!.value).toBeCloseTo(be);
    expect(state(r, "WLB").nominal).toBeGreaterThan(state(r, "FLB").nominal);
  });
  it("slender web follows F7-7 and excludes both-slender boxes", () => {
    const shape = { ...s("HSS8X6X1/4"), h: 35, Ht: 35.699 }, r = major(shape);
    const aw = Math.min(10, 70 / 5.3), Rpg = 1 - aw / (1200 + 300 * aw) * (35 / 0.233 - 5.7 * Math.sqrt(580));
    expect(state(r, "WLB").nominal).toBeCloseTo(Rpg * 50 * 14.2);
    expect(() => major({ ...shape, b: 10 })).toThrow(UnsupportedError);
  });
  it("LTB evaluates corrected F7-8/F7-9; minor axis and squares have none", () => {
    const shape = s("HSS8X6X1/4"), r = major(shape);
    const root = Math.sqrt(70.3 * 6.17), Lp = 0.13 * E * 2.43 * root / 845, Lr = 2 * E * 2.43 * root / (35 * 14.2);
    expect(r.Lp).toBeCloseTo(Lp); expect(r.Lr).toBeCloseTo(Lr);
    expect(state(major(shape, (Lp + Lr) / 2), "LTB").nominal).toBeCloseTo((845 + 35 * 14.2) / 2);
    expect(state(major(shape, Lr * 2), "LTB").nominal).toBeCloseTo(2 * E * root / (Lr * 2 / 2.43));
    expect(flexuralStrength(shape, fy50, { axis: "minor", Lb: 1e6 }).limitStates.some(l => l.id === "LTB")).toBe(false);
    expect(major(s("HSS6X6X1/4"), 1e6).Lp).toBeUndefined();
  });
});

describe("F8 round HSS / pipe", () => {
  it("compact pipe yielding and noncompact round-wall local buckling", () => {
    expect(flexuralStrength(s("Pipe8STD"), materialById("A53B")!, { axis: "major", Lb: 1e5 }).nominal).toBeCloseTo(35 * 20.8);
    // Synthetic dt=100, noncompact at Fy50: Mn=(.021*29000/100+50)*12.5.
    const shape = { ...s("HSS8.625X0.250"), OD: 10, tdes: 0.1 };
    expect(major(shape).nominal).toBeCloseTo((609 / 100 + 50) * 12.5);
  });
  it("slender wall uses F8-4 and the 0.45E/Fy applicability bound", () => {
    const shape = { ...s("HSS8.625X0.250"), OD: 20, tdes: 0.1 };
    expect(major(shape).nominal).toBeCloseTo(0.33 * E / 200 * 12.5);
    expect(() => major({ ...shape, OD: 26.1 })).toThrow(UnsupportedError);
  });
});

describe("F9 tees and double angles", () => {
  it("tee tension-stem yielding and the 2022 LTB curve", () => {
    const shape = s("WT6X13"), r = major(shape);
    // My=50*2.4=120, Mp=min(50*4.2,1.6*120)=192 kip-in.
    expect(r.Mp).toBe(192);
    expect(r.Lp).toBeCloseTo(1.76 * 1.51 * Math.sqrt(580));
    const Lr = 1.95 * 580 * Math.sqrt(8.66 * 0.15) / 2.4 * Math.sqrt(2.36 / 580 * 6.11 * 2.4 / 0.15 + 1);
    expect(r.Lr).toBeCloseTo(Lr);
    expect(state(major(shape, (r.Lp! + Lr) / 2), "LTB").nominal).toBeCloseTo(156);
    const L = 2 * Lr, B = 2.3 * 6.11 / L * Math.sqrt(8.66 / 0.15);
    expect(state(major(shape, L), "LTB").nominal).toBeCloseTo(1.95 * E / L * Math.sqrt(8.66 * 0.15) * (B + Math.sqrt(1 + B ** 2)));
  });
  it("tee compression-stem applies negative B and stem buckling", () => {
    const r = flexuralStrength(s("WT6X13"), fy50, { axis: "major", Lb: 120, stemInCompression: true });
    const B = -2.3 * 6.11 / 120 * Math.sqrt(8.66 / 0.15), Mcr = 1.95 * E / 120 * Math.sqrt(8.66 * 0.15) * (B + Math.sqrt(1 + B ** 2));
    expect(r.Mp).toBe(120); expect(r.Lp).toBeUndefined();
    expect(state(r, "LTB").nominal).toBeCloseTo(Math.min(120, Mcr));
    expect(state(r, "WLB").nominal).toBeCloseTo(50 * (1.43 - 0.515 * 26.6 / Math.sqrt(580)) * 2.4);
  });
  it("tee slender stem follows F9-19; compression flange uses Sxc", () => {
    const shape = { ...s("WT6X13"), "D/t": 50, "bf/2tf": 30 };
    const compression = flexuralStrength(shape, fy50, { axis: "major", Lb: 0, stemInCompression: true });
    expect(state(compression, "WLB").nominal).toBeCloseTo(1.52 * E / 2500 * 2.4);
    expect(state(major(shape), "FLB").nominal).toBeCloseTo(Math.min(192, 0.7 * E * (11.7 / 1.25) / 900));
  });
  it("double angles derive J from the matching single angle and apply F9-5", () => {
    const shape = s("2L8X6X1X3/8LLBB"), r = flexuralStrength(shape, a36, { axis: "major", Lb: 120, stemInCompression: true });
    expect(r.steps.find(x => x.symbol === "J")!.value).toBe(2 * 4.34);
    expect(r.Mp).toBeCloseTo(1.5 * 36 * 30.2);
    expect(state(r, "LTB").ref).toBe("§F9.2(b)(2)");
  });
  it.each(["WT6X13", "2L4X4X1/2"])("%s minor-axis bending follows Commentary F9 guidance", name => {
    const shape = s(name), Lb = 120;
    const r = flexuralStrength(shape, a36, { axis: "minor", Lb });
    const J = name.startsWith("2L") ? 2 * req(s("L4X4X1/2"), "J") : req(shape, "J");
    const Me = Math.PI / Lb * Math.sqrt(E * req(shape, "Ix") * 11200 * J), My = 36 * req(shape, "Sy");
    const Mn = My / Me <= 1 ? Math.min(1.5 * My, (1.92 - 1.17 * Math.sqrt(My / Me)) * My) : (0.92 - 0.17 * Me / My) * Me;
    expect(state(r, "LTB").nominal).toBeCloseTo(Math.min(r.Mp, Mn));
    expect(r.warnings.join(" ")).toContain("nonmandatory Commentary");
    expect(flexuralStrength(shape, a36, { axis: "minor", Lb: 0 }).Mp).toBeCloseTo(Math.min(36 * req(shape, "Zy"), 1.6 * My));
  });
});

describe("F10 single angles", () => {
  it("continuously restrained angle yielding and noncompact leg local buckling", () => {
    const r = flexuralStrength(s("L4X4X1/4"), a36, { axis: "major", Lb: 120, continuousLateralRestraint: true });
    expect(r.Mp).toBeCloseTo(1.5 * 36 * 1.03);
    expect(state(r, "LLB").nominal).toBeCloseTo(36 * 1.03 * (2.43 - 1.72 * 16 * Math.sqrt(36 / E)));
    expect(r.limitStates.some(x => x.id === "LTB")).toBe(false);
  });
  it("equal-leg unrestrained geometric-axis LTB includes the 0.80 reduction", () => {
    const r = flexuralStrength(s("L4X4X1/4"), a36, { axis: "major", Lb: 120 });
    const My = 0.8 * 36 * 1.03, Mcr = 0.58 * E * 4 ** 4 * 0.25 / 120 ** 2 * (Math.sqrt(1 + 0.88 * (120 * 0.25 / 16) ** 2) - 1);
    expect(r.Mp).toBeCloseTo(1.5 * My);
    const Mn = My / Mcr <= 1 ? Math.min(1.5 * My, (1.92 - 1.17 * Math.sqrt(My / Mcr)) * My) : (0.92 - 0.17 * Mcr / My) * Mcr;
    expect(state(r, "LTB").nominal).toBeCloseTo(Mn);
  });
  it("restraint at maximum moment applies 1.25Mcr and unreduced My", () => {
    const shape = s("L4X4X1/4"), a = flexuralStrength(shape, a36, { axis: "minor", Lb: 240 }), b = flexuralStrength(shape, a36, { axis: "minor", Lb: 240, restraintAtMaxMoment: true });
    const critical = (r: typeof a) => state(r, "LTB").steps.find(x => x.symbol === "M{cr}")!.value!;
    expect(critical(b) / critical(a)).toBeCloseTo(1.25); expect(b.Mp / a.Mp).toBeCloseTo(1.25);
  });
  it("slender leg F10-7 and continuous restraint for unequal angles", () => {
    const shape = s("L8X6X1");
    expect(() => flexuralStrength(shape, a36, { axis: "major", Lb: 120 })).toThrow(UnsupportedError);
    expect(flexuralStrength(shape, a36, { axis: "minor", Lb: 120, continuousLateralRestraint: true }).nominal).toBeGreaterThan(0);
    const r = major({ ...s("L4X4X1/4"), t: 0.1 });
    expect(state(r, "LLB").nominal).toBeCloseTo(0.71 * E / 40 ** 2 * 1.03);
  });
});

describe("F1 helper APIs and reporting", () => {
  it("Cb uses absolute moment samples and handles zero demand", () => {
    expect(cbFromMoments(10, -10, 10, -10)).toBe(1);
    expect(cbFromMoments(10, 5, 0, -5)).toBeCloseTo(12.5 / 5.5);
    expect(cbFromMoments(0, 0, 0, 0)).toBe(1);
    expect(() => cbFromMoments(1, 2, 0, 0)).toThrow(RangeError);
  });
  it("ltbCurve inserts exact breakpoints and uses nominal strength", () => {
    const shape = s("W24X55"), r = major(shape), curve = ltbCurve(shape, fy50, { axis: "major", Lmax: 2 * r.Lr!, n: 8 });
    expect(curve.some(p => p.Lb === r.Lp)).toBe(true); expect(curve.some(p => p.Lb === r.Lr)).toBe(true);
    expect(curve[0]).toEqual({ Lb: 0, Mn: r.nominal });
    expect(curve.every((p, i) => i === 0 || p.Lb > curve[i - 1]!.Lb)).toBe(true);
  });
  it("rejects invalid length and Cb inputs", () => {
    expect(() => major(s("W24X55"), -1)).toThrow(RangeError);
    expect(() => major(s("W24X55"), 120, 0)).toThrow(RangeError);
    expect(() => ltbCurve(s("W24X55"), fy50, { axis: "major", Lmax: NaN })).toThrow(RangeError);
  });
  it("every database shape / axis has finite cited strength or a deliberate scope exclusion", () => {
    const unsupported = new Set<string>();
    for (const shape of SHAPES) for (const axis of ["major", "minor"] as const) {
      const material = preferredMaterial(shape.type, familyOf(shape));
      try {
        const r = flexuralStrength(shape, material, { axis, Lb: 120 });
        expect(Number.isFinite(r.nominal), `${shape.label}/${axis}`).toBe(true); expect(r.nominal).toBeGreaterThan(0);
        for (const l of r.limitStates) { expect(l.ref).toBeTruthy(); expect(l).toHaveProperty("quantity", "moment"); }
        for (const x of [...r.steps, ...r.limitStates.flatMap(l => l.steps)]) {
          expect(x.ref, shape.label).toBeTruthy(); if (x.value !== undefined) { expect(x.quantity).toBeTruthy(); expect(Number.isFinite(x.value), shape.label).toBe(true); }
        }
      } catch (e) {
        if (!(e instanceof UnsupportedError)) throw new Error(`${shape.label}/${axis}: ${String(e)}`);
        expect(e.message.length).toBeGreaterThan(20);
        const fam = familyOf(shape);
        expect((fam === "angle" && req(shape, "b") !== req(shape, "d")) || ((fam === "hss-round" || fam === "pipe") && req(shape, "OD") / req(shape, "tdes") >= 0.45 * E / material.Fy)).toBe(true);
        unsupported.add(fam);
      }
    }
    expect(unsupported.has("tee")).toBe(false); expect(unsupported.has("double-angle")).toBe(false);
  });
});

describe("additional transitions and load-reversal checks", () => {
  it("F4 inelastic LTB interpolates from RpcMyc to FLSxc", () => {
    const shape = { ...s("W24X55"), "h/tw": 110 }, r = major(shape);
    const y = state(r, "Y").nominal;
    expect(state(major(shape, (r.Lp! + r.Lr!) / 2), "LTB").nominal).toBeCloseTo((y + 35 * 114) / 2);
  });
  it("F4 noncompact and slender flange branches remain capped by yielding", () => {
    const base = { ...s("W24X55"), "h/tw": 110 }, lambda = 15;
    const r = major({ ...base, "bf/2tf": lambda });
    const RpMy = state(r, "Y").nominal, factor = (lambda - 0.38 * Math.sqrt(580)) / (0.62 * Math.sqrt(580));
    expect(state(r, "FLB").nominal).toBeCloseTo(RpMy - (RpMy - 35 * 114) * factor);
    const slender = major({ ...base, "bf/2tf": 30 });
    expect(state(slender, "FLB").nominal).toBeCloseTo(Math.min(state(slender, "Y").nominal, 0.9 * E * (4 / Math.sqrt(110)) * 114 / 900));
  });
  it("F5 inelastic LTB and noncompact flange local buckling include Rpg", () => {
    const shape = { ...s("W24X55"), "h/tw": 160, "bf/2tf": 15 }, r = major(shape);
    const yieldMoment = state(r, "Y").nominal;
    expect(state(major(shape, (r.Lp! + r.Lr!) / 2), "LTB").nominal).toBeCloseTo(0.85 * yieldMoment);
    expect(state(r, "FLB").nominal).toBeCloseTo(yieldMoment * (1 - 0.3 * (15 - 0.38 * Math.sqrt(580)) / (0.62 * Math.sqrt(580))));
  });
  it("F9 double-angle tension-web local buckling uses the flange-face modulus", () => {
    const shape = s("2L4X4X1/4"), r = major(shape);
    const Sc = req(shape, "Ix") / req(shape, "y");
    expect(state(r, "FLB").nominal).toBeCloseTo(50 * Sc * (2.43 - 1.72 * 16 / Math.sqrt(580)));
  });
  it("F9 double-angle compression-web local buckling uses Sx", () => {
    const shape = s("2L4X4X1/4"), r = flexuralStrength(shape, fy50, { axis: "major", Lb: 0, stemInCompression: true });
    expect(state(r, "WLB").nominal).toBeCloseTo(50 * req(shape, "Sx") * (2.43 - 1.72 * 16 / Math.sqrt(580)));
  });
  it("F10 toe-tension branch uses F10-5b and has no compression-toe LLB when unrestrained", () => {
    const r = flexuralStrength(s("L4X4X1/4"), a36, { axis: "major", Lb: 120, toeInCompression: false });
    const Me = 0.58 * E * 256 * 0.25 / 120 ** 2 * (Math.sqrt(1 + 0.88 * (120 * 0.25 / 16) ** 2) + 1);
    expect(state(r, "LTB").steps.find(x => x.symbol === "M{cr}")!.value).toBeCloseTo(Me);
    expect(r.limitStates.some(x => x.id === "LLB")).toBe(false);
  });
  it("F10 restrained reversed bending checks the parallel compression leg", () => {
    const r = flexuralStrength(s("L4X4X1/4"), a36, { axis: "major", Lb: 120, continuousLateralRestraint: true, toeInCompression: false });
    // Reversal puts the horizontal toe in compression: Sc=Ix/y=3/1.08.
    expect(state(r, "LLB").nominal).toBeCloseTo(36 * (3 / 1.08) * (2.43 - 1.72 * 16 * Math.sqrt(36 / E)));
  });
  it("C-F9 minor-axis LTB accounts for Iy-independent Ix, J and full-section yielding", () => {
    const shape = s("WT6X13"), r = flexuralStrength(shape, fy50, { axis: "minor", Lb: 1e5 });
    const Me = Math.PI / 1e5 * Math.sqrt(E * 11.7 * 11200 * 0.15), My = 50 * 2.67;
    expect(state(r, "LTB").nominal).toBeCloseTo((0.92 - 0.17 * Me / My) * Me);
  });
  it("major-axis tension/compression tee and double-angle branches stay finite throughout the database", () => {
    for (const shape of SHAPES.filter(x => ["tee", "double-angle"].includes(familyOf(x)))) {
      const m = preferredMaterial(shape.type, familyOf(shape));
      for (const Lb of [0, 1, 120, 1200]) for (const stemInCompression of [false, true]) {
        const r = flexuralStrength(shape, m, { axis: "major", Lb, stemInCompression });
        expect(Number.isFinite(r.nominal), `${shape.label}/${Lb}/${stemInCompression}`).toBe(true); expect(r.nominal).toBeGreaterThan(0);
      }
    }
  });
});
