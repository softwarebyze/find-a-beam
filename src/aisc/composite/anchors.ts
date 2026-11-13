/** Steel headed stud anchors in composite beams — AISC 360-22 §I8.2a (strength), §I8.1 and §I8.2d (detailing). */
import { fmt } from "@/lib/units";
import type { CalcStep } from "../types";
import { concreteModulus, cstep } from "./slab";
import type { ConcreteProps, SlabGeometry, StudSpec, StudStrength } from "./types";

/** Group effect factor Rg and position effect factor Rp, §I8.2a. */
export function studFactors(
  slab: SlabGeometry,
  stud: StudSpec,
): { Rg: number; Rp: number; rgCase: string; rpCase: string } {
  if (slab.kind === "solid")
    return {
      Rg: 1,
      Rp: 0.75,
      rgCase: "anchors welded in a row directly to the steel shape",
      rpCase: "anchors welded directly to the steel shape",
    };
  if (slab.kind === "deck-parallel") {
    const wide = slab.wr / slab.hr >= 1.5;
    return {
      Rg: wide ? 1 : 0.85,
      Rp: 0.75,
      rgCase: wide ? "deck ribs parallel, w{r}/h{r} ≥ 1.5" : "deck ribs parallel, w{r}/h{r} < 1.5",
      rpCase: "anchors welded through steel deck with ribs parallel",
    };
  }
  const n = Math.max(1, Math.round(stud.perGroup));
  return {
    Rg: n === 1 ? 1 : n === 2 ? 0.85 : 0.7,
    Rp: stud.position === "strong" ? 0.75 : 0.6,
    rgCase: `${n === 1 ? "one anchor" : n === 2 ? "two anchors" : "three or more anchors"} per rib, ribs perpendicular`,
    rpCase:
      stud.position === "strong"
        ? "ribs perpendicular, e{mid-ht} ≥ 2 in. (strong position)"
        : "ribs perpendicular, e{mid-ht} < 2 in. (weak position)",
  };
}

/** Nominal shear strength of one steel headed stud anchor, Eq. I8-1. */
export function studStrength(slab: SlabGeometry, stud: StudSpec, concrete: ConcreteProps): StudStrength {
  if (!(stud.d > 0 && stud.Fu > 0)) throw new RangeError("Stud diameter and Fu must be positive");
  const Asa = (Math.PI * stud.d ** 2) / 4;
  const Ec = concreteModulus(concrete);
  const { Rg, Rp, rgCase, rpCase } = studFactors(slab, stud);
  const concreteLimit = 0.5 * Asa * Math.sqrt(concrete.fc * Ec);
  const steelLimit = Rg * Rp * Asa * stud.Fu;
  const Qn = Math.min(concreteLimit, steelLimit);
  const steps: CalcStep[] = [
    cstep("Cross-sectional area of the anchor", "A{sa}", Asa, "area", "§I8.2a", "π d{sa}² / 4"),
    cstep(
      "Modulus of elasticity of concrete",
      "E{c}",
      Ec,
      "stress",
      "§I2.1b",
      "w{c}^1.5 √f′{c}",
      `w{c} = ${fmt(concrete.wc, 4)} lb/ft³ (${fmt(concrete.wc * 16.0185, 4)} kg/m³)`,
    ),
    cstep("Group effect factor", "R{g}", Rg, "ratio", "§I8.2a", undefined, rgCase),
    cstep("Position effect factor", "R{p}", Rp, "ratio", "§I8.2a", undefined, rpCase),
    cstep("Concrete limit", "0.5A{sa}√(f′{c}E{c})", concreteLimit, "force", "Eq. I8-1"),
    cstep("Anchor steel limit", "R{g}R{p}A{sa}F{u}", steelLimit, "force", "Eq. I8-1"),
    cstep("Nominal strength of one anchor", "Q{n}", Qn, "force", "Eq. I8-1 · Manual Table 3-21"),
  ];
  return {
    Qn,
    Asa,
    Ec,
    Rg,
    Rp,
    concreteLimit,
    steelLimit,
    governs: concreteLimit < steelLimit ? "concrete" : "anchor",
    steps,
  };
}

export interface StudLayout {
  /** Anchors that fit between the point of maximum moment and the support (half span), per §I8.2d */
  nMax: number;
  /** Minimum anchors per half span to satisfy the maximum spacing of §I8.2d */
  nSpacing: number;
  /** Maximum longitudinal spacing, in. */
  smax: number;
  /** Minimum longitudinal spacing, in. */
  smin: number;
  /** Deck ribs (or stud rows) available in the half span */
  groupsAvailable: number;
}

/** Layout limits along the half span L/2 (uniform load, simple span). */
export function studLayout(L: number, slab: SlabGeometry, stud: StudSpec, slabDepthTotal: number): StudLayout {
  const half = L / 2,
    per = Math.max(1, Math.round(stud.perGroup));
  const smax = Math.min(8 * slabDepthTotal, 36);
  const smin = slab.kind === "deck-perpendicular" ? Math.max(4 * stud.d, slab.pitch) : 6 * stud.d;
  const groupsAvailable = Math.max(0, Math.floor(half / smin));
  return { nMax: groupsAvailable * per, nSpacing: Math.ceil(half / smax - 1e-9), smax, smin, groupsAvailable };
}

/** Spacing actually used for n anchors per half span, in.; ribs perpendicular round to a multiple of the pitch. */
export function studSpacing(
  L: number,
  n: number,
  slab: SlabGeometry,
  stud: StudSpec,
  layout: StudLayout,
): { groups: number; s: number } {
  const per = Math.max(1, Math.round(stud.perGroup));
  // Spread anchors as needed for the maximum spacing; a group can hold at most `per` and at least one anchor.
  const groups = Math.min(layout.groupsAvailable, n, Math.max(Math.ceil(n / per), layout.nSpacing));
  if (groups <= 0) return { groups: 0, s: Infinity };
  if (slab.kind === "deck-perpendicular") {
    const k = Math.max(1, Math.floor(layout.groupsAvailable / groups));
    return { groups, s: k * slab.pitch };
  }
  return { groups, s: L / 2 / groups };
}

export interface DetailCheck {
  id: string;
  name: string;
  ref: string;
  ok: boolean;
  /** Provided value and limit, in. */
  value: number;
  limit: number;
  relation: "≥" | "≤";
}

const rule = (
  id: string,
  name: string,
  ref: string,
  value: number,
  relation: "≥" | "≤",
  limit: number,
): DetailCheck => ({
  id,
  name,
  ref,
  value,
  limit,
  relation,
  ok: relation === "≥" ? value >= limit - 1e-9 : value <= limit + 1e-9,
});

/** Anchor and deck detailing rules, §I8.1, §I8.2d and §I3.2c(1). Values in in. */
export function detailingChecks(
  slab: SlabGeometry,
  stud: StudSpec,
  steel: { bf: number; tf: number },
  slabDepthTotal: number,
): DetailCheck[] {
  const per = Math.max(1, Math.round(stud.perGroup));
  const out: DetailCheck[] = [
    rule("len", "Anchor length after installation ≥ 4d{sa}", "§I8.1", stud.length, "≥", 4 * stud.d),
  ];
  if (per > 1) {
    const across = slab.kind === "deck-parallel" ? Math.min(steel.bf, slab.wr) : steel.bf;
    out.push(
      rule("dia", "d{sa} ≤ 2.5t{f} (anchors not over the web)", "§I8.1", stud.d, "≤", 2.5 * steel.tf),
      rule("trans", "Width for transverse spacing 4d{sa}", "§I8.2d", (per - 1) * 4 * stud.d + stud.d, "≤", across),
    );
  }
  if (slab.kind === "solid")
    out.push(
      rule(
        "embed",
        "Concrete cover over anchor head (detailing practice)",
        "—",
        slabDepthTotal - stud.length,
        "≥",
        0.5,
      ),
    );
  else
    out.push(
      rule("hr", "Nominal rib height h{r}", "§I3.2c(1)", slab.hr, "≤", 3),
      rule("wr", "Average rib width w{r}", "§I3.2c(1)", slab.wr, "≥", 2),
      rule("dsa", "Anchor diameter d{sa}", "§I3.2c(1)", stud.d, "≤", 0.75),
      rule("above", "Anchor projection above the deck", "§I3.2c(1)", stud.length - slab.hr, "≥", 1.5),
      rule("cover", "Concrete cover over anchor head", "§I3.2c(1)", slabDepthTotal - stud.length, "≥", 0.5),
      rule("tc", "Slab thickness above the deck t{c}", "§I3.2c(1)", slab.tc, "≥", 2),
    );
  return out;
}
