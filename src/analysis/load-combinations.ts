/**
 * Load combinations — ASCE/SEI 7-22 §2.3.1 (strength, LRFD) and §2.4.1 (allowable stress, ASD).
 * Load effects are any consistent unit (kip/ft, kips, kip-in. …).
 */
import type { DesignMethod } from "@/aisc/types";

export interface LoadSet {
  D: number; // dead
  L?: number; // live
  Lr?: number; // roof live
  S?: number; // snow
  R?: number; // rain
  W?: number; // wind (strength-level per ASCE 7-22)
  E?: number; // seismic (strength-level)
}

export interface Combination {
  id: string;
  /** e.g. "1.2D + 1.6L + 0.5(Lr or S or R)" */
  label: string;
  factors: Partial<Record<keyof LoadSet, number>>;
}

const roofVariants = ["Lr", "S", "R"] as const;

function expand(id: string, label: string, base: Partial<Record<keyof LoadSet, number>>, roof?: number): Combination[] {
  if (roof === undefined) return [{ id, label, factors: base }];
  return roofVariants.map((r) => ({ id: `${id}-${r}`, label: label.replace("(Lr or S or R)", r), factors: { ...base, [r]: roof } }));
}

export const LRFD_COMBINATIONS: Combination[] = [
  { id: "LC1", label: "1.4D", factors: { D: 1.4 } },
  ...expand("LC2", "1.2D + 1.6L + 0.5(Lr or S or R)", { D: 1.2, L: 1.6 }, 0.5),
  ...expand("LC3a", "1.2D + 1.6(Lr or S or R) + L", { D: 1.2, L: 1 }, 1.6),
  ...expand("LC3b", "1.2D + 1.6(Lr or S or R) + 0.5W", { D: 1.2, W: 0.5 }, 1.6),
  ...expand("LC4", "1.2D + 1.0W + L + 0.5(Lr or S or R)", { D: 1.2, W: 1, L: 1 }, 0.5),
  { id: "LC5", label: "0.9D + 1.0W", factors: { D: 0.9, W: 1 } },
  { id: "LC6", label: "1.2D + 1.0E + L + 0.2S", factors: { D: 1.2, E: 1, L: 1, S: 0.2 } },
  { id: "LC7", label: "0.9D + 1.0E", factors: { D: 0.9, E: 1 } },
];

export const ASD_COMBINATIONS: Combination[] = [
  { id: "AC1", label: "D", factors: { D: 1 } },
  { id: "AC2", label: "D + L", factors: { D: 1, L: 1 } },
  ...expand("AC3", "D + (Lr or S or R)", { D: 1 }, 1),
  ...expand("AC4", "D + 0.75L + 0.75(Lr or S or R)", { D: 1, L: 0.75 }, 0.75),
  { id: "AC5", label: "D + 0.6W", factors: { D: 1, W: 0.6 } },
  ...expand("AC6", "D + 0.75L + 0.75(0.6W) + 0.75(Lr or S or R)", { D: 1, L: 0.75, W: 0.45 }, 0.75),
  { id: "AC7", label: "0.6D + 0.6W", factors: { D: 0.6, W: 0.6 } },
  { id: "AC8", label: "D + 0.7E", factors: { D: 1, E: 0.7 } },
  { id: "AC9", label: "D + 0.525E + 0.75L + 0.75S", factors: { D: 1, E: 0.525, L: 0.75, S: 0.75 } },
  { id: "AC10", label: "0.6D + 0.7E", factors: { D: 0.6, E: 0.7 } },
];

export function combinationsFor(method: DesignMethod) {
  return method === "LRFD" ? LRFD_COMBINATIONS : ASD_COMBINATIONS;
}

export function applyCombination(loads: LoadSet, c: Combination): number {
  return Object.entries(c.factors).reduce((sum, [k, f]) => sum + (f ?? 0) * (loads[k as keyof LoadSet] ?? 0), 0);
}

/** Governing (max absolute) combination. Loads not supplied are taken as zero. */
export function governingCombination(loads: LoadSet, method: DesignMethod): { combo: Combination; value: number; all: { combo: Combination; value: number }[] } {
  const all = combinationsFor(method).map((combo) => ({ combo, value: applyCombination(loads, combo) }));
  const best = all.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a));
  return { ...best, all };
}
