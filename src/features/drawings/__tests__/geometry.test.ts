import { SHAPES, doubleAngleInfo, familyOf, findShape, num, req, type Shape } from "@/data/shapes";
import { contoursBounds, sectionArea, sectionGeometry, sectionPath, singleAngleLabel } from "../geometry";

/** Expected outline width × height from the tabulated dimensions. */
function expectedBox(s: Shape): [number, number] {
  switch (familyOf(s)) {
    case "i-shape": case "channel": case "tee": return [req(s, "bf"), req(s, "d")];
    case "angle": return [req(s, "d"), req(s, "b")];
    case "double-angle": return [2 * req(s, "b") + (doubleAngleInfo(s)?.spacing ?? 0), req(s, "d")];
    case "hss-rect": return [req(s, "B"), req(s, "Ht")];
    case "hss-round": case "pipe": return [req(s, "OD"), req(s, "OD")];
  }
}

describe("cross-section geometry — every shape in the database", () => {
  it.each(SHAPES.map((s) => [s.label, s] as const))("%s: finite path, bounding box", (_, s) => {
    const g = sectionGeometry(s);
    const nums = sectionPath(g).match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? [];
    expect(nums.length).toBeGreaterThan(4);
    expect(nums.every((n) => Number.isFinite(Number(n)))).toBe(true);
    expect(sectionPath(g)).not.toMatch(/NaN|Infinity/);

    const [w, h] = expectedBox(s);
    const bb = contoursBounds(g.contours);
    expect(bb.x0).toBeCloseTo(0, 6);
    expect(bb.y0).toBeCloseTo(0, 6);
    expect(g.width).toBeCloseTo(w, 3);
    expect(g.height).toBeCloseTo(h, 3);

    for (const d of g.dims) {
      expect(Number.isFinite(d.value) && d.value > 0).toBe(true);
      for (const p of [d.a, d.b]) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    for (const v of [g.centroid.x, g.centroid.y, g.extent.x0, g.extent.x1, g.extent.y0, g.extent.y1]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("drawn area matches tabulated A (validates flange slope and fillet modelling)", () => {
  const areaError = (s: Shape) => Math.abs(sectionArea(sectionGeometry(s)) - req(s, "A")) / req(s, "A");
  const strict = SHAPES.filter((s) => s.type === "W" || s.type === "C" || s.type === "L" || s.type === "HSS");
  it.each(strict.map((s) => [s.label, s] as const))("%s within 3% of A", (_, s) => {
    expect(areaError(s)).toBeLessThan(0.03);
  });

  // Light M/MT shapes tabulate a rounded-up kdes, so kdes − tf overstates their fillets slightly.
  // Pipe is drawn with the tabulated (nominal) ID while A uses tdes, so it is not area-checked.
  const others = SHAPES.filter((s) => !strict.includes(s) && s.type !== "PIPE");
  it.each(others.map((s) => [s.label, s] as const))("%s within 5% of A", (_, s) => {
    expect(areaError(s)).toBeLessThan(0.05);
  });
});

describe("family details", () => {
  it("2L uses the fillet of its single angle", () => {
    expect(singleAngleLabel("2L8X4X1X3/4LLBB")).toBe("L8X4X1");
    expect(singleAngleLabel("2L4X4X1/2X3/8")).toBe("L4X4X1/2");
    expect(singleAngleLabel("2L8X4X1SLBB")).toBe("L8X4X1");
    for (const s of SHAPES.filter((x) => x.type === "2L")) expect(findShape(singleAngleLabel(s.label))?.type).toBe("L");
  });

  it("LLBB stands the long legs back to back; SLBB the short legs", () => {
    const ll = sectionGeometry(findShape("2L8X4X1X3/4LLBB")!);
    const sl = sectionGeometry(findShape("2L8X4X1X3/4SLBB")!);
    expect([ll.width, ll.height]).toEqual([8.75, 8]);
    expect([sl.width, sl.height]).toEqual([16.75, 4]);
  });

  it("channel shear center is outside the web, centroid inside", () => {
    const s = findShape("C15X50")!;
    const g = sectionGeometry(s);
    expect(g.markers.find((m) => m.kind === "sc")?.at.x).toBeCloseTo(-req(s, "eo"));
    expect(g.centroid.x).toBeCloseTo(req(s, "x"));
    expect(g.extent.x0).toBeCloseTo(-req(s, "eo"));
  });

  it("angle centroid measured from the heel; minor principal axis tilts by α", () => {
    const s = findShape("L8X4X1")!;
    const g = sectionGeometry(s);
    expect(g.centroid.x).toBeCloseTo(req(s, "x"));
    expect(g.height - g.centroid.y).toBeCloseTo(req(s, "y"));
    const z = g.axes.find((a) => a.id === "z")!;
    expect(Math.abs(z.dir.x / z.dir.y)).toBeCloseTo(num(s, "tan(α)")!);
  });

  it("tee centroid ȳ is measured from the flange face", () => {
    const s = findShape("WT22X204")!;
    expect(sectionGeometry(s).centroid.y).toBeCloseTo(req(s, "y"));
  });
});
