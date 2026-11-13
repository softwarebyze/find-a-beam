/**
 * Citation parser: turns any SpecRef chip text into lookup targets.
 *
 *   "Eq. G6-1"                    → spec equation G6-1
 *   "Eqs. E3-1–E3-3"              → E3-1, E3-2, E3-3
 *   "§§B4.3, D2–D3"               → sections B4.3, D2, D3
 *   "§G2.1(b)(2)"                 → section G2.1 with list item (b)(2)
 *   "Table B4.1b, Case 10"        → spec table B4.1b, case 10
 *   "Manual Tables 2-4, 2-5"      → manual tables
 *   "Commentary Eqs. C-A-7-1/2"   → commentary equations C-A-7-1, C-A-7-2
 *   "DG1 Eqs. 4-60–4-62"          → Design Guide 1 equations
 *   "Part 3 · Ch. F, G"           → manual part 3, chapters F and G
 *
 * Unrecognized words are skipped, so descriptive suffixes ("§F7 Square and rectangular HSS",
 * "Manual Table 3-2 format") still resolve. Text with no locator yields no targets.
 */
import type { ParsedRef, RefDoc, RefKind, RefTarget } from "./types";

const ID: Record<RefKind, RegExp> = {
  equation: /^(?:C-)?(?:[A-N]\d{1,2}-\d{1,3}[a-z]?|[A-N]-\d{1,2}-\d{1,3}[a-z]?|\d{1,2}-\d{1,3}[a-z]?)(?![A-Za-z0-9])/,
  // "A-4.2.4d" is the Specification's notation for Appendix 4, Section 4.2.4d.
  section: /^(?:C-)?(?:A-\d{1,2}|[A-N]\d{1,2}|\d{1,2})(?:\.\d{1,2}[a-z]?){0,3}(?![A-Za-z0-9])/,
  table: /^(?:C-)?(?:[A-N]\d{1,2}\.\d{1,2}[a-zA-Z]?|[A-N]-\d{1,2}\.\d{1,2}|\d{1,2}-\d{1,3}[a-z]?)(?![A-Za-z0-9])/,
  figure: /^(?:C-)?(?:[A-N]\d{1,2}\.\d{1,2}[a-z]?|[A-N]-\d{1,2}\.\d{1,2}|\d{1,2}[.-]\d{1,3}[a-z]?)(?![A-Za-z0-9])/,
  part: /^\d{1,2}(?:\.\d)?(?![A-Za-z0-9])/,
  chapter: /^[A-N](?![A-Za-z0-9])/,
  appendix: /^\d(?![A-Za-z0-9])/,
};

const KIND_HEADS: [RegExp, RefKind][] = [
  [/^(?:Eqs?\.|Equations?\b)/, "equation"],
  [/^(?:§§?|Sections?\b|Sects?\.)/, "section"],
  [/^(?:Tables?\b|TABLE\b)/, "table"],
  [/^(?:Figs?\.|Figures?\b)/, "figure"],
  [/^Parts?\b/, "part"],
  [/^(?:Chapters?\b|Chs?\.)/, "chapter"],
  [/^(?:Appendix\b|Appendices\b|App\.)/, "appendix"],
];

type DocHead = { doc: RefDoc; dg?: number };
const DOC_HEADS: [RegExp, (m: RegExpMatchArray) => DocHead][] = [
  [/^(?:AISC\s+)?(?:DG|Design Guide)\s*(\d{1,3})\b/, (m) => ({ doc: "dg", dg: Number(m[1]) })],
  [/^(?:ANSI\/)?AISC\s+360(?:-\d{2})?/, () => ({ doc: "spec" })],
  [/^(?:the\s+)?Specification\b|^Spec\.(?=\s)/, () => ({ doc: "spec" })],
  [/^ASCE\/SEI\s*7(?:-\d{2})?|^ASCE\s*7(?:-\d{2})?/, () => ({ doc: "asce7" })],
  [/^Commentary\b|^Comm\.(?=\s)/, () => ({ doc: "commentary" })],
  [/^(?:AISC\s+)?(?:Steel Construction\s+)?Manual\b/, () => ({ doc: "manual" })],
];

/** Separators that end a citation and reset all context. */
const HARD_SEP = /^(?:·|•|;|\s\/\s|\|)/;
const LIST_SEP = /^\s*(?:,|&|\band\b)\s*/;
const RANGE_SEP = /^\s*(?:–|—|\bto\b|\bthrough\b)\s*/;
/** Hyphen ranges only for kinds whose ids never contain a hyphen ("Chapters D-H"). */
const HYPHEN_RANGE_KINDS: ReadonlySet<RefKind> = new Set(["chapter", "appendix", "part"]);
const MAX_RANGE = 40;

interface Ctx {
  doc?: DocHead;
  kind?: RefKind;
}

/** Resolve the publication for an id, given any explicit doc context. */
function resolveDoc(kind: RefKind, rawId: string, ctx: DocHead | undefined): { doc: RefDoc; id: string; dg?: number } {
  const commentaryPrefixed = rawId.startsWith("C-");
  if (ctx?.doc === "dg") return { doc: "dg", id: rawId, dg: ctx.dg };
  if (ctx?.doc === "asce7") return { doc: "asce7", id: rawId };
  switch (kind) {
    case "equation":
      if (commentaryPrefixed) return { doc: "commentary", id: rawId };
      if (/^\d/.test(rawId)) return { doc: ctx?.doc ?? "manual", id: rawId };
      return { doc: ctx?.doc === "commentary" ? "commentary" : "spec", id: rawId };
    case "section": {
      // Commentary sections mirror the Specification numbering; "§C-F9" is Commentary §F9.
      const id = (commentaryPrefixed ? rawId.slice(2) : rawId).replace(/^A-(?=\d)/, "");
      if (commentaryPrefixed) return { doc: "commentary", id };
      return { doc: ctx?.doc === "commentary" ? "commentary" : "spec", id };
    }
    case "table":
    case "figure":
      if (commentaryPrefixed) return { doc: "commentary", id: rawId };
      if (/^\d/.test(rawId)) return { doc: "manual", id: rawId };
      return { doc: ctx?.doc === "commentary" ? "commentary" : "spec", id: rawId };
    case "part":
      return { doc: "manual", id: rawId };
    case "chapter":
    case "appendix":
      return { doc: ctx?.doc === "commentary" ? "commentary" : "spec", id: rawId };
  }
}

export function docKey(doc: RefDoc, dg?: number): string {
  return doc === "dg" ? `dg${dg ?? ""}` : doc;
}

/** Canonical lookup key: "spec:equation:G6-1", "spec:section:G2.1(a)", "spec:table:B4.1b#10", "dg1:equation:4-60". */
export function targetKey(t: Pick<RefTarget, "doc" | "kind" | "id" | "dg" | "sub" | "case">): string {
  return `${docKey(t.doc, t.dg)}:${t.kind}:${t.id}${t.sub ?? ""}${t.case ? `#${t.case}` : ""}`;
}

function caseLabel(c: string): string {
  return /^\d/.test(c) ? `Case ${c}` : `Case (${c})`;
}

export function targetLabel(t: Pick<RefTarget, "doc" | "kind" | "id" | "dg" | "sub" | "case">): string {
  const dgPrefix = t.doc === "dg" ? `DG${t.dg ?? ""} ` : "";
  switch (t.kind) {
    case "equation":
      return `${dgPrefix}Eq. ${t.id}`;
    case "section": {
      const appendix = (t.doc === "spec" || t.doc === "commentary") && /^(\d+)\./.exec(t.id)?.[1];
      const s = `${appendix ? `App. ${appendix} ` : ""}§${t.id}${t.sub ?? ""}`;
      if (t.doc === "commentary") return `Commentary ${s}`;
      if (t.doc === "asce7") return `ASCE 7-22 ${s}`;
      return `${dgPrefix}${s}`;
    }
    case "table": {
      const base = t.doc === "manual" ? `Manual Table ${t.id}` : `${dgPrefix}Table ${t.id}`;
      return t.case ? `${base}, ${caseLabel(t.case)}` : base;
    }
    case "figure":
      return `${dgPrefix}Fig. ${t.id}`;
    case "part":
      return `Manual Part ${t.id}`;
    case "chapter":
      return t.doc === "commentary" ? `Commentary Chapter ${t.id}` : `Chapter ${t.id}`;
    case "appendix":
      return t.doc === "commentary" ? `Commentary Appendix ${t.id}` : `Appendix ${t.id}`;
  }
}

function makeTarget(kind: RefKind, rawId: string, ctx: DocHead | undefined, extra: { sub?: string; case?: string } = {}) {
  const { doc, id, dg } = resolveDoc(kind, rawId, ctx);
  const base = { doc, kind, id, ...(dg !== undefined && { dg }), ...extra };
  return { ...base, key: targetKey(base), label: targetLabel(base) } as RefTarget;
}

/** Split "J10.9" → ["J10.", "9"], "E3-3" → ["E3-", "3"], "J2.2a" → ["J2.2", "a"], "F" → ["", "F"]. */
function splitLast(id: string): [string, string] {
  const m = /^(.*?)(\d+|[a-z]|[A-Z])$/.exec(id);
  return m ? [m[1] ?? "", m[2] ?? ""] : [id, ""];
}

/** Expand a range between two ids sharing everything but the last component. Falls back to the endpoints. */
export function expandRange(from: string, toRaw: string): string[] {
  const [prefix, a] = splitLast(from);
  // Abbreviated end ("J2.2a–b", "C-A-7-1/2") inherits the start's prefix.
  const to = toRaw.length < from.length && !toRaw.includes(prefix) ? prefix + toRaw : toRaw;
  const [prefix2, b] = splitLast(to);
  if (prefix !== prefix2) return [from, to];
  const out: string[] = [];
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const lo = Number(a);
    const hi = Number(b);
    if (hi < lo || hi - lo > MAX_RANGE) return [from, to];
    for (let n = lo; n <= hi; n++) out.push(`${prefix}${n}`);
    return out;
  }
  if (/^[a-zA-Z]$/.test(a) && /^[a-zA-Z]$/.test(b)) {
    const lo = a.charCodeAt(0);
    const hi = b.charCodeAt(0);
    if (hi < lo || hi - lo > MAX_RANGE) return [from, to];
    for (let c = lo; c <= hi; c++) out.push(prefix + String.fromCharCode(c));
    return out;
  }
  return [from, to];
}

/** An abbreviated range end: a bare letter or number, e.g. the "b" in "§J2.2a–b". */
const SHORT_END = /^(?:\d{1,3}[a-z]?|[a-z])(?![A-Za-z0-9])/;

/** Strip template-literal holes and normalize whitespace and dashes. */
function normalize(text: string): string {
  return text
    .replace(/\$\{[^}]*\}/g, "")
    .replace(/[\u00a0\u2009\u202f]/g, " ")
    .replace(/\u2011/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRefs(input: string): ParsedRef {
  const s = normalize(input);
  const targets: RefTarget[] = [];
  const ctx: Ctx = {};
  let i = 0;
  /** True right after a kind head or list separator: the next token must be an id. */
  let expectId = false;
  /** True right after an id: a list separator may continue the same kind. */
  let afterId = false;

  const rest = () => s.slice(i);

  while (i < s.length) {
    if (s[i] === " " && !HARD_SEP.test(rest())) {
      i++;
      continue;
    }
    const r = rest();

    const hard = HARD_SEP.exec(r);
    if (hard) {
      i += hard[0].length;
      ctx.doc = undefined;
      ctx.kind = undefined;
      expectId = afterId = false;
      continue;
    }

    if (afterId && ctx.kind) {
      const list = LIST_SEP.exec(r);
      if (list && ID[ctx.kind].test(r.slice(list[0].length))) {
        i += list[0].length;
        expectId = true;
        afterId = false;
        continue;
      }
    }

    if (expectId && ctx.kind) {
      const kind = ctx.kind;
      const m = ID[kind].exec(r);
      if (m) {
        let id = m[0];
        i += id.length;
        let ids = [id];

        // Range: "E3-1–E3-3", "A-8-3 to A-8-5", "J2.2a–b", "D-H"
        const rr = rest();
        const range = RANGE_SEP.exec(rr) ?? (HYPHEN_RANGE_KINDS.has(kind) ? /^-/.exec(rr) : null);
        if (range) {
          const after = rr.slice(range[0].length);
          const end = ID[kind].exec(after) ?? SHORT_END.exec(after);
          if (end) {
            ids = expandRange(id, end[0]);
            i += range[0].length + end[0].length;
            id = end[0];
          }
        }
        // Slash shorthand: "C-A-7-1/2"
        if (kind === "equation") {
          let slash: RegExpExecArray | null;
          while ((slash = /^\/(\d{1,3}[a-z]?)(?![A-Za-z0-9])/.exec(rest()))) {
            const [prefix] = splitLast(ids[0] ?? id);
            ids.push(prefix + slash[1]);
            i += slash[0].length;
          }
        }

        let sub: string | undefined;
        let kase: string | undefined;
        if (kind === "section") {
          const subM = /^(?:\([a-z0-9]{1,3}\))+/.exec(rest());
          if (subM) {
            sub = subM[0];
            i += sub.length;
          }
        }
        if (kind === "table") {
          const caseM = /^\s*,?\s*Case\s*\(?([0-9]{1,2}|[a-z])\)?(?![A-Za-z0-9])/i.exec(rest());
          if (caseM) {
            kase = caseM[1]!.toLowerCase();
            i += caseM[0].length;
          }
        }

        for (const raw of ids) {
          const t = makeTarget(kind, raw, ctx.doc, {
            ...(sub && ids.length === 1 && { sub }),
            ...(kase && ids.length === 1 && { case: kase }),
          });
          if (!targets.some((x) => x.key === t.key)) targets.push(t);
        }
        expectId = false;
        afterId = true;
        continue;
      }
    }

    let matched = false;
    for (const [re, make] of DOC_HEADS) {
      const m = re.exec(r);
      if (m) {
        ctx.doc = make(m);
        ctx.kind = undefined;
        i += m[0].length;
        expectId = afterId = false;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    for (const [re, kind] of KIND_HEADS) {
      const m = re.exec(r);
      if (m) {
        ctx.kind = kind;
        i += m[0].length;
        expectId = true;
        afterId = false;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Unrecognized word: skip it and forget the kind (doc context lasts until a hard separator).
    const word = /^\S+/.exec(r);
    i += word ? word[0].length : 1;
    ctx.kind = undefined;
    expectId = afterId = false;
  }

  return { text: input, targets };
}

/** Parent targets to fall back to when an exact target is missing: G2.1(a) → G2.1 → G2; B4.1b#10 → B4.1b. */
export function fallbacks(t: RefTarget): RefTarget[] {
  const out: RefTarget[] = [];
  const push = (p: Omit<RefTarget, "key" | "label">) => {
    const full = { ...p, key: targetKey(p), label: targetLabel(p) } as RefTarget;
    if (full.key !== t.key && !out.some((o) => o.key === full.key)) out.push(full);
  };
  const base = { doc: t.doc, kind: t.kind, id: t.id, dg: t.dg, sub: t.sub, case: t.case };
  if (t.case) push({ ...base, case: undefined });
  if (t.kind === "section") {
    if (t.sub) {
      // "(b)(2)" → "(b)" → none
      const subs = t.sub.match(/\([^)]+\)/g) ?? [];
      for (let n = subs.length - 1; n >= 1; n--) push({ ...base, sub: subs.slice(0, n).join("") });
      push({ ...base, sub: undefined });
    }
    let id = t.id;
    for (;;) {
      const next = id.replace(/[a-z]$/, "") !== id ? id.replace(/[a-z]$/, "") : id.replace(/\.\d+$/, "");
      if (next === id) break;
      id = next;
      push({ ...base, id, sub: undefined });
    }
  }
  return out;
}
