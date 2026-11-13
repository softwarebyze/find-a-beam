import type { DesignMethod, LimitState, StrengthResult } from "./types";

/**
 * Available strength: φRn (LRFD) or Rn/Ω (ASD). When limit states carry their own factors
 * (tension yielding vs. rupture), returns the minimum available strength over limit states.
 */
export function available(
  r: Pick<StrengthResult, "nominal" | "phi" | "omega"> & { limitStates?: LimitState[] },
  method: DesignMethod,
): number {
  const ls = r.limitStates?.filter((l) => l.phi !== undefined && l.omega !== undefined);
  if (ls && ls.length) {
    return Math.min(...ls.map((l) => (method === "LRFD" ? l.phi! * l.nominal : l.nominal / l.omega!)));
  }
  return method === "LRFD" ? r.phi * r.nominal : r.nominal / r.omega;
}

export function factorLabel(r: Pick<StrengthResult, "phi" | "omega">, method: DesignMethod): string {
  return method === "LRFD" ? `φ = ${r.phi}` : `Ω = ${r.omega}`;
}

/** Pick the governing (minimum nominal) limit state. */
export function governingOf(limitStates: LimitState[]): LimitState {
  if (limitStates.length === 0) throw new Error("no applicable limit states");
  return limitStates.reduce((a, b) => (b.nominal < a.nominal ? b : a));
}

export const RESISTANCE = {
  flexure: { phi: 0.9, omega: 1.67 },
  compression: { phi: 0.9, omega: 1.67 },
  shear: { phi: 0.9, omega: 1.67 },
  /** §G2.1(a): rolled I-shapes with h/tw ≤ 2.24√(E/Fy) */
  shearRolledI: { phi: 1.0, omega: 1.5 },
  tensionYield: { phi: 0.9, omega: 1.67 },
  tensionRupture: { phi: 0.75, omega: 2.0 },
} as const;
