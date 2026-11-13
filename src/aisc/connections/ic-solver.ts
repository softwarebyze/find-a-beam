/** Small damped Newton solver. Coordinates are nondimensionalized by the group radius. */
export type Pair = readonly [number, number];
export function solveEquilibrium(evaluate: (q: number, k: number) => Pair, seeds: Pair[]): Pair {
  let best = Infinity;
  for (const seed of seeds) {
    let [q, k] = seed;
    for (let iteration = 0; iteration < 100; iteration++) {
      const f = evaluate(q, k),
        error = Math.hypot(...f);
      best = Math.min(best, error);
      if (error < 2e-9) return [q, k];
      const hq = 1e-5 * Math.max(1, Math.abs(q)),
        hk = 1e-5 * Math.max(1, Math.abs(k));
      const fq = evaluate(q + hq, k),
        fk = evaluate(q, k + hk);
      const a = (fq[0] - f[0]) / hq,
        b = (fk[0] - f[0]) / hk,
        c = (fq[1] - f[1]) / hq,
        d = (fk[1] - f[1]) / hk;
      const determinant = a * d - b * c;
      if (Math.abs(determinant) < 1e-18) break;
      let dq = (-d * f[0] + b * f[1]) / determinant,
        dk = (c * f[0] - a * f[1]) / determinant;
      const scale = Math.max(1, Math.abs(dq) / Math.max(2, Math.abs(q)), Math.abs(dk) / Math.max(2, Math.abs(k)));
      dq /= scale;
      dk /= scale;
      let accepted = false;
      for (let step = 1; step >= 1 / 4096; step /= 2) {
        if (Math.hypot(...evaluate(q + step * dq, k + step * dk)) < error) {
          q += step * dq;
          k += step * dk;
          accepted = true;
          break;
        }
      }
      if (!accepted) break;
    }
  }
  throw new RangeError(
    `Instantaneous-center equilibrium did not converge (normalized residual ${best.toExponential(2)}). Try the elastic method or revise degenerate geometry.`,
  );
}
