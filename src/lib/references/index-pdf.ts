/**
 * Builds a citation index from extracted PDF text: equations, tables, figures, sections,
 * chapters and parts, keyed exactly like `targetKey()` in ./parse.
 *
 * The index is deliberately conservative. A miss shows no preview rather than the wrong crop;
 * `fallbacks()` lets "Table B4.1b, Case 10" fall back to the table itself.
 */
import { fallbacks, targetKey } from "./parse";
import type { BBox, DocIndex, DocKind, IndexEntry, PageInfo, RefTarget } from "./types";
import type { PageText, TextLine } from "./pdf";

const EQ_TOKEN = /^\(?((?:C-)?[A-N]\d{0,2}(?:-\d{1,3}){1,2}[a-z]?)\)?$/;
const EQ_AT_END = /(?:^|\s)\(?((?:C-)?[A-N]\d{0,2}(?:-\d{1,3}){1,2}[a-z]?)\)?\s*$/;
const TABLE_HEAD = /^(?:Table|TABLE)\s+([A-Z0-9][A-Za-z0-9.\-]*)/;
const FIGURE_HEAD = /^(?:Fig\.|Figure|FIGURE)\s+([A-Z0-9][A-Za-z0-9.\-]*)/;
const SECTION_HEAD = /^((?:C-)?[A-N]\d{1,2}(?:\.\d{1,2}[a-z]?){1,3})\s+\S/;
const CHAPTER_HEAD = /^(?:CHAPTER|Chapter)\s+([A-N])(?![A-Za-z0-9])/;
const PART_HEAD = /^(?:PART|Part)\s+(\d{1,2})(?![0-9])/;
const TOC_LINE = /\.{4,}\s*\d+\s*$/;
const PRINTED_LABEL = /(?:^|\s)((?:\d{1,2}\.\d{1,2}|[A-Z]?)-?\d{1,3})$/;

function docKey(kind: DocKind, dg?: number): string {
  return kind === "manual" ? "manual" : kind === "spec" ? "spec" : kind === "asce7" ? "asce7" : kind === "dg" ? `dg${dg ?? 1}` : "other";
}

function isCommentaryPage(page: PageText): boolean {
  return page.lines.slice(0, 4).some((l) => /\bcommentary\b/i.test(l.text));
}

function pageLabel(page: PageText): string {
  for (const line of page.lines.slice(0, 3).concat(page.lines.slice(-2))) {
    const m = PRINTED_LABEL.exec(line.text.trim());
    if (m && m[1] && /\d/.test(m[1]) && m[1].length <= 10) return m[1];
  }
  return String(page.page + 1);
}

function union(boxes: BBox[]): BBox {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const b = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: b - y };
}

function pad(box: BBox, amount: number, page: PageText): BBox {
  const x = Math.max(0, box.x - amount);
  const y = Math.max(0, box.y - amount);
  return {
    x,
    y,
    w: Math.min(page.width, box.x + box.w + amount) - x,
    h: Math.min(page.height, box.y + box.h + amount) - y,
  };
}

/**
 * Extend a heading to the block it introduces. Stops at the first clear vertical break,
 * so an equation takes its "where" list and a table takes its header plus rows.
 */
function blockFrom(page: PageText, index: number, kind: RefTarget["kind"], anchor?: TextLine): BBox {
  const start = page.lines[index] ?? anchor;
  if (!start) return { x: 0, y: 0, w: 1, h: 1 };
  const lines = page.lines;
  const size = Math.max(start.bbox.h, 6);
  const first = kind === "equation" ? Math.max(0, index - 3) : index;
  const maxLines = kind === "equation" ? 16 : kind === "table" ? 42 : 22;
  const chosen: TextLine[] = lines.slice(first, index + 1);
  let bottom = chosen.reduce((max, l) => Math.max(max, l.bbox.y + l.bbox.h), start.bbox.y + start.bbox.h);
  for (let j = index + 1; j < lines.length && chosen.length < maxLines; j++) {
    const line = lines[j];
    if (!line) break;
    if (line.bbox.y - bottom > size * 1.85) break;
    chosen.push(line);
    bottom = Math.max(bottom, line.bbox.y + line.bbox.h);
  }
  return pad(union(chosen.map((l) => l.bbox)), Math.max(4, size * 0.55), page);
}

interface Candidate {
  key: string;
  page: number;
  bbox: BBox;
  title: string;
  context?: string;
  score: number;
}

function headingText(lines: TextLine[], index: number): string {
  const line = lines[index];
  if (!line) return "";
  return line.text.length > 140 ? `${line.text.slice(0, 137)}…` : line.text;
}

/**
 * Scan the document once. Every detected construct becomes an entry; the highest-scoring
 * occurrence wins (equation numbers are unique, but running references are not).
 */
export function buildIndex(pages: PageText[], fingerprint: string, kind: DocKind, dg?: number): DocIndex {
  const base = docKey(kind, dg);
  const candidates = new Map<string, Candidate>();

  const consider = (key: string, page: PageText, index: number, refKind: RefTarget["kind"], score: number, title?: string) => {
    if (TOC_LINE.test(page.lines[index]?.text ?? "")) score -= 4;
    const c: Candidate = {
      key,
      page: page.page,
      bbox: blockFrom(page, index, refKind),
      title: title ?? headingText(page.lines, index),
      score,
    };
    const prior = candidates.get(key);
    if (!prior || c.score > prior.score) candidates.set(key, c);
  };

  for (const page of pages) {
    const commentary = isCommentaryPage(page);
    const prefix = `${commentary ? "commentary" : base}`;
    if (commentary && kind !== "spec") continue;

    page.lines.forEach((line, index) => {
      const text = line.text.trim();
      if (!text) return;

      // Equation number alone on its line, or at the right edge of the equation line.
      const alone = EQ_TOKEN.exec(text);
      if (alone?.[1]) {
        consider(`${prefix}:equation:${alone[1]}`, page, index, "equation", 6);
      } else {
        const atEnd = EQ_AT_END.exec(text);
        if (atEnd?.[1] && /\d/.test(atEnd[1]) && text.length > atEnd[1].length + 2) {
          consider(`${prefix}:equation:${atEnd[1]}`, page, index, "equation", 3);
        }
      }

      const table = TABLE_HEAD.exec(text);
      if (table?.[1]) {
        const id = table[1].replace(/[.,;:]$/, "");
        consider(`${prefix}:table:${id}`, page, index, "table", text.length < 90 ? 5 : 2);
        // Case rows ("Case 10") inside the following table page.
        const caseMatch = /\bCase\s+\(?([0-9]{1,2}|[a-z])\)?/;
        if (/\bCase\b/.test(text)) {
          const c = caseMatch.exec(text);
          if (c?.[1]) consider(`${prefix}:table:${id}#${c[1]}`, page, index, "table", 4);
        }
      }

      const figure = FIGURE_HEAD.exec(text);
      if (figure?.[1]) consider(`${prefix}:figure:${figure[1].replace(/[.,;:]$/, "")}`, page, index, "figure", 4);

      const section = SECTION_HEAD.exec(text);
      if (section?.[1]) consider(`${prefix}:section:${section[1]}`, page, index, "section", text.length < 110 ? 4 : 2);

      const chapter = CHAPTER_HEAD.exec(text);
      if (chapter?.[1] && text.length < 80) consider(`${prefix}:chapter:${chapter[1]}`, page, index, "chapter", 4);

      const part = PART_HEAD.exec(text);
      if (part?.[1]) consider(`${base}:part:${part[1]}`, page, index, "part", 4);
    });
  }

  const entries: Record<string, IndexEntry> = {};
  for (const [key, c] of candidates) {
    entries[key] = {
      key,
      page: c.page,
      bbox: c.bbox,
      title: c.title,
      score: Math.min(1, c.score / 6),
    };
  }

  const pageInfo: PageInfo[] = pages.map((p) => ({
    w: p.width,
    h: p.height,
    label: pageLabel(p),
    commentary: isCommentaryPage(p) || undefined,
  }));

  return { fingerprint, version: 1, pages: pageInfo, entries };
}

/** Look up a target, walking the parser's fallback chain. */
export function lookup(index: DocIndex, target: RefTarget): IndexEntry | undefined {
  const keys = [target.key, ...fallbacks(target).map((t) => t.key)];
  for (const key of keys) {
    const entry = index.entries[key];
    if (entry) return entry;
  }
  return undefined;
}

/** How many of the supplied citations have a located region. */
export function coverage(index: DocIndex, targets: RefTarget[]): { total: number; found: number; missing: RefTarget[] } {
  const missing: RefTarget[] = [];
  let found = 0;
  for (const target of targets) {
    if (lookup(index, target)) found++;
    else missing.push(target);
  }
  return { total: targets.length, found, missing };
}

/** Convenience for tests and the Node verifier. */
export function keyFor(doc: DocKind, kind: RefTarget["kind"], id: string, dg?: number): string {
  return targetKey({ doc, kind, id, dg } as RefTarget);
}
