/** Concrete, slab geometry and effective width — AISC 360-22 §§I1.3, I2.1b, I3.1a, I3.2c. */
import type { Quantity } from "@/lib/units";
import type { CalcStep } from "../types";
import type { ConcreteProps, EffectiveWidth, EffectiveWidthInput, SlabGeometry } from "./types";

export function cstep(
  label: string,
  symbol: string | undefined,
  value: number | undefined,
  quantity: Quantity | undefined,
  ref?: string,
  expr?: string,
  note?: string,
): CalcStep {
  return { label, symbol, value, quantity, ref, expr, note };
}

/** Modulus of elasticity of concrete, ksi: Ec = wc^1.5 √f'c (wc in lb/ft³, f'c in ksi). §I2.1b */
export function concreteModulus(c: ConcreteProps): number {
  return c.wc ** 1.5 * Math.sqrt(c.fc);
}

/** Distance from top of steel to top of slab, in. */
export function slabDepth(s: SlabGeometry): number {
  return s.kind === "solid" ? s.tc : s.hr + s.tc;
}

/** Equivalent solid concrete thickness for self-weight (ribs filled at the average rib width), in. */
export function equivalentThickness(s: SlabGeometry): number {
  return s.kind === "solid" ? s.tc : s.tc + (s.hr * s.wr) / s.pitch;
}

/** Slab self-weight as an area load, ksi (kip/in.²). */
export function slabWeight(s: SlabGeometry, c: ConcreteProps): number {
  return (c.wc / 1000 / 1728) * equivalentThickness(s);
}

/**
 * Thickness of concrete that may resist compression, in. Concrete below the top of the deck is
 * neglected for ribs perpendicular (§I3.2c(2)) and conservatively neglected for ribs parallel.
 */
export function effectiveConcreteThickness(s: SlabGeometry): number {
  return s.tc;
}

export function validateSlab(s: SlabGeometry, c: ConcreteProps): string | undefined {
  if (!(c.fc > 0 && Number.isFinite(c.fc))) return "Concrete strength f'c must be positive.";
  if (!(c.wc >= 90 && c.wc <= 155)) return "Concrete unit weight must be between 90 and 155 lb/ft³ (§I2.1b).";
  if (!(s.tc > 0 && Number.isFinite(s.tc))) return "Slab thickness must be positive.";
  if (s.kind !== "solid") {
    if (!(s.hr > 0 && s.wr > 0 && s.pitch > 0)) return "Deck rib height, width and pitch must be positive.";
    if (s.wr > s.pitch) return "Average rib width cannot exceed the rib pitch.";
  }
  return undefined;
}

/** Effective width of the concrete slab, §I3.1a: each side the least of L/8, half the beam spacing, edge distance. */
export function effectiveWidth(i: EffectiveWidthInput): EffectiveWidth {
  const eighth = i.L / 8,
    half = i.spacing / 2;
  const left = Math.min(eighth, half);
  const right = i.position === "edge" ? Math.min(eighth, i.edge ?? 0) : Math.min(eighth, half);
  const b = left + right;
  const tributary = i.position === "edge" ? half + (i.edge ?? 0) : i.spacing;
  const steps: CalcStep[] = [
    cstep("One-eighth of the beam span", "L/8", eighth, "span", "§I3.1a(a)"),
    cstep("One-half the distance to the adjacent beam", "s/2", half, "span", "§I3.1a(b)"),
  ];
  if (i.position === "edge")
    steps.push(cstep("Distance to the edge of the slab", "e", i.edge ?? 0, "span", "§I3.1a(c)"));
  steps.push(
    cstep(
      "Effective width",
      "b",
      b,
      "length",
      "§I3.1a",
      i.position === "edge" ? "min(L/8, s/2) + min(L/8, e)" : "2 min(L/8, s/2)",
    ),
  );
  return { b, left, right, tributary, steps };
}
