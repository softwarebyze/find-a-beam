/** Planar geometry helpers for gusset plates (convex polygons, rays, segment clipping). Units: in. */
export interface Pt {
  x: number;
  y: number;
}

export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
export const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Signed area (positive when counterclockwise). */
export function polygonArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) s += cross(poly[i]!, poly[(i + 1) % poly.length]!);
  return s / 2;
}

/** Point inside (or on) a counterclockwise convex polygon. */
export function insideConvex(poly: Pt[], p: Pt, eps = 1e-9): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!,
      b = poly[(i + 1) % poly.length]!;
    if (cross(sub(b, a), sub(p, a)) < -eps) return false;
  }
  return true;
}

/**
 * Cyrus–Beck clip of segment p0→p1 against a counterclockwise convex polygon.
 * Returns parameters [t0, t1] ⊂ [0, 1] of the inside portion, or undefined when fully outside.
 */
export function clipSegment(poly: Pt[], p0: Pt, p1: Pt): [number, number] | undefined {
  let t0 = 0,
    t1 = 1;
  const d = sub(p1, p0);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!,
      b = poly[(i + 1) % poly.length]!;
    const edge = sub(b, a);
    // inside: cross(edge, p - a) >= 0
    const num = cross(edge, sub(p0, a));
    const den = cross(edge, d);
    if (Math.abs(den) < 1e-14) {
      if (num < -1e-12) return undefined;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1 + 1e-12) return undefined;
  }
  return [t0, t1];
}

/** Distance from p (inside the polygon) along unit direction u to the polygon boundary. */
export function rayExit(poly: Pt[], p: Pt, u: Pt): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!,
      b = poly[(i + 1) % poly.length]!;
    const e = sub(b, a);
    const den = cross(u, e);
    if (Math.abs(den) < 1e-14) continue;
    const w = sub(a, p);
    const t = cross(w, e) / den; // along ray
    const s = cross(w, u) / den; // along edge
    if (t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.min(best, t);
  }
  return best;
}

export const unitFromVertical = (thetaDeg: number, side: 1 | -1 = 1): Pt => {
  const r = (thetaDeg * Math.PI) / 180;
  return { x: side * Math.sin(r), y: Math.cos(r) };
};
