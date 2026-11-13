/**
 * Composite beams — AISC 360-22 Chapter I. Values from Manual Table 3-21 (stud strengths) and
 * hand calculations written out below (kip, in., ksi). Shapes from AISC Shapes Database v16.0.
 */
import { describe, expect, it } from "vitest";
import { findShape } from "@/data/shapes";
import {
  checkComposite,
  compositeFlexure,
  concreteModulus,
  detailingChecks,
  effectiveWidth,
  elasticProps,
  lowerBoundI,
  plasticState,
  pnaRows,
  studLayout,
  studStrength,
  sweepComposite,
  table319,
  validateComposite,
  type CompositeDesignInput,
  type SlabGeometry,
  type StudSpec,
} from "../composite";

const s = (label: string) => {
  const x = findShape(label);
  if (!x) throw new Error(label);
  return x;
};
const solid: SlabGeometry = { kind: "solid", tc: 6, hr: 0, wr: 0, pitch: 12 };
const deck3: SlabGeometry = { kind: "deck-perpendicular", tc: 4.5, hr: 3, wr: 6, pitch: 12 };
const stud34: StudSpec = { d: 0.75, length: 5, Fu: 65, perGroup: 1, position: "weak" };
const nw4 = { fc: 4, wc: 145 };
const psf = (v: number) => v / 144000;

describe("§I2.1b concrete modulus", () => {
  it("Ec = wc^1.5 √f'c", () => {
    // 145^1.5 = 1746.03; × √4 = 3492.1 ksi
    expect(concreteModulus(nw4)).toBeCloseTo(3492.1, 1);
    expect(concreteModulus({ fc: 3, wc: 110 })).toBeCloseTo(110 ** 1.5 * Math.sqrt(3), 9);
  });
});

describe("§I8.2a steel headed stud anchor strength (Manual Table 3-21)", () => {
  it.each([
    // [slab, perGroup, position, Qn] — 3/4 in. studs, Fu = 65 ksi, f'c = 4 ksi, wc = 145 pcf
    ["solid", 1, "weak", 21.5], // Rg = 1.0, Rp = 0.75: 0.75(0.4418)(65) = 21.54
    ["deck-perpendicular", 1, "weak", 17.2], // Rg = 1.0, Rp = 0.6: 17.23
    ["deck-perpendicular", 1, "strong", 21.5], // Rg = 1.0, Rp = 0.75
    ["deck-perpendicular", 2, "weak", 14.6], // Rg = 0.85, Rp = 0.6: 14.65
    ["deck-perpendicular", 2, "strong", 18.3], // Rg = 0.85, Rp = 0.75: 18.31
    ["deck-perpendicular", 3, "weak", 12.1], // Rg = 0.7, Rp = 0.6: 12.06
  ] as const)("%s, %i per rib, %s position → %f kips", (kind, perGroup, position, Qn) => {
    const slab = kind === "solid" ? solid : deck3;
    const r = studStrength(slab, { ...stud34, perGroup, position }, nw4);
    expect(r.Qn).toBeCloseTo(Qn, 1);
    expect(r.governs).toBe("anchor");
  });
  it("concrete limit governs for 3 ksi normal-weight concrete in a solid slab", () => {
    // Ec = 1746.03√3 = 3024.2; 0.5(0.4418)√(3 × 3024.2) = 21.04 < 21.54
    const r = studStrength(solid, stud34, { fc: 3, wc: 145 });
    expect(r.governs).toBe("concrete");
    expect(r.Qn).toBeCloseTo(21.0, 1);
  });
  it("5/8 in. stud in a solid slab, 4 ksi NWC: 0.75(0.3068)(65) = 15.0 kips", () => {
    expect(studStrength(solid, { ...stud34, d: 0.625 }, nw4).Qn).toBeCloseTo(14.96, 2);
  });
  it("deck ribs parallel use Rg from wr/hr and Rp = 0.75", () => {
    const wide = studStrength({ kind: "deck-parallel", tc: 4.5, hr: 3, wr: 6, pitch: 12 }, stud34, nw4);
    const narrow = studStrength({ kind: "deck-parallel", tc: 4.5, hr: 3, wr: 4, pitch: 12 }, stud34, nw4);
    expect(wide.Rg).toBe(1);
    expect(narrow.Rg).toBe(0.85);
    expect(wide.Rp).toBe(0.75);
  });
});

describe("§I3.1a effective width", () => {
  it("interior beam: 2 min(L/8, s/2)", () => {
    expect(effectiveWidth({ L: 360, position: "interior", spacing: 120 }).b).toBe(90); // L/8 = 45
    expect(effectiveWidth({ L: 540, position: "interior", spacing: 120 }).b).toBe(120); // s/2 = 60
  });
  it("edge beam: min(L/8, s/2) + min(L/8, e); tributary s/2 + e", () => {
    const w = effectiveWidth({ L: 480, position: "edge", spacing: 120, edge: 12 });
    expect(w.b).toBe(60 + 12);
    expect(w.tributary).toBe(72);
  });
});

describe("Manual Table 3-19 PNA locations — W18×35, Fy = 50 ksi", () => {
  // As = 10.3, bf = 6.00, tf = 0.425, tw = 0.300. AsFy = 515 kips.
  // Flange points: ΣQn = 515 − 2(50)(6.00)Y1, Y1 = 0, tf/4, tf/2, 3tf/4, tf.
  // Point 7: ΣQn = 0.25(515) = 128.75; point 6 midway between BFL (260) and 7: 194.4.
  // Web Y1 = tf + [(515 − ΣQn)/100 − 2.55] / 0.300.
  const rows = pnaRows(s("W18X35"), 50);
  it.each([
    ["TFL", 0, 515],
    ["2", 0.106, 451],
    ["3", 0.213, 388],
    ["4", 0.319, 324],
    ["BFL", 0.425, 260],
    ["6", 2.61, 194],
    ["7", 4.8, 129],
  ] as const)("%s: Y1 = %f in., ΣQn = %i kips", (point, Y1, Q) => {
    const r = rows.find((x) => x.point === point)!;
    expect(r.Y1).toBeCloseTo(Y1, 2);
    expect(Math.round(r.sumQn)).toBe(Q);
  });
  it("φMn at Y2 = 5 in. (hand calculation)", () => {
    // TFL: Mn = 515(17.7/2 + 5) = 7132.8 kip-in.; φMn = 6419.5 kip-in. = 535 kip-ft
    // BFL: Cs = 127.5, yC = 0.2125; Mn = 4557.75 − 2(127.5)(0.2125) + 260(5) = 5803.6; φMn = 435 kip-ft
    // 7:   Cs = 193.125; yC = [2.55(0.2125) + 1.3125(2.6125)] / 3.8625 = 1.0280
    //      Mn = 4557.75 − 2(193.125)(1.0280) + 128.75(5) = 4804.4; φMn = 360 kip-ft
    const t = table319(s("W18X35"), 50, [5]);
    const phiMn = (p: string) => (0.9 * t.find((r) => r.point === p)!.Mn[0]!) / 12;
    expect(phiMn("TFL")).toBeCloseTo(535.0, 0);
    expect(phiMn("BFL")).toBeCloseTo(435.3, 0);
    expect(phiMn("7")).toBeCloseTo(360.3, 0);
  });
  it("ILB at TFL, Y2 = 5 in. (Manual Table 3-20 method)", () => {
    // YENA = [10.3(8.85) + 10.3(17.7 + 5)] / 20.6 = 15.775
    // ILB = 510 + 10.3(15.775 − 8.85)² + 10.3(22.7 − 15.775)² = 1497.9 in.⁴
    const { ILB, YENA } = lowerBoundI(s("W18X35"), 50, 515, 5);
    expect(YENA).toBeCloseTo(15.775, 3);
    expect(ILB).toBeCloseTo(1497.9, 1);
  });
  it("plastic state is continuous at the flange/web boundary and Mn decreases with ΣQn", () => {
    const shape = s("W18X35");
    const ms = rows.map((r) => plasticState(shape, 50, r.sumQn, 5).Mn);
    for (let k = 1; k < ms.length; k++) expect(ms[k]!).toBeLessThan(ms[k - 1]!);
    const atBfl = plasticState(shape, 50, 260, 5);
    expect(atBfl.pna).toBe("flange");
    expect(plasticState(shape, 50, 259.999, 5).Mn).toBeCloseTo(atBfl.Mn, 1);
    // Equilibrium: C + Cs = T
    const p = plasticState(shape, 50, 150, 4);
    expect(p.C + p.Cs).toBeCloseTo(p.T, 9);
  });
});

describe("§I3.2a composite flexure — W21×50, 3 in. deck + 4-1/2 in. NWC, b = 120 in.", () => {
  // Cconc = 0.85(4)(120)(4.5) = 1836 kips (Eq. I3-1a); AsFy = 14.7(50) = 735 kips (Eq. I3-1b)
  const base = { shape: s("W21X50"), Fy: 50, b: 120, slab: deck3, concrete: nw4 };
  it("full composite: PNA in slab, Mn = AsFy(d/2 + Y2)", () => {
    // a = 735 / (0.85 × 4 × 120) = 1.801 in.; Y2 = 7.5 − 0.901 = 6.599 in.
    // Mn = 735(10.4 + 6.599) = 12,494 kip-in.; φMn = 937.1 kip-ft
    const r = compositeFlexure({ ...base, sumQn: 1000 });
    expect(r.Cconc).toBeCloseTo(1836, 6);
    expect(r.controls).toBe("steel");
    expect(r.plastic.pna).toBe("slab");
    expect(r.a).toBeCloseTo(1.801, 3);
    expect((0.9 * r.nominal) / 12).toBeCloseTo(937.1, 1);
    expect(r.ratio).toBe(1);
  });
  it("partial composite ΣQn = 386 kips: PNA in flange", () => {
    // a = 386/408 = 0.946; Y2 = 7.5 − 0.473 = 7.027; Cs = (735 − 386)/2 = 174.5
    // Acs = 3.49 in.² ≤ bf tf = 6.53(0.535) = 3.494 → Y1 = 3.49/6.53 = 0.5345 (flange), yC = 0.2672
    // Mn = 735(10.4) + 386(7.027) − 2(174.5)(0.2672) = 7644 + 2712.4 − 93.3 = 10,263 kip-in.
    const r = compositeFlexure({ ...base, sumQn: 386 });
    expect(r.controls).toBe("anchors");
    expect(r.plastic.pna).toBe("flange");
    expect(r.plastic.Y1).toBeCloseTo(0.5345, 3);
    expect(r.nominal).toBeCloseTo(10263, -1);
    expect(r.ratio).toBeCloseTo(386 / 735, 9);
  });
  it("Itr and Ieff for partial composite (Commentary Eq. C-I3-4)", () => {
    // n = 29000/3492.1 = 8.3045; b/n = 14.450 in.; b t{c}/n = 65.03 in.²; steel centroid 7.5 + 10.4 = 17.9 in.
    // ȳ = (65.03 × 2.25 + 14.7 × 17.9)/(65.03 + 14.7) = 5.136 in. > t{c} → slab uncracked
    // Itr = 984 + 14.7(12.764)² + 14.45(4.5)³/12 + 65.03(2.886)² = 4030 in.⁴
    const flex = compositeFlexure({ ...base, sumQn: 386 });
    const e = elasticProps(s("W21X50"), 50, 120, deck3, concreteModulus(nw4), flex);
    expect(e.n).toBeCloseTo(8.3045, 3);
    expect(e.ytr).toBeCloseTo(5.136, 2);
    expect(e.Itr).toBeCloseTo(4030, -1);
    expect(e.Ieff).toBeCloseTo(984 + Math.sqrt(386 / 735) * (e.Itr - 984), 6);
    expect(e.ILB).toBeLessThan(e.Itr);
    expect(e.ILB).toBeGreaterThan(984);
  });
});

describe("§I8.2d stud layout and detailing", () => {
  it("max spacing min(8t, 36 in.); deck ribs perpendicular limit one group per rib", () => {
    const l = studLayout(540, deck3, stud34, 7.5);
    expect(l.smax).toBe(36);
    expect(l.groupsAvailable).toBe(22); // 270 / 12
    expect(l.nSpacing).toBe(8); // 270 / 36 = 7.5 → 8
    expect(studLayout(540, solid, stud34, 6).smin).toBe(4.5); // 6d
  });
  it("flags deck and anchor rules", () => {
    const c = detailingChecks(deck3, { ...stud34, length: 4 }, { bf: 6.53, tf: 0.535 }, 7.5);
    expect(c.find((x) => x.id === "above")?.ok).toBe(false); // 4 − 3 = 1 in. < 1-1/2 in.
    expect(c.find((x) => x.id === "len")?.ok).toBe(true);
    expect(detailingChecks(deck3, stud34, { bf: 6.53, tf: 0.535 }, 7.5).every((x) => x.ok)).toBe(true);
  });
});

const office: CompositeDesignInput = {
  L: 540,
  position: "interior",
  spacing: 120,
  slab: deck3,
  concrete: nw4,
  stud: stud34,
  loads: { deckMisc: psf(5), constructionLive: psf(20), superDead: psf(15), live: psf(100) },
  shored: false,
  bracing: "deck",
  liveLimit: 360,
  totalLimit: 240,
  camberFraction: 0.8,
  deflectionBasis: "ILB",
  minComposite: 0.25,
  method: "LRFD",
};

describe("composite beam design — 45 ft span, 10 ft spacing, 3 in. deck + 4-1/2 in. NWC", () => {
  it("validates input", () => {
    expect(validateComposite(office)).toBeUndefined();
    expect(validateComposite({ ...office, L: -1 })).toBeDefined();
  });
  it("W21×50: loads, construction stage and composite stage (hand calculation)", () => {
    const r = checkComposite(s("W21X50"), office);
    // Slab: 145 pcf × (4.5 + 3 × 6/12) in. = 145 × 6/12 = 72.5 psf; × 10 ft = 0.725 kip/ft
    expect(r.loads.slab * 12).toBeCloseTo(0.725, 6);
    // Construction: wD = 0.725 + 0.05 + 0.05 = 0.825 kip/ft, wL = 0.2 kip/ft
    // Mu = (1.2 × 0.825 + 1.6 × 0.2)(45²)/8 = 1.31 × 253.125 = 331.6 kip-ft
    expect(r.construction!.Mu.value / 12).toBeCloseTo(331.6, 1);
    expect(r.construction!.capacity / 12).toBeCloseTo((0.9 * 50 * 110) / 12, 3); // φMp, braced by deck
    // Composite: wD = 0.825 + 0.15 = 0.975, wL = 1.0 kip/ft → Mu = (1.17 + 1.6)(253.125) = 701.2 kip-ft
    expect(r.composite.Mu.value / 12).toBeCloseTo(701.2, 1);
    // Wet deflection: 5(0.825/12)(540⁴)/(384 × 29000 × 984) = 2.67 in. → camber 0.8 × 2.67 = 2.13 → 2 in.
    expect(r.deflection.wet).toBeCloseTo(2.67, 2);
    expect(r.deflection.camber).toBe(2);
    // Anchors: Qn = 17.2 kips; φMn ≥ Mu requires the minimum n; n − 1 must fail strength or a limit
    const n = r.studs.nPerHalf;
    expect(r.pass).toBe(true);
    expect(r.composite.mRatio).toBeLessThanOrEqual(1);
    const less = checkComposite(s("W21X50"), { ...office, studsPerHalf: n - 1 });
    expect(less.pass).toBe(false);
    expect(r.studs.total).toBe(2 * n);
  });
  it("ASD uses Ωb = 1.67 and D + L", () => {
    const r = checkComposite(s("W21X50"), { ...office, method: "ASD", studsPerHalf: 20 });
    expect(r.composite.capacity).toBeCloseTo(r.composite.flexure.nominal / 1.67, 9);
    expect(r.composite.Mu.value / 12).toBeCloseTo((0.975 + 1.0) * 253.125, 1);
  });
  it("unbraced construction uses Cb = 1.14 over the full span", () => {
    const r = checkComposite(s("W21X50"), { ...office, bracing: "unbraced" });
    expect(r.construction!.Lb).toBe(540);
    expect(r.construction!.Cb).toBeCloseTo(12.5 / 11, 6);
    expect(r.construction!.flexure.governing).toBe("LTB");
  });
  it("shored construction skips the construction stage and applies all dead load to the composite section", () => {
    const r = checkComposite(s("W21X50"), { ...office, shored: true });
    expect(r.construction).toBeUndefined();
    expect(r.deflection.camber).toBe(0);
    expect(r.deflection.dead).toBeGreaterThan(0);
  });
  it("selection ranks the lightest passing W-shape with the fewest anchors", () => {
    const pool = ["W16X26", "W16X31", "W18X35", "W21X44", "W21X50", "W24X55"].map(s);
    const { candidates } = sweepComposite(pool, office);
    const passing = candidates.filter((c) => c.pass);
    expect(passing.length).toBeGreaterThan(0);
    for (let k = 1; k < passing.length; k++)
      expect(Number(passing[k]!.shape.W)).toBeGreaterThanOrEqual(Number(passing[k - 1]!.shape.W));
    // Every passing candidate must satisfy each check
    for (const c of passing) for (const ch of c.checks) expect(ch.ratio).toBeLessThanOrEqual(1 + 1e-9);
  });
});
