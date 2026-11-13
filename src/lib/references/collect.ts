/**
 * Finds citation-looking string literals in source text. Dependency-free so the Node script
 * (scripts/collect-spec-refs.ts) and the parser tests can share it.
 */
const LITERAL =
  /(["'`])((?:Eqs?\.|§|Manual |Tables? |TABLE |Commentary |App\.|Appendix |Chapters? |Chs?\. |Parts? |DG ?\d|AISC 360|ANSI\/AISC|ASCE 7|Figs?\. |Figure )(?:(?!\1)[^\n\\]){0,100})\1/g;

/** Unique citation strings in one source file. Template holes (`${...}`) are removed. */
export function extractRefStrings(source: string): string[] {
  const out = new Set<string>();
  for (const m of source.matchAll(LITERAL)) {
    const s = (m[2] ?? "").replace(/\$\{[^}]*\}/g, "").trim();
    if (s) out.add(s);
  }
  return [...out];
}
