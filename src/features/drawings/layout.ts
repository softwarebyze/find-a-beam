/**
 * Screen layout of a dimensioned cross-section. Geometry scales with `scale` (px/in.) while
 * text, arrowheads and dimension offsets stay a constant size in px. Pure — no React.
 *
 * Dimensions on each side are packed into tiers: a dim takes the innermost tier where it does
 * not collide with dims already placed there, and each tier is pushed out past the labels of
 * the tier inside it, so labels never sit on another dimension's line.
 */
import type { DimSpec, Pt, SectionGeometry, Side } from "./geometry";

export const FONT_PX = 11;
export const LINE_H = 14;
const CHAR = FONT_PX * 0.6; // monospace advance
const ARROW = 7;
const GAP0 = 22; // outline → first dimension line
const TIER_GAP = 8;
const EXT_GAP = 3; // object → extension line
const EXT_OVER = 4; // extension line past the dimension line
const LABEL_GAP = 3;
const AXIS_OVER = 7;
const PAD = 4;
/** Geometry never gets less than this share of the available width, however long the labels. */
const MIN_GEOMETRY_SHARE = 0.4;

export interface SceneLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  role: "dim" | "ext" | "axis";
}
export interface SceneArrow {
  x: number;
  y: number;
  dx: number;
  dy: number;
}
export interface SceneText {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  rotate?: boolean;
  /** Two lines: symbol + value, then the parenthetical */
  stacked?: boolean;
  role: "dim" | "axis" | "marker";
  /** dim id or axis id */
  ref: string;
}
export interface Scene {
  width: number;
  height: number;
  /** px position of the geometry origin */
  ox: number;
  oy: number;
  scale: number;
  lines: SceneLine[];
  arrows: SceneArrow[];
  texts: SceneText[];
  markers: { kind: "cg" | "sc"; x: number; y: number }[];
}

/** Label size: single-line width, and stacked (two-line) width when the label has a parenthetical. */
export interface LabelSize {
  w: number;
  stackedW?: number;
}

export interface LayoutOptions {
  scale: number;
  showAxes: boolean;
  label: (d: DimSpec) => LabelSize;
}

const symWidth = (sym: string) => {
  const subChars = (sym.match(/\{[^}]*\}/g) ?? []).join("").replace(/[{}]/g, "").length;
  const mainChars = sym.replace(/\{[^}]*\}/g, "").replace(/\p{M}/gu, "").length;
  return (mainChars + subChars * 0.75) * CHAR;
};

/** Size estimate (px) of "<sym> <main> <paren>" set in the label font. */
export function estimateLabel(sym: string, main: string, paren?: string): LabelSize {
  const first = symWidth(sym) + (1 + main.length) * CHAR;
  if (!paren) return { w: first };
  return { w: first + (1 + paren.length) * CHAR, stackedW: Math.max(first, paren.length * CHAR) };
}

const isH = (side: Side) => side === "top" || side === "bottom";

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function layoutScene(g: SectionGeometry, dims: DimSpec[], o: LayoutOptions): Scene {
  const s = o.scale;
  const X = (x: number) => x * s;
  const Y = (y: number) => y * s;
  const ex = { x0: X(g.extent.x0), y0: Y(g.extent.y0), x1: X(g.extent.x1), y1: Y(g.extent.y1) };
  const lines: SceneLine[] = [];
  const arrows: SceneArrow[] = [];
  const texts: SceneText[] = [];
  const rects: Rect[] = [{ ...ex }];
  const line = (x1: number, y1: number, x2: number, y2: number, role: SceneLine["role"]) => {
    lines.push({ x1, y1, x2, y2, role });
    rects.push({ x0: Math.min(x1, x2), y0: Math.min(y1, y2), x1: Math.max(x1, x2), y1: Math.max(y1, y2) });
  };
  const text = (t: SceneText, w: number) => {
    texts.push(t);
    const h = t.stacked ? 2 * LINE_H : LINE_H;
    const [hw, hh] = t.rotate ? [h / 2, w / 2] : [w / 2, h / 2];
    const cx = t.rotate || t.anchor === "middle" ? t.x : t.anchor === "start" ? t.x + w / 2 : t.x - w / 2;
    rects.push({ x0: cx - hw, y0: t.y - hh, x1: cx + hw, y1: t.y + hh });
  };

  // ---- dimensions placed outside the outline, packed into tiers per side
  for (const side of ["top", "bottom", "left", "right"] as const) {
    const horiz = isH(side);
    type Item = { d: DimSpec; along: boolean; stacked: boolean; lo: number; hi: number; w: number; labelAt: number };
    const tiers: { ivs: [number, number][]; thick: number; items: Item[] }[] = [];
    const sideDims = dims.filter((x) => x.place === side);
    for (const d of sideDims) {
      const m1 = horiz ? X(d.a.x) : Y(d.a.y);
      const m2 = horiz ? X(d.b.x) : Y(d.b.y);
      const lo = Math.min(m1, m2),
        hi = Math.max(m1, m2),
        mid = (lo + hi) / 2;
      const size = o.label(d);
      const along = hi - lo >= size.w + 2 * ARROW + 6;
      const stacked = !along && !horiz && size.stackedW !== undefined;
      const w = stacked ? (size.stackedW ?? size.w) : size.w;
      const h = stacked ? 2 * LINE_H : LINE_H;
      // A short vertical dim puts its label past one of its arrows (interior side first), choosing a
      // spot that no other dim on this side runs an extension line through.
      let labelAt = mid;
      if (!along && !horiz) {
        const others = sideDims.filter((x) => x !== d).flatMap((x) => [Y(x.a.y), Y(x.b.y)]);
        const below = hi + ARROW + 4 + h / 2,
          above = lo - ARROW - 4 - h / 2;
        const order = lo - ex.y0 <= ex.y1 - hi ? [below, above, mid] : [above, below, mid];
        labelAt = order.find((c) => others.every((y) => Math.abs(y - c) > h / 2 + 2)) ?? order[0]!;
      }
      const iv: [number, number] = along
        ? [lo - 2, hi + 2]
        : horiz
          ? [lo - ARROW - 6, hi + ARROW + 8 + w]
          : [Math.min(lo - ARROW - 6, labelAt - h / 2), Math.max(hi + ARROW + 6, labelAt + h / 2)];
      const thick = LABEL_GAP + (horiz || along ? LINE_H : w + 2);
      let tier = tiers.find((t) => t.ivs.every(([a, b]) => iv[1] + 4 < a || iv[0] - 4 > b));
      if (!tier) {
        tier = { ivs: [], thick: 0, items: [] };
        tiers.push(tier);
      }
      tier.ivs.push(iv);
      tier.thick = Math.max(tier.thick, thick);
      tier.items.push({ d, along, stacked, lo, hi, w, labelAt });
    }

    const sign = side === "top" || side === "left" ? -1 : 1;
    const edge = side === "top" ? ex.y0 : side === "bottom" ? ex.y1 : side === "left" ? ex.x0 : ex.x1;
    let offset = GAP0;
    for (const tier of tiers) {
      const pos = edge + sign * offset; // coordinate of the dimension line
      for (const { d, along, stacked, lo, hi, w, labelAt } of tier.items) {
        for (const p of [d.a, d.b]) {
          const from = (horiz ? Y(p.y) : X(p.x)) + sign * EXT_GAP;
          if (sign * (pos - from) <= 0) continue;
          if (horiz) line(X(p.x), from, X(p.x), pos + sign * EXT_OVER, "ext");
          else line(from, Y(p.y), pos + sign * EXT_OVER, Y(p.y), "ext");
        }
        const pt = (t: number): Pt => (horiz ? { x: t, y: pos } : { x: pos, y: t });
        const ax = horiz ? { x: 1, y: 0 } : { x: 0, y: 1 };
        const pa = pt(lo),
          pb = pt(hi);
        if (along) {
          line(pa.x, pa.y, pb.x, pb.y, "dim");
          arrows.push({ x: pa.x, y: pa.y, dx: -ax.x, dy: -ax.y }, { x: pb.x, y: pb.y, dx: ax.x, dy: ax.y });
        } else {
          const a = pt(lo - ARROW - 5),
            b = pt(hi + ARROW + 5);
          line(a.x, a.y, b.x, b.y, "dim");
          arrows.push({ x: pa.x, y: pa.y, dx: ax.x, dy: ax.y }, { x: pb.x, y: pb.y, dx: -ax.x, dy: -ax.y });
        }
        const off = pos + sign * (LABEL_GAP + LINE_H / 2);
        const mid = (lo + hi) / 2;
        const t = { role: "dim", ref: d.id, stacked } as const;
        if (horiz) {
          if (along) text({ ...t, x: mid, y: off, anchor: "middle" }, w);
          else text({ ...t, x: hi + ARROW + 8, y: off, anchor: "start" }, w);
        } else if (along) {
          text({ ...t, x: off, y: mid, anchor: "middle", rotate: true }, w);
        } else {
          text({ ...t, x: pos + sign * (LABEL_GAP + 1), y: labelAt, anchor: sign < 0 ? "end" : "start" }, w);
        }
      }
      offset += tier.thick + TIER_GAP;
    }
  }

  // ---- inline dims (thicknesses): arrows outside pointing in, label past the far end
  for (const d of dims.filter((x) => x.place === "inline")) {
    const a = { x: X(d.a.x), y: Y(d.a.y) },
      b = { x: X(d.b.x), y: Y(d.b.y) };
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    const ext = ARROW + 5;
    line(a.x - u.x * ext, a.y - u.y * ext, b.x + u.x * ext, b.y + u.y * ext, "dim");
    arrows.push({ x: a.x, y: a.y, dx: u.x, dy: u.y }, { x: b.x, y: b.y, dx: -u.x, dy: -u.y });
    const size = o.label(d);
    const stacked = size.stackedW !== undefined;
    const h = stacked ? 2 * LINE_H : LINE_H;
    const tip = { x: b.x + u.x * (ext + 3), y: b.y + u.y * (ext + 3) };
    text(
      {
        x: tip.x,
        y: tip.y + (u.y < -0.3 ? -h / 2 : u.y > 0.3 ? h / 2 : 0),
        anchor: u.x < -0.3 ? "end" : "start",
        role: "dim",
        ref: d.id,
        stacked,
      },
      stacked ? (size.stackedW ?? size.w) : size.w,
    );
  }

  // ---- axes and markers
  const markers: Scene["markers"] = [];
  if (o.showAxes) {
    for (const axis of g.axes) {
      const c = { x: X(axis.origin.x), y: Y(axis.origin.y) };
      if (!axis.principal && axis.dir.y === 0) {
        line(ex.x0 - AXIS_OVER, c.y, ex.x1 + AXIS_OVER, c.y, "axis");
        text({ x: ex.x1 + AXIS_OVER + 2, y: c.y - 1, anchor: "start", role: "axis", ref: axis.id }, CHAR);
      } else if (!axis.principal && axis.dir.x === 0) {
        line(c.x, ex.y1 + AXIS_OVER, c.x, ex.y0 - AXIS_OVER, "axis");
        text({ x: c.x - 3, y: ex.y0 - AXIS_OVER - 1, anchor: "end", role: "axis", ref: axis.id }, CHAR);
      } else {
        // Run to the edge of the extent box, then AXIS_OVER px past it (measured normal to that edge)
        const end = (dir: Pt) => {
          const tx = dir.x > 0 ? (ex.x1 - c.x) / dir.x : dir.x < 0 ? (ex.x0 - c.x) / dir.x : Infinity;
          const ty = dir.y > 0 ? (ex.y1 - c.y) / dir.y : dir.y < 0 ? (ex.y0 - c.y) / dir.y : Infinity;
          const viaSide = tx <= ty;
          const across = Math.abs(viaSide ? dir.x : dir.y);
          const t = Math.max(0, Math.min(tx, ty)) + Math.min(3 * AXIS_OVER, AXIS_OVER / Math.max(across, 0.2));
          const n = viaSide ? { x: Math.sign(dir.x), y: 0 } : { x: 0, y: Math.sign(dir.y) };
          return { x: c.x + dir.x * t, y: c.y + dir.y * t, n };
        };
        const p = end(axis.dir);
        const q = end({ x: -axis.dir.x, y: -axis.dir.y });
        line(q.x, q.y, p.x, p.y, "axis");
        text(
          {
            x: p.x + p.n.x * 3,
            y: p.y + p.n.y * 9,
            anchor: p.n.x > 0 ? "start" : p.n.x < 0 ? "end" : "middle",
            role: "axis",
            ref: axis.id,
          },
          CHAR,
        );
      }
    }
    for (const m of g.markers) {
      const p = { x: X(m.at.x), y: Y(m.at.y) };
      markers.push({ kind: m.kind, ...p });
      if (m.kind === "sc") text({ x: p.x - 4, y: p.y - 9, anchor: "end", role: "marker", ref: "sc" }, 2 * CHAR);
    }
  }

  const bx0 = Math.min(...rects.map((r) => r.x0)),
    by0 = Math.min(...rects.map((r) => r.y0));
  const bx1 = Math.max(...rects.map((r) => r.x1)),
    by1 = Math.max(...rects.map((r) => r.y1));
  const dx = PAD - bx0,
    dy = PAD - by0;
  const mv = (p: { x: number; y: number }) => {
    p.x += dx;
    p.y += dy;
  };
  for (const l of lines) {
    l.x1 += dx;
    l.x2 += dx;
    l.y1 += dy;
    l.y2 += dy;
  }
  arrows.forEach(mv);
  texts.forEach(mv);
  markers.forEach(mv);
  return {
    width: bx1 - bx0 + 2 * PAD,
    height: by1 - by0 + 2 * PAD,
    ox: dx,
    oy: dy,
    scale: s,
    lines,
    arrows,
    texts,
    markers,
  };
}

/**
 * Largest scale (px/in.) at which the whole scene fits `availW` × `maxH` px. If the labels alone
 * would crowd the geometry below MIN_GEOMETRY_SHARE of the width, the scene is allowed to overflow
 * and the SVG is shrunk by the browser instead.
 */
export function fitScale(
  g: SectionGeometry,
  dims: DimSpec[],
  o: Omit<LayoutOptions, "scale">,
  availW: number,
  maxH: number,
): number {
  const w = g.extent.x1 - g.extent.x0,
    h = g.extent.y1 - g.extent.y0;
  const floor = Math.min((MIN_GEOMETRY_SHARE * availW) / w, (0.6 * maxH) / h);
  let s = Math.min(availW / w, maxH / h) * 0.6;
  for (let i = 0; i < 8; i++) {
    const sc = layoutScene(g, dims, { ...o, scale: s });
    const next = Math.max(floor, Math.min((availW - (sc.width - w * s)) / w, (maxH - (sc.height - h * s)) / h));
    if (Math.abs(next - s) < 0.005 * s) return Math.min(s, next);
    s = next;
  }
  return s;
}
