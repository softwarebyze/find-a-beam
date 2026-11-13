export type Matrix = number[][];
export const zeros = (n: number, m = n): Matrix => Array.from({ length: n }, () => Array<number>(m).fill(0));
export const mv = (a: Matrix, b: number[]) => a.map(row => row.reduce((s, v, i) => s + v * b[i]!, 0));
export const transpose = (a: Matrix): Matrix => a[0]!.map((_, i) => a.map(row => row[i]!));
export const multiply = (a: Matrix, b: Matrix): Matrix => a.map(row => b[0]!.map((_, j) => row.reduce((s, v, k) => s + v * b[k]![j]!, 0)));

/** Diagonally scaled Cholesky: rejects mechanisms and non-positive tangent stiffness.
 * Scaling separates rotational and translational units before the pivot test. */
export function solvePositive(a: Matrix, b: number[]): number[] {
  const n = b.length;
  if (!n) return [];
  const scale = a.map((row, i) => {
    if (!(row[i]! > 0)) throw new Error('Instability: zero or negative tangent stiffness (mechanism or elastic buckling).');
    return Math.sqrt(row[i]!);
  });
  const l = zeros(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let v = a[i]![j]! / (scale[i]! * scale[j]!);
      for (let k = 0; k < j; k++) v -= l[i]![k]! * l[j]![k]!;
      if (i === j) {
        if (!(v > 1e-11)) throw new Error('Instability: singular or non-positive tangent stiffness (mechanism or elastic buckling).');
        l[i]![j] = Math.sqrt(v);
      } else l[i]![j] = v / l[j]![j]!;
    }
  }
  const y = Array<number>(n).fill(0), x = Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) y[i] = (b[i]! / scale[i]! - l[i]!.slice(0, i).reduce((s, v, j) => s + v * y[j]!, 0)) / l[i]![i]!;
  for (let i = n - 1; i >= 0; i--) {
    let v = y[i]!;
    for (let j = i + 1; j < n; j++) v -= l[j]![i]! * x[j]!;
    x[i] = v / l[i]![i]!;
  }
  return x.map((v, i) => v / scale[i]!);
}

/** Euler–Bernoulli elastic plus consistent initial-stress matrix; P positive in compression.
 * Mesh subdivision resolves member curvature (P-δ), not just story drift (P-Δ). */
export function elementStiffness(EA: number, EI: number, L: number, P = 0): Matrix {
  const a = EA / L, b = 12 * EI / L ** 3, c = 6 * EI / L ** 2, d = 4 * EI / L, e = 2 * EI / L;
  const k = [[a,0,0,-a,0,0],[0,b,c,0,-b,c],[0,c,d,0,-c,e],[-a,0,0,a,0,0],[0,-b,-c,0,b,-c],[0,c,e,0,-c,d]];
  const ix = [1,2,4,5];
  const g = [[36,3*L,-36,3*L],[3*L,4*L*L,-3*L,-L*L],[-36,-3*L,36,-3*L],[3*L,-L*L,-3*L,4*L*L]];
  ix.forEach((i, r) => ix.forEach((j, s) => { k[i]![j]! -= P / (30 * L) * g[r]![s]!; }));
  return k;
}
export function transform(c: number, s: number): Matrix {
  return [[c,s,0,0,0,0],[-s,c,0,0,0,0],[0,0,1,0,0,0],[0,0,0,c,s,0],[0,0,0,-s,c,0],[0,0,0,0,0,1]];
}
/** Condense released end rotations from BOTH stiffness and consistent loads. */
export function release(k: Matrix, f: number[], indices: number[]): { k: Matrix; f: number[] } {
  const a = k.map(row => [...row]), p = [...f];
  for (const r of indices) {
    const pivot = a[r]![r]!;
    if (!(pivot > 1e-12)) throw new Error('Instability at a released member end.');
    const col = a.map(row => row[r]!);
    for (let i = 0; i < 6; i++) if (i !== r) {
      p[i]! -= col[i]! * p[r]! / pivot;
      for (let j = 0; j < 6; j++) if (j !== r) a[i]![j]! -= col[i]! * col[j]! / pivot;
    }
    for (let i = 0; i < 6; i++) { a[r]![i] = 0; a[i]![r] = 0; }
    p[r] = 0;
  }
  return { k: a, f: p };
}
