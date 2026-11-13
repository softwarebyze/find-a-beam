import { describe, expect, it } from "vitest";
import { findShape, SHAPES, type Shape } from "@/data/shapes";
import {
  availableProps,
  bestWorst,
  categoryOf,
  commonScale,
  efficiency,
  EFFICIENCY,
  emphasized,
  fmtExact,
  matchesFilters,
  matchesType,
  neighbours,
  nextSort,
  noteText,
  parseCompareSlugs,
  parseExplorerState,
  parseExplorerType,
  PRESETS,
  queryShapes,
  searchTerms,
  seriesKey,
  seriesOf,
  serializeExplorerState,
  sortShapes,
  toCSV,
  toQueryString,
  type ExplorerState,
} from "../logic";

const s = (label: string): Shape => {
  const r = findShape(label);
  if (!r) throw new Error(`missing ${label}`);
  return r;
};
const labels = (xs: readonly Shape[]) => xs.map((x) => x.label);

describe("type categories", () => {
  it("splits HSS into rect / square / round and covers every shape", () => {
    const counts = { HSSR: 0, HSSQ: 0, HSSO: 0 };
    for (const x of SHAPES) {
      const c = categoryOf(x);
      if (c === "HSSR" || c === "HSSQ" || c === "HSSO") counts[c]++;
    }
    expect(counts.HSSR + counts.HSSQ + counts.HSSO).toBe(SHAPES.filter((x) => x.type === "HSS").length);
    expect(categoryOf(s("HSS6X6X1/2"))).toBe("HSSQ");
    expect(categoryOf(s("HSS8X4X1/2"))).toBe("HSSR");
    expect(categoryOf(s("HSS6.625X0.280"))).toBe("HSSO");
    expect(matchesType(s("HSS6X6X1/2"), "HSS")).toBe(true);
    expect(matchesType(s("W18X50"), "ALL")).toBe(true);
    expect(matchesType(s("WT9X25"), "W")).toBe(false);
  });

  it("parses deep-link types case-insensitively with aliases", () => {
    expect(parseExplorerType("W")).toBe("W");
    expect(parseExplorerType("hssr")).toBe("HSSR");
    expect(parseExplorerType("hss-round")).toBe("HSSO");
    expect(parseExplorerType("2l")).toBe("2L");
    expect(parseExplorerType(null)).toBe("ALL");
    expect(parseExplorerType("nonsense")).toBe("ALL");
  });

  it("presets only reference properties that exist for that type", () => {
    for (const [type, cols] of Object.entries(PRESETS)) {
      const pool = SHAPES.filter((x) => matchesType(x, type as ExplorerState["type"]));
      const keys = new Set(availableProps(pool).map((p) => p.key));
      for (const c of cols) expect(keys.has(c), `${type}: ${c}`).toBe(true);
    }
  });
});

describe("search", () => {
  const run = (q: string, type: ExplorerState["type"] = "ALL") =>
    queryShapes(SHAPES, { type, q, filters: [], sort: { key: "label", dir: "asc" } });

  it("accepts lower case, × and spaces", () => {
    expect(searchTerms(" w18 × 50 ")).toEqual(["W18X50"]);
    expect(labels(run("W18×50"))).toEqual(["W18X50"]);
    const w18 = run("w18x");
    expect(w18.length).toBeGreaterThan(10);
    expect(w18.every((x) => x.label.startsWith("W18X"))).toBe(true);
  });

  it("matches HSS prefixes without catching wider walls", () => {
    const r = run("HSS6X6");
    expect(r.length).toBeGreaterThan(3);
    expect(r.every((x) => x.label.startsWith("HSS6X6X"))).toBe(true);
  });

  it("ORs comma-separated terms and matches metric designations", () => {
    const r = run("W18X50, W21X44");
    expect(labels(r)).toEqual(["W21X44", "W18X50"]);
    expect(labels(run("W460X74"))).toContain("W18X50");
  });
});

describe("filters and sort", () => {
  it("range filters require the property and respect bounds with rounding tolerance", () => {
    const w = s("W18X50");
    expect(matchesFilters(w, [{ key: "Zx", min: 101, max: 101 }])).toBe(true);
    expect(matchesFilters(w, [{ key: "Zx", min: 102 }])).toBe(false);
    expect(matchesFilters(w, [{ key: "OD", min: 0 }])).toBe(false);
    expect(matchesFilters(w, [{ key: "OD" }])).toBe(true);
  });

  it("sorts with missing values last and Manual order as tiebreak", () => {
    const pool = [s("HSS6.625X0.280"), s("W18X50"), s("W12X50"), s("W8X10")];
    expect(labels(sortShapes(pool, { key: "bf", dir: "desc" })).at(-1)).toBe("HSS6.625X0.280");
    const byW = labels(sortShapes(pool, { key: "W", dir: "asc" }));
    expect(byW[0]).toBe("W8X10");
    expect(byW.indexOf("W18X50")).toBeLessThan(byW.indexOf("W12X50"));
    expect(labels(sortShapes(pool, { key: "label", dir: "asc" }))[0]).toBe("W18X50");
  });

  it("header clicks cycle first direction -> reverse -> Manual order", () => {
    expect(nextSort({ key: "label", dir: "asc" }, "Zx")).toEqual({ key: "Zx", dir: "desc" });
    expect(nextSort({ key: "Zx", dir: "desc" }, "Zx")).toEqual({ key: "Zx", dir: "asc" });
    expect(nextSort({ key: "Zx", dir: "asc" }, "Zx")).toEqual({ key: "label", dir: "asc" });
    expect(nextSort({ key: "label", dir: "asc" }, "W")).toEqual({ key: "W", dir: "asc" });
  });
});

describe("series", () => {
  it("keys shapes by nominal depth / size", () => {
    expect(seriesKey(s("W18X50"))).toBe("W18");
    expect(seriesKey(s("HSS6X6X1/2"))).toBe("HSS6X6");
    expect(seriesKey(s("HSS6.625X0.280"))).toBe("HSS6.625");
    expect(seriesKey(s("L4X4X1/2"))).toBe("L4X4");
    expect(seriesKey(s("Pipe12XS"))).toBe("Pipe12");
    expect(seriesKey(s("2L4X3X1/2X3/8LLBB"))).toBe("2L4X3X3/8LLBB");
  });

  it("finds lighter / heavier neighbours in the W18 series", () => {
    const n = neighbours(s("W18X50"));
    expect(n.lighter?.label).toBe("W18X46");
    expect(n.heavier?.label).toBe("W18X55");
    const series = seriesOf(s("W18X50"));
    expect(series[0]!.label).toBe("W18X35");
    expect(series.every((x) => x.label.startsWith("W18X"))).toBe(true);
    expect(neighbours(series[0]!).lighter).toBeUndefined();
  });
});

describe("Manual emphasis", () => {
  it("bolds the lightest shape of each series when sorted by weight", () => {
    const pool = SHAPES.filter((x) => x.label.startsWith("W18X") || x.label.startsWith("W21X"));
    const e = emphasized(pool, { key: "W", dir: "asc" });
    expect(labels([...e]).sort()).toEqual(["W18X35", "W21X44"]);
  });

  it("bolds Table 3-2 style economical shapes when sorted by Zx", () => {
    const pool = SHAPES.filter((x) => x.type === "W");
    const e = emphasized(pool, { key: "Zx", dir: "desc" });
    expect(e.has(s("W21X48"))).toBe(true);
    expect(e.has(s("W18X50"))).toBe(false);
    expect(e.has(s("W12X50"))).toBe(false);
  });

  it("is empty for non-capacity sorts", () => {
    expect(emphasized(SHAPES, { key: "d", dir: "asc" }).size).toBe(0);
  });
});

describe("URL state", () => {
  it("round-trips the full explorer state", () => {
    const st: ExplorerState = {
      type: "W",
      q: "w18",
      filters: [
        { key: "Zx", min: 50, max: 120 },
        { key: "d", max: 18.5 },
      ],
      sort: { key: "Zx", dir: "desc" },
      cols: ["W", "Zx", "Ix"],
      cmp: ["W18X50", "HSS6X6X1_2"],
    };
    const qs = toQueryString(serializeExplorerState(st));
    expect(qs).toContain("f=Zx:50:120");
    expect(qs).toContain("cmp=W18X50,HSS6X6X1_2");
    expect(parseExplorerState(new URLSearchParams(qs))).toEqual(st);
  });

  it("omits defaults and drops unknown keys", () => {
    expect(serializeExplorerState(parseExplorerState(new URLSearchParams(""))).toString()).toBe("");
    const st = parseExplorerState(new URLSearchParams("type=W&cols=W,bogus,Zx&sort=-bogus&f=nope:1:2&cmp=NOPE,W18X50"));
    expect(st.cols).toEqual(["W", "Zx"]);
    expect(st.sort).toEqual({ key: "label", dir: "asc" });
    expect(st.filters).toEqual([]);
    expect(st.cmp).toEqual(["W18X50"]);
    expect(serializeExplorerState({ ...st, cols: PRESETS.W }).has("cols")).toBe(false);
  });

  it("parses compare slugs, labels with ×, dedupes and caps at four", () => {
    const r = parseCompareSlugs("W18X50,w18×50,HSS6X6X1_2,W21X44,W12X26,W8X10", findShape);
    expect(labels(r)).toEqual(["W18X50", "HSS6X6X1/2", "W21X44", "W12X26"]);
  });
});

describe("formatting, CSV and compare helpers", () => {
  it("prints US values as tabulated and converts SI", () => {
    expect(fmtExact(800, "inertia", "US")).toBe("800");
    expect(fmtExact(14.7, "area", "US")).toBe("14.7");
    expect(fmtExact(1, "length", "SI")).toBe("25.4");
    expect(fmtExact(undefined, "length", "US")).toBe("—");
  });

  it("exports the current view in display units", () => {
    const csv = toCSV([s("W18X50")], ["W", "d", "Ix"], "SI")
      .trim()
      .split("\n");
    expect(csv[0]).toBe("Shape,W (kg/m),d (mm),Ix (10⁶ mm⁴)");
    expect(csv[1]!.startsWith("W18X50,74.4")).toBe(true);
    expect(toCSV([s("HSS6X6X1/2")], ["W"], "US").split("\n")[1]).toBe("HSS6X6X1/2,35.24");
  });

  it("finds best and worst values", () => {
    expect(bestWorst([3, 1, 2], "higher")).toEqual({ best: 0, worst: 1 });
    expect(bestWorst([3, undefined, 2], "lower")).toEqual({ best: 2, worst: 0 });
    expect(bestWorst([2, 2], "higher")).toEqual({});
    expect(bestWorst([2, 1], undefined)).toEqual({});
  });

  it("computes efficiency in display units", () => {
    const zw = EFFICIENCY.find((m) => m.id === "Zx/W")!;
    expect(efficiency(s("W18X50"), zw, "US")).toBeCloseTo(101 / 50, 6);
    expect(efficiency(s("W18X50"), zw, "SI")).toBeCloseTo((101 * 25.4 ** 3) / 1e3 / (50 * 1.48816394), 6);
    expect(
      efficiency(
        s("W18X50"),
        EFFICIENCY.find((m) => m.id === "ry/rx")!,
        "SI",
      ),
    ).toBeCloseTo(1.65 / 7.38, 6);
  });

  it("chooses a common scale bounded by the largest shape", () => {
    const k = commonScale([s("W18X50"), s("W8X10")], 200, 200);
    expect(k).toBeCloseTo(200 / (s("W18X50").d as number), 6);
  });

  it("explains the database note flag", () => {
    expect(noteText(s("W44X408"))).toMatch(/2 in/);
    expect(noteText(s("M5X18.9"))).toMatch(/flanges/);
    expect(noteText(s("W18X50"))).toBeUndefined();
  });
});
