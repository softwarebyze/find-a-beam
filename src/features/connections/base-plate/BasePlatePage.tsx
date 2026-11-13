import { useState } from "react";
import { useSettings } from "@/app/settings";
import {
  basePlate,
  sizeBasePlate,
  type AnchorGrade,
  type BasePlateInput,
  type BasePlateResult,
} from "@/aisc/connections/base-plate";
import { ShapePicker } from "@/components/ShapePicker";
import { Button, Card, PageHeader, Select, SpecRef, Stat } from "@/components/ui";
import { familyOf, findShape, req, slugOf, type Shape } from "@/data/shapes";
import { fmtQ } from "@/lib/units";
import {
  CheckResults,
  ConnectionHero,
  ErrorCard,
  RequiredThickness,
  useConnectionFields,
} from "../concentrated/ConnectionWorkbench";
function PlateDrawing({
  input: i,
  result: r,
  depth,
  width,
  shape,
}: {
  input: BasePlateInput;
  result: BasePlateResult;
  depth: number;
  width: number;
  shape: Shape;
}) {
  const { units } = useSettings(),
    sc = 220 / Math.max(i.N, i.B),
    x = 55,
    y = 35,
    w = i.B * sc,
    h = i.N * sc;
  const family = familyOf(shape),
    cx = x + ((i.B - width) * sc) / 2,
    cy = y + ((i.N - depth) * sc) / 2,
    tf = family === "i-shape" ? req(shape, "tf") : req(shape, "tdes"),
    tw = family === "i-shape" ? req(shape, "tw") : tf;
  const anchors = Array.from({ length: i.anchorCount }, (_, n) => ({
    x: x + (i.anchorEdge + (Math.floor(n / 2) * (i.B - 2 * i.anchorEdge)) / (i.anchorCount / 2 - 1)) * sc,
    y: y + (n % 2 ? i.N - i.anchorEdge : i.anchorEdge) * sc,
  }));
  return (
    <svg
      viewBox="0 0 430 370"
      role="img"
      aria-label="Base plate plan and uniform bearing pressure block"
      className="w-full max-h-96 text-ink"
    >
      <rect x={x} y={y} width={w} height={h} fill="var(--surface-2)" stroke="var(--steel)" />
      <g fill="var(--steel-fill)" stroke="var(--steel)">
        {family === "i-shape" ? (
          <>
            <rect x={cx} y={cy} width={width * sc} height={tf * sc} />
            <rect x={cx} y={cy + (depth - tf) * sc} width={width * sc} height={tf * sc} />
            <rect x={cx + ((width - tw) * sc) / 2} y={cy + tf * sc} width={tw * sc} height={(depth - 2 * tf) * sc} />
          </>
        ) : family === "hss-round" ? (
          <>
            <ellipse
              cx={cx + (width * sc) / 2}
              cy={cy + (depth * sc) / 2}
              rx={(width * sc) / 2}
              ry={(depth * sc) / 2}
            />
            <ellipse
              cx={cx + (width * sc) / 2}
              cy={cy + (depth * sc) / 2}
              rx={(width / 2 - tf) * sc}
              ry={(depth / 2 - tf) * sc}
              fill="var(--surface-2)"
            />
          </>
        ) : (
          <>
            <rect x={cx} y={cy} width={width * sc} height={depth * sc} />
            <rect
              x={cx + tf * sc}
              y={cy + tf * sc}
              width={(width - 2 * tf) * sc}
              height={(depth - 2 * tf) * sc}
              fill="var(--surface-2)"
            />
          </>
        )}
      </g>
      {anchors.map((a, n) => (
        <circle
          key={n}
          cx={a.x}
          cy={a.y}
          r={Math.max(3, (i.anchorDiameter * sc) / 2)}
          fill="var(--surface)"
          stroke="var(--accent)"
        />
      ))}
      <text x={x + w / 2} y={y - 12} textAnchor="middle" fill="currentColor" fontSize="12">
        B = {fmtQ(i.B, "length", units)}
      </text>
      <text x={x + w + 12} y={y + h / 2} fill="currentColor" fontSize="12">
        N = {fmtQ(i.N, "length", units)}
      </text>
      <text x={x + 3} y={y + h + 20} fill="var(--muted)" fontSize="11">
        m = {fmtQ(r.m, "length", units)} · n = {fmtQ(r.n, "length", units)}
      </text>
      <path
        d={`M55 330H275V290H${275 - Math.min(i.N, r.Y) * sc}V330`}
        fill="var(--accent-soft)"
        stroke="var(--accent)"
      />
      <text x="55" y="280" fill="currentColor" fontSize="11">
        Uniform bearing · fp = {fmtQ(r.fp, "stress", units)}
      </text>
      <text x="55" y="350" fill="var(--muted)" fontSize="11">
        Y = {fmtQ(r.Y, "length", units)} · compression edge at right
      </text>
    </svg>
  );
}
export function BasePlatePage() {
  const { q, field } = useConnectionFields(),
    { method, units } = useSettings(),
    [sizeMessage, setSizeMessage] = useState("");
  const requested = findShape(q.str("shape", "W14X90"));
  const shape =
      requested && ["i-shape", "hss-rect", "hss-round"].includes(familyOf(requested))
        ? requested
        : findShape("W14X90")!,
    family = familyOf(shape);
  const input: BasePlateInput = {
    P: q.numOr("P", 400),
    M: q.numOr("M", 0),
    V: q.numOr("V", 0),
    N: q.numOr("N", 24),
    B: q.numOr("B", 24),
    thickness: q.numOr("t", 1.5),
    fc: q.numOr("fc", 4),
    Fy: q.numOr("Fy", 36),
    pedestalN: q.numOr("pedN", 36),
    pedestalB: q.numOr("pedB", 36),
    anchorDiameter: q.numOr("rodD", 0.75),
    anchorCount: q.numOr("rods", 4),
    anchorGrade: q.str("grade", "55") as AnchorGrade,
    anchorEdge: q.numOr("edge", 2),
    friction: q.bool("friction"),
    frictionCoefficient: q.numOr("mu", 0.4),
    method,
  };
  let result: BasePlateResult | undefined, error: unknown;
  try {
    result = basePlate(shape, input);
  } catch (e) {
    error = e;
  }
  const depth = family === "hss-round" ? req(shape, "OD") : family === "hss-rect" ? req(shape, "Ht") : req(shape, "d"),
    width = family === "hss-round" ? depth : family === "hss-rect" ? req(shape, "B") : req(shape, "bf");
  const size = () => {
    const sized = sizeBasePlate(shape, input);
    if (sized) {
      q.set({ N: sized.N, B: sized.B, t: sized.thickness });
      setSizeMessage("Minimum area on a 1-in. grid; thickness rounded up to 1/8 in. within the pedestal.");
    } else
      setSizeMessage(
        "No passing size within the pedestal and 72-in. search bound. Revise loads, anchors, or pedestal.",
      );
  };
  return (
    <div>
      <PageHeader
        eyebrow="Connections · AISC DG1, third edition"
        title="Column base plate"
        description="Concentric compression and uniaxial moment using a uniform concrete bearing block. Anchor checks cover steel strength; ACI 318 concrete anchorage is outside this tool."
      />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Column & required strengths">
            <div className="space-y-3">
              <ShapePicker types={["W", "HSS"]} value={shape} onChange={(s) => q.set({ shape: slugOf(s.label) })} />
              {field("P", method === "LRFD" ? "Compression Pu" : "Compression Pa", 400, "force")}
              {field("M", "Strong-axis moment", 0, "moment")}
              {field("V", "Base shear", 0, "force")}
            </div>
          </Card>
          <Card title="Plate & concrete">
            <div className="space-y-3">
              {field("N", "Plate length N (bending direction)", 24)}
              {field("B", "Plate width B", 24)}
              {field("t", "Provided plate thickness", 1.5)}
              {field("Fy", "Plate yield stress Fy", 36, "stress")}
              {field("fc", "Concrete strength f′c", 4, "stress")}
              {field("pedN", "Centered pedestal length", 36)}
              {field("pedB", "Centered pedestal width", 36)}
              <Button onClick={size}>Size it</Button>
              {sizeMessage && (
                <p role="status" className="text-xs text-muted">
                  {sizeMessage}
                </p>
              )}
            </div>
          </Card>
          <Card title="Anchor rods & shear transfer">
            <div className="space-y-3">
              {field("rodD", "Anchor diameter", 0.75)}
              <Select
                label="Anchor grade"
                value={input.anchorGrade}
                onChange={(grade) => q.set({ grade })}
                options={(["36", "55", "105"] as const).map((g) => ({ value: g, label: `F1554 Gr. ${g}` }))}
              />
              {field("rods", "Total rods (two symmetric rows)", 4, "ratio")}
              {field("edge", "Anchor center to plate edge", 2)}
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={input.friction}
                  onChange={(e) => q.set({ friction: e.target.checked })}
                />
                Credit friction (LRFD)
              </label>
              {input.friction && field("mu", "Friction coefficient µ", 0.4, "ratio")}
            </div>
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          {error !== undefined && <ErrorCard error={error} />}
          <Card title="Design scope">
            <p className="text-xs text-warn">
              ACI 318 concrete breakout, pullout, pryout, embedment, anchor reinforcement and grout/washer/rod bending
              are not checked. Complete these before using the design.
            </p>
          </Card>
          {result && (
            <>
              <ConnectionHero pass={result.pass} ratio={result.ratio}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <RequiredThickness value={result.requiredThickness} />
                  <Stat label="Bearing model" value={result.regime} />
                  <Stat label="Total anchor tension" value={fmtQ(result.tension, "force", units)} />
                </div>
              </ConnectionHero>
              <Card title="Plate plan & bearing" subtitle={<SpecRef>DG1 §4.3.7 · uniform bearing block</SpecRef>}>
                <PlateDrawing input={input} result={result} depth={depth} width={width} shape={shape} />
              </Card>
              <CheckResults checks={result.checks} steps={result.steps} warnings={result.warnings} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
