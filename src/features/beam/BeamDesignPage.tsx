import { useMemo } from "react";
import { type SupportKind } from "@/analysis/beam-cases";
import { available, ltbCurve } from "@/aisc";
import { useSettings } from "@/app/settings";
import { CalcReport } from "@/components/CalcReport";
import { LineChart, type Series } from "@/components/charts/LineChart";
import { ShapePicker } from "@/components/ShapePicker";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  NumberInput,
  PageHeader,
  QuantityInput,
  RatioBar,
  Select,
  SpecRef,
  Stat,
  Sym,
  table,
} from "@/components/ui";
import { E, materialsFor } from "@/data/materials";
import { displayLabel, familyOf, findShape, req, SHAPES, slugOf, type Shape } from "@/data/shapes";
import { CrossSection } from "@/features/drawings/CrossSection";
import { BeamDiagrams, LoadingSchematic } from "@/features/diagrams/BeamPlot";
import { fmt, fmtQ, toDisplay, unitLabel } from "@/lib/units";
import {
  depthGroup,
  materialFor,
  nominalDepth,
  sweepShapes,
  validateInput,
  type BeamDesignInput,
  type Candidate,
  type DesignPoint,
} from "./design";
import { useBeamUrl } from "./url";
const FAMILIES = ["W", "M", "S", "HP", "C", "MC", "HSS-rect", "HSS-round", "PIPE"] as const;
type FamilyFilter = (typeof FAMILIES)[number];
function filterFor(s: Shape): FamilyFilter {
  return s.type === "HSS"
    ? familyOf(s) === "hss-round"
      ? "HSS-round"
      : "HSS-rect"
    : FAMILIES.includes(s.type as FamilyFilter)
      ? (s.type as FamilyFilter)
      : "W";
}
function inFamily(s: Shape, family: string): boolean {
  return filterFor(s) === family && ["i-shape", "channel", "hss-rect", "hss-round", "pipe"].includes(familyOf(s));
}
const SUPPORTS: { value: SupportKind; label: string }[] = [
  { value: "simple", label: "Simple · pin–roller" },
  { value: "cantilever", label: "Cantilever · fixed–free" },
  { value: "fixed-fixed", label: "Fixed–fixed" },
  { value: "propped", label: "Propped · fixed–simple" },
  { value: "overhang", label: "One overhang · right end" },
];
function readPoints(raw: string): { points: DesignPoint[]; error?: string } {
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || data.length > 20) throw new Error();
    const points = data.map((p: unknown): DesignPoint => {
      if (
        !p ||
        typeof p !== "object" ||
        !("P" in p) ||
        !("x" in p) ||
        !("category" in p) ||
        typeof p.P !== "number" ||
        typeof p.x !== "number" ||
        (p.category !== "D" && p.category !== "L")
      )
        throw new Error();
      return { P: p.P, x: p.x, category: p.category };
    });
    return { points };
  } catch {
    return { points: [], error: "Invalid point-load URL data. Reset point loads to continue." };
  }
}
export function BeamDesignPage() {
  const url = useBeamUrl(),
    { units, method } = useSettings();
  const linkedShape = findShape(url.text("shape", ""));
  const familyRaw = url.text("family", linkedShape ? filterFor(linkedShape) : "W");
  const family: FamilyFilter = FAMILIES.includes(familyRaw as FamilyFilter) ? (familyRaw as FamilyFilter) : "W";
  const L = url.number("L", 240),
    supportRaw = url.text("support", "simple");
  const support: SupportKind = SUPPORTS.some((s) => s.value === supportRaw) ? (supportRaw as SupportKind) : "simple";
  const areaMode = url.text("loadMode", "line") === "area";
  const width = url.number("width", 120),
    deadArea = url.number("deadArea", 40 / 144000),
    liveArea = url.number("liveArea", 60 / 144000);
  const rawPoints = url.text("points", "[]"),
    parsed = useMemo(() => readPoints(rawPoints), [rawPoints]);
  const bracingRaw = url.text("bracing", "continuous");
  const config: BeamDesignInput = {
    L,
    support,
    overhang: url.number("overhang", L / 4),
    dead: areaMode ? deadArea * width : url.number("dead", 0.3 / 12),
    live: areaMode ? liveArea * width : url.number("live", 0.6 / 12),
    points: parsed.points,
    selfWeight: url.text("selfWeight", "1") === "1",
    bracing: bracingRaw === "custom" || bracingRaw === "points" ? bracingRaw : "continuous",
    Lb: url.number("Lb", L),
    cbOverride: url.text("cbMode", "computed") === "override" ? url.number("Cb", 1) : undefined,
    liveLimit: url.number("liveLimit", 360),
    totalLimit: url.number("totalLimit", 240),
    method,
    materialId: url.text("material", "") || undefined,
  };
  const maxDepth = url.number("maxDepth", 0),
    showFailing = url.text("failing", "0") === "1";
  const error =
    parsed.error ??
    (areaMode && !(width > 0)
      ? "Tributary width must be positive."
      : maxDepth < 0
        ? "Maximum depth cannot be negative."
        : validateInput(config));
  const pool = useMemo(
    () => SHAPES.filter((s) => inFamily(s, family) && (!maxDepth || nominalDepth(s) <= maxDepth)),
    [family, maxDepth],
  );
  // A selected deep link always receives a check, including when it fails or lies outside current filters.
  const shapesToCheck = useMemo(
    () => (linkedShape && !pool.includes(linkedShape) ? [...pool, linkedShape] : pool),
    [pool, linkedShape],
  );
  const result = useMemo(
    () => (error ? { candidates: [], skipped: [] } : sweepShapes(shapesToCheck, config)),
    [
      shapesToCheck,
      error,
      L,
      support,
      config.overhang,
      config.dead,
      config.live,
      parsed.points,
      config.selfWeight,
      config.bracing,
      config.Lb,
      config.cbOverride,
      config.liveLimit,
      config.totalLimit,
      method,
      config.materialId,
    ],
  );
  const passing = result.candidates.filter((c) => c.pass && pool.includes(c.shape));
  const linkedFailure = result.skipped.find((s) => s.shape === linkedShape);
  const selected = result.candidates.find((c) => c.shape === linkedShape) ?? passing[0] ?? result.candidates[0];
  const visible = result.candidates.filter((c) => pool.includes(c.shape) && (showFailing || c.pass));
  const lightestByDepth = new Map<string, string>();
  for (const c of passing)
    if (!lightestByDepth.has(depthGroup(c.shape))) lightestByDepth.set(depthGroup(c.shape), c.shape.label);
  const pageCount = Math.max(1, Math.ceil(visible.length / 50));
  const page = Math.max(1, Math.min(pageCount, Math.floor(url.number("page", 1))));
  const pageRows = visible.slice((page - 1) * 50, page * 50);
  const representative = pool[0] ?? SHAPES.find((s) => inFamily(s, family))!;
  const materialOptions = materialsFor(familyOf(representative));
  const activeMaterial = materialFor(representative, config.materialId);
  const setPoints = (points: DesignPoint[]) => url.set("points", points.length ? JSON.stringify(points) : undefined);
  const changePoint = (i: number, patch: Partial<DesignPoint>) =>
    setPoints(parsed.points.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const governingBeam = selected?.demand.strength.reduce((a, b) =>
    Math.abs(b.beam.max.M.value) > Math.abs(a.beam.max.M.value) ? b : a,
  );
  return (
    <>
      <PageHeader
        eyebrow="Manual Part 3 · AISC 360-22 Chapters F & G"
        title="Beam design"
        description="Size a prismatic steel beam for flexure, shear and service-load deflection. Passing sections are ranked by weight."
        actions={<Button onClick={() => window.print()}>Print calculation</Button>}
      />
      <div className="grid items-start gap-4 md:grid-cols-[280px_minmax(0,1fr)] print:block">
        <aside className="space-y-4 no-print">
          <Card title="Geometry and supports" subtitle={<SpecRef>Manual Table 3-23</SpecRef>}>
            <div className="space-y-3">
              <QuantityInput label="Total beam length L" quantity="span" value={L} onChange={(v) => url.set("L", v)} />
              <Select
                label="Support condition"
                value={support}
                onChange={(v) => url.set("support", v)}
                options={SUPPORTS}
              />
              {support === "overhang" && (
                <QuantityInput
                  label="Right overhang a"
                  quantity="span"
                  value={config.overhang}
                  onChange={(v) => url.set("overhang", v)}
                  hint="Support spacing = L − a; loads act on full L."
                />
              )}
            </div>
          </Card>
          <Card title="Service loads" subtitle="Downward gravity loads · all point loads act through the shear center">
            <div className="space-y-3">
              <Select
                label="Uniform load input"
                value={areaMode ? "area" : "line"}
                onChange={(v) => url.set("loadMode", v)}
                options={[
                  { value: "line", label: "Line load" },
                  { value: "area", label: "Area load × tributary width" },
                ]}
              />
              {areaMode ? (
                <>
                  <QuantityInput
                    label="Tributary width"
                    quantity="span"
                    value={width}
                    onChange={(v) => url.set("width", v)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <QuantityInput
                      label="Dead area load"
                      quantity="areaLoad"
                      value={deadArea}
                      onChange={(v) => url.set("deadArea", v)}
                    />
                    <QuantityInput
                      label="Live area load"
                      quantity="areaLoad"
                      value={liveArea}
                      onChange={(v) => url.set("liveArea", v)}
                    />
                  </div>
                  <p className="text-xs text-muted">
                    D = {fmtQ(config.dead, "lineLoad", units)} · L = {fmtQ(config.live, "lineLoad", units)}
                  </p>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <QuantityInput
                    label="Dead load D"
                    quantity="lineLoad"
                    value={config.dead}
                    onChange={(v) => url.set("dead", v)}
                  />
                  <QuantityInput
                    label="Live load L"
                    quantity="lineLoad"
                    value={config.live}
                    onChange={(v) => url.set("live", v)}
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={config.selfWeight}
                  onChange={(e) => url.set("selfWeight", e.target.checked ? "1" : "0")}
                />
                Include each candidate’s self-weight in D
              </label>
              {parsed.points.map((p, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-line p-2">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Point load {i + 1}</span>
                    <button
                      className="text-accent"
                      aria-label={`Remove point load ${i + 1}`}
                      onClick={() => setPoints(parsed.points.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <QuantityInput
                      label="Load P"
                      quantity="force"
                      value={p.P}
                      onChange={(v) => changePoint(i, { P: v ?? 0 })}
                    />
                    <QuantityInput
                      label="Position x"
                      quantity="span"
                      value={p.x}
                      onChange={(v) => changePoint(i, { x: v ?? 0 })}
                    />
                  </div>
                  <Select
                    label="Category"
                    value={p.category}
                    onChange={(category) => changePoint(i, { category })}
                    options={[
                      { value: "D", label: "Dead" },
                      { value: "L", label: "Live" },
                    ]}
                  />
                </div>
              ))}
              <Button
                disabled={parsed.points.length >= 20}
                onClick={() => setPoints([...parsed.points, { x: L / 2, P: 5, category: "L" }])}
              >
                Add point load
              </Button>
              {parsed.error && <Button onClick={() => setPoints([])}>Reset point loads</Button>}
              <p className="text-xs text-faint">
                Loads are unfactored. All applicable D/L combinations are evaluated.{" "}
                <SpecRef>ASCE 7-22 {method === "LRFD" ? "§2.3.1" : "§2.4.1"}</SpecRef>
              </p>
            </div>
          </Card>
          <Card title="Lateral bracing" subtitle={<SpecRef>§F1 · Eq. F1-1</SpecRef>}>
            <div className="space-y-3">
              <Select
                label="Brace arrangement"
                value={config.bracing}
                onChange={(v) => url.set("bracing", v)}
                options={[
                  { value: "continuous", label: "Continuous compression-flange bracing" },
                  { value: "points", label: "Braces at supports and point loads" },
                  { value: "custom", label: "Custom equal brace spacing" },
                ]}
              />
              {config.bracing === "custom" && (
                <QuantityInput
                  label="Brace spacing Lb"
                  quantity="span"
                  value={config.Lb}
                  onChange={(v) => url.set("Lb", v)}
                  hint="From the left end; the last segment may be shorter."
                />
              )}
              {config.bracing !== "continuous" && (
                <>
                  <Select
                    label="Moment gradient Cb"
                    value={config.cbOverride === undefined ? "computed" : "override"}
                    onChange={(v) => url.set("cbMode", v)}
                    options={[
                      { value: "computed", label: "Compute from segment quarter points" },
                      { value: "override", label: "User override" },
                    ]}
                  />
                  {config.cbOverride !== undefined && (
                    <NumberInput
                      label={<Sym s="C{b}" />}
                      value={config.cbOverride}
                      onChange={(v) => url.set("Cb", v)}
                    />
                  )}
                </>
              )}
              <p className="text-xs text-faint">
                Brace points must restrain the compression flange and twist. Restrain both flanges where moment
                reverses. Free-end cantilever and overhang segments use Cb = 1. Channels are checked for flexure and
                shear; load eccentricity and torsion require a separate check. <SpecRef>§F1</SpecRef>
              </p>
            </div>
          </Card>
          <Card title="Deflection criteria" subtitle="Service D + L; live L alone · project criteria">
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Live limit L /" value={config.liveLimit} onChange={(v) => url.set("liveLimit", v)} />
              <NumberInput
                label="Total limit L /"
                value={config.totalLimit}
                onChange={(v) => url.set("totalLimit", v)}
              />
            </div>
            <p className="mt-2 text-xs text-faint">
              For cantilevers and overhangs, L is the entered total length; adjust denominators to the project’s
              criteria. <SpecRef>§L3</SpecRef>
            </p>
          </Card>
          <Card title="Section search" subtitle={<SpecRef>Manual Tables 2-4, 2-5</SpecRef>}>
            <div className="space-y-3">
              <Select
                label="Shape family"
                value={family}
                onChange={(v) => url.update({ family: v, material: undefined, shape: undefined })}
                options={FAMILIES.map((value) => ({
                  value,
                  label:
                    value === "HSS-rect" ? "HSS · rectangular / square" : value === "HSS-round" ? "HSS · round" : value,
                }))}
              />
              <Select
                label="Material"
                value={activeMaterial.id}
                onChange={(v) => url.set("material", v)}
                options={materialOptions.map((m) => ({
                  value: m.id,
                  label: `${m.name} · Fy ${fmtQ(m.Fy, "stress", units)}`,
                }))}
              />
              <QuantityInput
                label="Maximum nominal depth (optional)"
                quantity="length"
                value={maxDepth || undefined}
                onChange={(v) => url.set("maxDepth", v)}
              />
              <ShapePicker
                label="Check a specific shape"
                value={linkedShape}
                onChange={(s) => url.update({ shape: slugOf(s.label), family: filterFor(s), material: undefined })}
              />
            </div>
          </Card>
        </aside>
        <div className="min-w-0 space-y-4">
          {error && (
            <div role="alert" className="rounded-lg bg-fail-soft p-4 text-sm text-fail">
              {error}
            </div>
          )}
          {!error && result.candidates.length === 0 && result.skipped.length > 0 && (
            <div role="alert" className="rounded-lg bg-fail-soft p-4 text-sm text-fail">
              No section checks completed: {result.skipped[0]?.reason}
            </div>
          )}
          {linkedFailure && (
            <div role="alert" className="rounded-lg bg-warn-soft p-4 text-sm text-warn">
              The linked shape {displayLabel(linkedFailure.shape.label)} could not be checked: {linkedFailure.reason}
            </div>
          )}
          {selected && governingBeam && (
            <>
              <Card
                title="Demand summary"
                subtitle={
                  <>
                    Selected {displayLabel(selected.shape.label)} · self-weight{" "}
                    {config.selfWeight ? fmtQ(req(selected.shape, "W"), "weight", units) : "excluded"} ·{" "}
                    <SpecRef>Manual Table 3-23</SpecRef>
                  </>
                }
              >
                <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
                  <Stat
                    label={method === "LRFD" ? "Required moment Mu" : "Required moment Ma"}
                    value={fmtQ(selected.demand.moment.value, "moment", units)}
                    sub={selected.demand.moment.combo.label}
                  />
                  <Stat
                    label={method === "LRFD" ? "Required shear Vu" : "Required shear Va"}
                    value={fmtQ(selected.demand.shear.value, "force", units)}
                    sub={selected.demand.shear.combo.label}
                  />
                  <Stat
                    label="Live deflection"
                    value={fmtQ(selected.dll, "length", units)}
                    sub={`Limit ${fmtQ(L / config.liveLimit, "length", units)}`}
                    tone={selected.llRatio <= 1 ? "pass" : "fail"}
                  />
                  <Stat
                    label="Total deflection"
                    value={fmtQ(selected.dtl, "length", units)}
                    sub={`Limit ${fmtQ(L / config.totalLimit, "length", units)}`}
                    tone={selected.tlRatio <= 1 ? "pass" : "fail"}
                  />
                </div>
                <p className="mt-3 text-xs text-muted">
                  {SUPPORTS.find((s) => s.value === support)?.label} · L = {fmtQ(L, "span", units)} · D ={" "}
                  {fmtQ(config.dead, "lineLoad", units)} + self-weight{" "}
                  {config.selfWeight ? fmtQ(req(selected.shape, "W") / 12000, "lineLoad", units) : "0"} · Live ={" "}
                  {fmtQ(config.live, "lineLoad", units)}
                </p>
                <LoadingSchematic loading={governingBeam.beam.loading} />
                <p className="mb-3 text-xs text-muted">
                  Strength diagrams: {governingBeam.combo.label}; shear envelope above may govern under a different
                  combination. <SpecRef>ASCE 7-22 {method === "LRFD" ? "§2.3.1" : "§2.4.1"}</SpecRef>
                </p>
                <BeamDiagrams result={governingBeam.beam} deflection={false} />
              </Card>
            </>
          )}
          {!error && (
            <Card
              className="no-print"
              title="Ranked sections"
              subtitle={
                <>
                  {passing.length} passing / {pool.length} searched · bold = lightest passing at each nominal depth ·{" "}
                  <SpecRef>Manual Table 3-2 format</SpecRef>
                </>
              }
              actions={
                <label className="flex items-center gap-2 text-xs text-muted no-print">
                  <input
                    type="checkbox"
                    checked={showFailing}
                    onChange={(e) => url.set("failing", e.target.checked ? "1" : "0")}
                  />
                  Show failing
                </label>
              }
              bodyClassName="p-0"
            >
              <div className="max-h-[490px] overflow-auto">
                <table className={table.table}>
                  <thead>
                    <tr>
                      {[
                        "Shape",
                        `W (${unitLabel("weight", units)})`,
                        `Available M (${unitLabel("moment", units)})`,
                        "M ratio",
                        "V ratio",
                        `ΔLL (${unitLabel("length", units)})`,
                        `ΔTL (${unitLabel("length", units)})`,
                        "Governing check",
                      ].map((h) => (
                        <th key={h} className={table.th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((c) => (
                      <tr
                        key={c.shape.label}
                        onClick={() => url.set("shape", slugOf(c.shape.label))}
                        aria-selected={selected?.shape === c.shape}
                        className={`cursor-pointer ${table.tr} ${selected?.shape === c.shape ? "bg-accent-soft" : ""} ${lightestByDepth.get(depthGroup(c.shape)) === c.shape.label ? "font-semibold" : ""}`}
                      >
                        <td className={table.td}>
                          <button
                            className="font-mono text-accent underline-offset-2 hover:underline"
                            aria-pressed={selected?.shape === c.shape}
                          >
                            {displayLabel(c.shape.label)}
                          </button>
                        </td>
                        <td className={table.td}>{fmt(toDisplay(req(c.shape, "W"), "weight", units), 4)}</td>
                        <td className={table.td}>{fmt(toDisplay(c.capacity, "moment", units), 4)}</td>
                        <td className={`${table.td} ${c.mRatio <= 1 ? "text-pass" : "text-fail"}`}>
                          {fmt(c.mRatio, 3)}
                        </td>
                        <td className={`${table.td} ${c.vRatio <= 1 ? "text-pass" : "text-fail"}`}>
                          {fmt(c.vRatio, 3)}
                        </td>
                        <td className={`${table.td} ${c.llRatio <= 1 ? "text-pass" : "text-fail"}`}>
                          {fmt(toDisplay(c.dll, "length", units), 3)}
                        </td>
                        <td className={`${table.td} ${c.tlRatio <= 1 ? "text-pass" : "text-fail"}`}>
                          {fmt(toDisplay(c.dtl, "length", units), 3)}
                        </td>
                        <td className={`${table.td} text-xs`}>
                          <Badge tone={c.pass ? "pass" : "fail"}>{c.governing}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visible.length === 0 && (
                <div className="p-4">
                  <EmptyState title="No passing sections in this search">
                    Increase section depth, reduce loads, or revise bracing. Show failing sections to review the
                    controlling checks.
                  </EmptyState>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2 text-xs text-muted">
                <span>
                  {visible.length
                    ? `${(page - 1) * 50 + 1}–${Math.min(page * 50, visible.length)} of ${visible.length}`
                    : "0 sections"}
                </span>
                <div className="flex gap-2">
                  <Button disabled={page <= 1} onClick={() => url.set("page", page - 1)}>
                    Previous
                  </Button>
                  <Button disabled={page >= pageCount} onClick={() => url.set("page", page + 1)}>
                    Next
                  </Button>
                </div>
              </div>
              <p className="px-4 py-3 text-xs text-muted">
                Available M and M ratio use the governing segment and combination for each candidate. Δ uses each
                shape’s Iₓ. {result.skipped.length > 0 && `${result.skipped.length} unsupported sections skipped.`}
              </p>
              {result.skipped.length > 0 && (
                <details className="px-4 pb-3 text-xs text-muted">
                  <summary>Skipped section details</summary>
                  {result.skipped.map((s) => (
                    <p key={s.shape.label}>
                      {displayLabel(s.shape.label)}: {s.reason}
                    </p>
                  ))}
                </details>
              )}
            </Card>
          )}
          {selected && (
            <>
              <Card
                title={`${displayLabel(selected.shape.label)} · ${selected.material.name}`}
                subtitle={
                  <>
                    Selected section check · {method} · <SpecRef>AISC Shapes Database v16.0</SpecRef>
                  </>
                }
                actions={
                  <Badge tone={selected.pass ? "pass" : "fail"}>
                    {selected.pass ? "PASS" : "FAIL"} · {fmt(selected.ratio, 3)}
                  </Badge>
                }
              >
                <div className="grid gap-5 lg:grid-cols-[minmax(180px,.75fr)_1fr]">
                  <CrossSection shape={selected.shape} maxHeight={290} />
                  <div className="space-y-3">
                    <RatioBar label="Flexure" ratio={selected.mRatio} />
                    <RatioBar label="Shear" ratio={selected.vRatio} />
                    <RatioBar label="Live Δ" ratio={selected.llRatio} />
                    <RatioBar label="Total Δ" ratio={selected.tlRatio} />
                    <div className="border-t border-line pt-3 text-xs leading-relaxed text-muted">
                      Governing flexure segment: {fmtQ(selected.segment.start, "span", units)}–
                      {fmtQ(selected.segment.end, "span", units)}; Lb = {fmtQ(selected.segment.Lb, "span", units)}, Cb ={" "}
                      {fmt(selected.segment.Cb, 4)}. Combination: {selected.segment.combo.label}.{" "}
                      <SpecRef>Eq. F1-1</SpecRef>
                    </div>
                    {linkedShape && !pool.includes(linkedShape) && (
                      <p className="text-xs text-warn">
                        The linked shape is checked outside the current family/depth filter.
                      </p>
                    )}
                  </div>
                </div>
              </Card>
              <CapacityCurve
                selected={selected}
                candidates={passing}
                overlay={url.text("overlay", "0") === "1"}
                onOverlay={(v) => url.set("overlay", v ? "1" : "0")}
                L={L}
              />
              <Card title="Flexural strength calculation" subtitle={<SpecRef>AISC 360-22 Chapter F</SpecRef>}>
                <CalcReport result={selected.flexure} demand={selected.moment} />
              </Card>
              <Card title="Shear strength calculation" subtitle={<SpecRef>AISC 360-22 Chapter G</SpecRef>}>
                <CalcReport result={selected.shear} demand={selected.demand.shear.value} />
              </Card>
              <Card
                title="Service-load deflection check"
                subtitle={
                  <>
                    Elastic bending · E = {fmtQ(E, "stress", units)} · Iₓ ={" "}
                    {fmtQ(req(selected.shape, "Ix"), "inertia", units)} <SpecRef>Manual Table 3-23 · §L3</SpecRef>
                  </>
                }
              >
                <div className="mb-4 font-mono text-sm">
                  <Sym s="Δ(x) = −∫∫M{service}(x)/(EI{x}) dx dx + c{1}x + c{0}" />
                </div>
                <p className="mb-4 text-xs text-muted">
                  Constants enforce zero support displacements and zero fixed-end rotations. The maximum is evaluated at
                  rotation roots and load/support boundaries. Self-weight is included in D when enabled; limits are
                  project inputs.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat
                    label="Live load L only"
                    value={fmtQ(selected.dll, "length", units)}
                    sub={`≤ L/${config.liveLimit} = ${fmtQ(L / config.liveLimit, "length", units)} · x = ${fmtQ(selected.demand.live.max.delta.x, "span", units)}`}
                    tone={selected.llRatio <= 1 ? "pass" : "fail"}
                  />
                  <Stat
                    label="Total service D + L"
                    value={fmtQ(selected.dtl, "length", units)}
                    sub={`≤ L/${config.totalLimit} = ${fmtQ(L / config.totalLimit, "length", units)} · x = ${fmtQ(selected.demand.total.max.delta.x, "span", units)}`}
                    tone={selected.tlRatio <= 1 ? "pass" : "fail"}
                  />
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
function CapacityCurve({
  selected,
  candidates,
  overlay,
  onOverlay,
  L,
}: {
  selected: Candidate;
  candidates: Candidate[];
  overlay: boolean;
  onOverlay: (v: boolean) => void;
  L: number;
}) {
  const { units, method } = useSettings();
  const others = candidates
    .filter((c) => c.shape !== selected.shape && req(c.shape, "W") >= req(selected.shape, "W"))
    .slice(0, 3);
  const series = useMemo(() => {
    const all = [selected, ...(overlay ? others : [])],
      Lmax = Math.max(L * 1.5, (selected.flexure.Lr ?? 0) * 1.1, selected.segment.Lb * 1.2);
    return all.flatMap((c, i): Series[] => {
      try {
        return [
          {
            id: c.shape.label,
            label: displayLabel(c.shape.label),
            color: ["var(--accent)", "var(--pass)", "var(--warn)", "var(--muted)"][i],
            dashed: i > 0,
            points: ltbCurve(c.shape, c.material, { axis: "major", Cb: selected.segment.Cb, Lmax, n: 61 }).map((p) => ({
              x: toDisplay(p.Lb, "span", units),
              y: toDisplay(available({ ...c.flexure, nominal: p.Mn }, method), "moment", units),
            })),
          },
        ];
      } catch {
        return [];
      }
    });
  }, [selected, candidates, overlay, units, method, L]);
  const markers = [
    ...(selected.flexure.Lp !== undefined
      ? [{ x: toDisplay(selected.flexure.Lp, "span", units), label: "Lp", color: "var(--muted)" }]
      : []),
    ...(selected.flexure.Lr !== undefined
      ? [{ x: toDisplay(selected.flexure.Lr, "span", units), label: "Lr", color: "var(--muted)" }]
      : []),
    {
      x: toDisplay(selected.segment.Lb, "span", units),
      y: toDisplay(selected.capacity, "moment", units),
      label: "Current Lb",
      color: "var(--accent)",
    },
  ];
  return (
    <Card
      title="Available moment versus unbraced length"
      subtitle={
        <>
          Cb = {fmt(selected.segment.Cb, 4)} held constant · <SpecRef>Manual Table 3-10 format · Chapter F</SpecRef>
        </>
      }
      actions={
        <label className="flex items-center gap-2 text-xs text-muted no-print">
          <input type="checkbox" checked={overlay} onChange={(e) => onOverlay(e.target.checked)} />
          Overlay next sections
        </label>
      }
    >
      {series.length ? (
        <LineChart
          series={series}
          xLabel={`Unbraced length Lb (${unitLabel("span", units)})`}
          yLabel={`Available moment (${unitLabel("moment", units)})`}
          xMin={0}
          yMin={0}
          markers={markers}
          formatX={(v) => fmt(v, 3)}
          formatY={(v) => fmt(v, 3)}
        />
      ) : (
        <p className="text-sm text-muted">A strength curve is unavailable for this section.</p>
      )}
    </Card>
  );
}
