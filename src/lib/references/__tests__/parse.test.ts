import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractRefStrings } from "../collect";
import { expandRange, fallbacks, parseRefs, targetKey } from "../parse";

const keys = (s: string) => parseRefs(s).targets.map((t) => t.key);
const labels = (s: string) => parseRefs(s).targets.map((t) => t.label);

describe("parseRefs — single targets", () => {
  it.each([
    ["Eq. G6-1", ["spec:equation:G6-1"]],
    ["Eq. F2-4", ["spec:equation:F2-4"]],
    ["Eq. H1-1a", ["spec:equation:H1-1a"]],
    ["Eq. J10-5b", ["spec:equation:J10-5b"]],
    ["Eq. A-8-3", ["spec:equation:A-8-3"]],
    ["Eq. A-6-12 (rearranged)", ["spec:equation:A-6-12"]],
    ["Eq. C-A-7-2", ["commentary:equation:C-A-7-2"]],
    ["Eq. C-F9-3", ["commentary:equation:C-F9-3"]],
    ["Commentary Eq. C-I3-4", ["commentary:equation:C-I3-4"]],
    ["DG1 Eq. 4-62", ["dg1:equation:4-62"]],
    ["§F2.2", ["spec:section:F2.2"]],
    ["§G2.1(a)", ["spec:section:G2.1(a)"]],
    ["§G2.1(b)(2)", ["spec:section:G2.1(b)(2)"]],
    ["§I3.2a(a)", ["spec:section:I3.2a(a)"]],
    ["§I3.2c(1)", ["spec:section:I3.2c(1)"]],
    ["§B4.1b(d)", ["spec:section:B4.1b(d)"]],
    ["§J3.11a Bearing and tearout at one bolt hole", ["spec:section:J3.11a"]],
    ["§E7 user note", ["spec:section:E7"]],
    ["§C-F9", ["commentary:section:F9"]],
    ["Commentary §I3.2a", ["commentary:section:I3.2a"]],
    ["§6.3.1 / Eq. A-6-7", ["spec:section:6.3.1", "spec:equation:A-6-7"]],
    ["§A-4.2.4d(a) · tension", ["spec:section:4.2.4d(a)"]],
    ["§A-3.1", ["spec:section:3.1"]],
    ["Table J3.2", ["spec:table:J3.2"]],
    ["Table K1.1A", ["spec:table:K1.1A"]],
    ["Table A-3.1", ["spec:table:A-3.1"]],
    ["Table B4.1b, Case 10", ["spec:table:B4.1b#10"]],
    ["Table D3.1, Case 7", ["spec:table:D3.1#7"]],
    ["Commentary Table C-A-7.1", ["commentary:table:C-A-7.1"]],
    ["Commentary Table C-A-7.1, Case (b)", ["commentary:table:C-A-7.1#b"]],
    ["Table C-F10.1", ["commentary:table:C-F10.1"]],
    ["Manual Table 3-23", ["manual:table:3-23"]],
    ["Table 3-23", ["manual:table:3-23"]],
    ["Manual Table 4-1a format", ["manual:table:4-1a"]],
    ["Manual Table 3-2 format", ["manual:table:3-2"]],
    ["DG1 Fig. 4-8", ["dg1:figure:4-8"]],
    ["Fig. C-A-7.1", ["commentary:figure:C-A-7.1"]],
    ["Part 12", ["manual:part:12"]],
    ["Manual Part 8 · instantaneous center / elastic vector method", ["manual:part:8"]],
    ["Chapter F", ["spec:chapter:F"]],
    ["AISC 360-22 Chapter G", ["spec:chapter:G"]],
    ["ANSI/AISC 360-22 · Chapter E", ["spec:chapter:E"]],
    ["ANSI/AISC 360-22 §B3", ["spec:section:B3"]],
    ["Chapter H equation", ["spec:chapter:H"]],
    ["Appendix 8", ["spec:appendix:8"]],
    ["Appendix 8 nonsway moments", ["spec:appendix:8"]],
    ["ASCE 7-22 §2.3.1", ["asce7:section:2.3.1"]],
    ["DG1 §4.3.7 · uniform bearing block", ["dg1:section:4.3.7"]],
    ["DG9 §2 / Shapes Database v16.0", ["dg9:section:2"]],
  ])("%s", (input, expected) => {
    expect(keys(input)).toEqual(expected);
  });
});

describe("parseRefs — lists, ranges, multi-refs", () => {
  it.each([
    ["Eqs. H1-1a, H1-1b", ["spec:equation:H1-1a", "spec:equation:H1-1b"]],
    ["Eqs. E3-1–E3-3", ["spec:equation:E3-1", "spec:equation:E3-2", "spec:equation:E3-3"]],
    ["Eqs. A-8-3 to A-8-5", ["spec:equation:A-8-3", "spec:equation:A-8-4", "spec:equation:A-8-5"]],
    ["Commentary Eqs. C-A-7-1/2", ["commentary:equation:C-A-7-1", "commentary:equation:C-A-7-2"]],
    ["DG1 Eqs. 4-60–4-62", ["dg1:equation:4-60", "dg1:equation:4-61", "dg1:equation:4-62"]],
    ["DG1 Eqs. 4-51, 4-52", ["dg1:equation:4-51", "dg1:equation:4-52"]],
    ["§§E3–E6", ["spec:section:E3", "spec:section:E4", "spec:section:E5", "spec:section:E6"]],
    ["§§E3–E6 Column buckling", ["spec:section:E3", "spec:section:E4", "spec:section:E5", "spec:section:E6"]],
    ["§§H1–H2", ["spec:section:H1", "spec:section:H2"]],
    ["§§B4.3, D2–D3", ["spec:section:B4.3", "spec:section:D2", "spec:section:D3"]],
    ["§E2–E4", ["spec:section:E2", "spec:section:E3", "spec:section:E4"]],
    ["§J3.3–J3.5", ["spec:section:J3.3", "spec:section:J3.4", "spec:section:J3.5"]],
    ["§J2.2a–b", ["spec:section:J2.2a", "spec:section:J2.2b"]],
    ["§J8; Eqs. J8-1, J8-2", ["spec:section:J8", "spec:equation:J8-1", "spec:equation:J8-2"]],
    ["§J3.7; Table J3.2", ["spec:section:J3.7", "spec:table:J3.2"]],
    ["§E3 · Eqs. E3-2, E3-3", ["spec:section:E3", "spec:equation:E3-2", "spec:equation:E3-3"]],
    ["§F1 · Eq. F1-1", ["spec:section:F1", "spec:equation:F1-1"]],
    ["§B3 · Ch. C · Ch. H", ["spec:section:B3", "spec:chapter:C", "spec:chapter:H"]],
    ["§C2.3 / Appendix 8", ["spec:section:C2.3", "spec:appendix:8"]],
    ["Appendix 8 · §C2.3", ["spec:appendix:8", "spec:section:C2.3"]],
    ["§H3 · AISC Design Guide 9", ["spec:section:H3"]],
    ["Manual Tables 2-4, 2-5", ["manual:table:2-4", "manual:table:2-5"]],
    ["Tables 1-11 to 1-13", ["manual:table:1-11", "manual:table:1-12", "manual:table:1-13"]],
    ["Manual Table 3-23 · §L3", ["manual:table:3-23", "spec:section:L3"]],
    ["Manual Table 3-10 format · Chapter F", ["manual:table:3-10", "spec:chapter:F"]],
    ["Eq. I8-1 · Manual Table 3-21", ["spec:equation:I8-1", "manual:table:3-21"]],
    ["Chapters D–H", ["D", "E", "F", "G", "H"].map((c) => `spec:chapter:${c}`)],
    ["Ch. D–H", ["D", "E", "F", "G", "H"].map((c) => `spec:chapter:${c}`)],
    ["App. 6–8", ["spec:appendix:6", "spec:appendix:7", "spec:appendix:8"]],
    ["Parts 7–8 · §J2, J3", ["manual:part:7", "manual:part:8", "spec:section:J2", "spec:section:J3"]],
    ["Parts 9–10", ["manual:part:9", "manual:part:10"]],
    ["Part 3 · Ch. F, G", ["manual:part:3", "spec:chapter:F", "spec:chapter:G"]],
    ["Part 14 · DG 1", ["manual:part:14"]],
    ["Part 2 · ASCE 7-22", ["manual:part:2"]],
    ["Manual Part 3 · AISC 360-22 Chapters F & G", ["manual:part:3", "spec:chapter:F", "spec:chapter:G"]],
    ["Manual Parts 5–6 · ANSI/AISC 360-22", ["manual:part:5", "manual:part:6"]],
    ["§J10.1–J10.9", Array.from({ length: 9 }, (_, n) => `spec:section:J10.${n + 1}`)],
    ["§J10.8; §E3; §J4.4", ["spec:section:J10.8", "spec:section:E3", "spec:section:J4.4"]],
    ["§J3.3–J3.5; Manual Part 10", ["spec:section:J3.3", "spec:section:J3.4", "spec:section:J3.5", "manual:part:10"]],
    ["§H1.3 requires Lcz ≤ Lcy and Mry/Mcy < 0.05; use §H1.1", ["spec:section:H1.3", "spec:section:H1.1"]],
    ["§F8 applies only for D/t < 0.45E/Fy; is outside that range.", ["spec:section:F8"]],
  ])("%s", (input, expected) => {
    expect(keys(input)).toEqual(expected);
  });
});

describe("parseRefs — graceful failures", () => {
  it.each(["AISC Shapes Database v16.0", "sc", "", "ANSI/AISC 360-22", "Eq. ", "Eq. A-6-", "LTB", "W18X50"])(
    "%j yields no targets",
    (input) => {
      expect(parseRefs(input).targets).toEqual([]);
    },
  );

  it("strips template holes", () => {
    expect(keys("Table B4.1b, Case ${caseNo}")).toEqual(["spec:table:B4.1b"]);
    expect(keys("Commentary Table C-A-7.1, Case (${c.id})")).toEqual(["commentary:table:C-A-7.1"]);
  });

  it("keeps the original text", () => {
    expect(parseRefs("Eq. G6-1").text).toBe("Eq. G6-1");
  });
});

describe("labels", () => {
  it("formats every kind", () => {
    expect(labels("Eq. G6-1")).toEqual(["Eq. G6-1"]);
    expect(labels("§G2.1(a)")).toEqual(["§G2.1(a)"]);
    expect(labels("Table B4.1b, Case 10")).toEqual(["Table B4.1b, Case 10"]);
    expect(labels("Commentary Table C-A-7.1, Case (b)")).toEqual(["Table C-A-7.1, Case (b)"]);
    expect(labels("Table 3-23")).toEqual(["Manual Table 3-23"]);
    expect(labels("DG1 Eq. 4-62")).toEqual(["DG1 Eq. 4-62"]);
    expect(labels("§C-F9")).toEqual(["Commentary §F9"]);
    expect(labels("Part 3")).toEqual(["Manual Part 3"]);
    expect(labels("ASCE 7-22 §2.3.1")).toEqual(["ASCE 7-22 §2.3.1"]);
    expect(labels("App. 6")).toEqual(["Appendix 6"]);
  });
});

describe("expandRange", () => {
  it("expands numeric and letter tails", () => {
    expect(expandRange("E3-1", "E3-3")).toEqual(["E3-1", "E3-2", "E3-3"]);
    expect(expandRange("J2.2a", "b")).toEqual(["J2.2a", "J2.2b"]);
    expect(expandRange("D", "F")).toEqual(["D", "E", "F"]);
  });
  it("falls back to endpoints when prefixes differ or the range is absurd", () => {
    expect(expandRange("E3", "F2")).toEqual(["E3", "F2"]);
    expect(expandRange("1", "99")).toEqual(["1", "99"]);
    expect(expandRange("E5", "E3")).toEqual(["E5", "E3"]);
  });
});

describe("fallbacks", () => {
  it("walks up sections, list items and cases", () => {
    const [t] = parseRefs("§I3.2a(b)(2)").targets;
    expect(fallbacks(t!).map((f) => f.key)).toEqual([
      "spec:section:I3.2a(b)",
      "spec:section:I3.2a",
      "spec:section:I3.2",
      "spec:section:I3",
    ]);
    const [c] = parseRefs("Table B4.1b, Case 10").targets;
    expect(fallbacks(c!).map((f) => f.key)).toEqual(["spec:table:B4.1b"]);
    expect(targetKey(c!)).toBe("spec:table:B4.1b#10");
  });
});

describe("every citation string in the codebase", () => {
  const root = join(__dirname, "../../..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "__tests__" || p.includes(join("lib", "references")) || p.includes(join("features", "references")))
          continue;
        walk(p);
      } else if (/\.tsx?$/.test(name)) files.push(p);
    }
  };
  walk(root);
  const strings = [...new Set(files.flatMap((f) => extractRefStrings(readFileSync(f, "utf8"))))].sort();

  it("finds a substantial set of citations", () => {
    expect(strings.length).toBeGreaterThan(100);
  });

  /** Strings that legitimately carry no locator (template stubs, publication names). */
  const NO_LOCATOR = /^(Eqs?\.\s*$|Eq\.\s+[A-N]-\d+-$|ANSI\/AISC 360-22$|AISC 360-22$|ASCE 7-22$|Table\s*$|Chapter H equation$)/;

  it.each(strings.map((s) => [s]))("%s", (s) => {
    const parsed = parseRefs(s);
    const strongHead = /^(Eqs?\. [A-Z0-9]|§|Tables? [A-Z0-9]|TABLE |Manual (Table|Part)|Commentary (Eq|Table|§)|Appendix \d|App\. \d|Chapters? [A-N]\b|Ch\. [A-N]\b|Parts? \d|DG ?\d+ (Eq|Fig|§))/;
    if (strongHead.test(s) && !NO_LOCATOR.test(s)) {
      expect(parsed.targets.length).toBeGreaterThan(0);
    }
    for (const t of parsed.targets) {
      expect(t.key).toBe(targetKey(t));
      expect(t.label.length).toBeGreaterThan(0);
    }
  });
});
