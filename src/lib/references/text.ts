/** Pure text-line grouping, shared by the browser extractor and the Node verifier. */
import type { BBox } from "./types";

export interface TextLine {
  text: string;
  bbox: BBox;
}

export interface PageText {
  page: number;
  width: number;
  height: number;
  lines: TextLine[];
}

export interface RawItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function groupItems(items: RawItem[]): TextLine[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: RawItem[][] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    const h = Math.max(item.h, 1);
    if (row && Math.abs((row[0]?.y ?? 0) - item.y) < h * 0.55) row.push(item);
    else rows.push([item]);
  }
  const out: TextLine[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let text = "";
    let prev: RawItem | undefined;
    let bbox: BBox | undefined;
    for (const item of row) {
      if (!item.str) continue;
      if (prev) {
        const gap = item.x - (prev.x + prev.w);
        if (gap > Math.max(item.h, prev.h) * 0.18) text += " ";
      }
      text += item.str;
      const next = { x: item.x, y: item.y - item.h, w: item.w, h: item.h };
      bbox = bbox
        ? {
            x: Math.min(bbox.x, next.x),
            y: Math.min(bbox.y, next.y),
            w: Math.max(bbox.x + bbox.w, next.x + next.w) - Math.min(bbox.x, next.x),
            h: Math.max(bbox.y + bbox.h, next.y + next.h) - Math.min(bbox.y, next.y),
          }
        : next;
      prev = item;
    }
    if (bbox && text.trim()) out.push({ text: text.replace(/\s+/g, " ").trim(), bbox });
  }
  return out;
}
