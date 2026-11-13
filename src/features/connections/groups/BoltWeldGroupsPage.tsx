import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { available } from "@/aisc/common";
import {
  boltBearing,
  boltCombinedTension,
  boltShear,
  boltTension,
  minimumPretension,
  minEdgeDistance,
  minSpacing,
  nominalHoleDimensions,
  slipResistance,
} from "@/aisc/connections/bolts";
import { analyzeBoltGroup, analyzeWeldGroup, type GroupAnalysis } from "@/aisc/connections/groups";
import {
  filletWeld,
  filletWeldPerInch,
  maxFilletWeldSize,
  minFilletWeldSize,
  minimumBaseMetalThickness,
  weldBaseMetalShear,
} from "@/aisc/connections/welds";
import type {
  BoltCoord,
  BoltGroup,
  BoltSpec,
  ConnectionResult,
  HoleType,
  SlotOrientation,
  ThreadCondition,
  WeldSegment,
} from "@/aisc/connections/types";
import { useSettings } from "@/app/settings";
import { CalcReport, StepRow } from "@/components/CalcReport";
import {
  Card,
  Field,
  NumberInput,
  PageHeader,
  QuantityInput,
  Segmented,
  Select,
  SpecRef,
  Stat,
  Sym,
  table,
} from "@/components/ui";
import { fmt, fmtQ, fromDisplay, toDisplay, unitLabel, type Quantity } from "@/lib/units";
import { GroupDiagram } from "./GroupDiagram";

type Tab = "single" | "bolts" | "welds";
const tabs = [
  { value: "single" as const, label: "Single bolt" },
  { value: "bolts" as const, label: "Eccentric bolt group" },
  { value: "welds" as const, label: "Welds & weld groups" },
];
const diameterOptions = [0.5, 0.625, 0.75, 0.875, 1, 1.125, 1.25, 1.375, 1.5];
function attempt<T>(fn: () => T): { value: T; error?: never } | { value?: never; error: string } {
  try {
    return { value: fn() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
function Issue({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-warn/30 bg-warn-soft p-3 text-sm text-warn">
      {message}
    </div>
  );
}
function Reports({ results }: { results: ConnectionResult[] }) {
  return (
    <div className="space-y-4">
      {results.map((r, i) => (
        <Card key={i} title={r.section}>
          <CalcReport result={r} />
        </Card>
      ))}
    </div>
  );
}

export function BoltWeldGroupsPage() {
  const [params, setParams] = useSearchParams(),
    { units, method } = useSettings();
  const set = (key: string, value: string | number) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set(key, String(value));
        return next;
      },
      { replace: true },
    );
  const num = (key: string, fallback: number) => {
    const raw = params.get(key);
    return raw === null ? fallback : raw.trim() === "" ? NaN : Number(raw);
  };
  const choice = <T extends string>(key: string, fallback: T, allowed: readonly T[]): T => {
    const raw = params.get(key) as T;
    return allowed.includes(raw) ? raw : fallback;
  };
  const tab = choice<Tab>("tab", "single", ["single", "bolts", "welds"]);
  const field = (key: string, label: React.ReactNode, fallback: number, quantity: Quantity = "length") => (
    <QuantityInput
      label={label}
      quantity={quantity}
      value={Number.isFinite(num(key, fallback)) ? num(key, fallback) : undefined}
      onChange={(v) => set(key, v ?? "")}
    />
  );
  const number = (key: string, label: string, fallback: number) => (
    <NumberInput
      label={label}
      value={Number.isFinite(num(key, fallback)) ? num(key, fallback) : undefined}
      onChange={(v) => set(key, v ?? "")}
    />
  );
  const group = choice<BoltGroup>("group", "A", ["A307", "A", "B", "C"]),
    threads = choice<ThreadCondition>("threads", "N", ["N", "X"]);
  const bolt: BoltSpec = { d: num("d", 0.75), group, threads },
    planes = num("planes", 1);
  const hole = choice<HoleType>("hole", "STD", ["STD", "OVS", "SSL", "LSL"]),
    slot = choice<SlotOrientation>("slot", "perpendicular", ["perpendicular", "parallel"]);
  const t = num("t", 0.375),
    Fu = num("Fu", 58),
    lc = num("lc", 1.25),
    Fy = num("Fy", 36),
    slip = params.get("slip") === "1";
  const deformation = params.get("deformation") !== "0";
  const boltChecks = attempt(() => {
    const shear = boltShear({ bolt, planes }),
      tension = boltTension(bolt),
      bearing = boltBearing({ d: bolt.d, t, Fu, lc, holeType: hole, slot, deformationConsidered: deformation });
    const slipping =
      slip && group !== "A307"
        ? slipResistance({
            bolt,
            surface: choice("surface", "A", ["A", "B"]),
            ns: planes,
            holeType: hole,
            slot,
            hf: params.get("fillers") === "1" ? 0.85 : 1,
          })
        : undefined;
    const combined = boltCombinedTension({ bolt, frv: num("frv", 0), method, planes });
    return {
      shear,
      tension,
      bearing,
      slipping,
      combined,
      capacity: Math.min(available(shear, method), available(bearing, method)),
    };
  });
  const boltInputs = (
    <Card title="Bolt & connected material" subtitle={<SpecRef>Tables J3.1–J3.4 · §J3.11</SpecRef>}>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Bolt group"
          value={group}
          onChange={(v) => {
            setParams(
              (p) => {
                const next = new URLSearchParams(p);
                next.set("group", v);
                if (v === "C" && ![1, 1.125, 1.25].includes(bolt.d)) next.set("d", "1");
                return next;
              },
              { replace: true },
            );
          }}
          options={[
            { value: "A307", label: "ASTM A307" },
            { value: "A", label: "A · Group 120 (A325)" },
            { value: "B", label: "B · Group 150 (A490)" },
            { value: "C", label: "C · Group 200" },
          ]}
        />
        <Select
          label={`Inch-bolt diameter (${unitLabel("length", units)})`}
          value={String(bolt.d)}
          onChange={(v) => set("d", v)}
          options={diameterOptions
            .filter((d) => group !== "C" || [1, 1.125, 1.25].includes(d))
            .map((d) => ({ value: String(d), label: fmtQ(d, "length", units) }))}
        />
        <Select
          label="Threads in shear plane"
          value={threads}
          onChange={(v) => set("threads", v)}
          options={[
            { value: "N", label: "N · included" },
            { value: "X", label: "X · excluded" },
          ]}
        />
        {number("planes", "Shear / slip planes", 1)}
        <Select
          label="Hole type"
          value={hole}
          onChange={(v) => set("hole", v)}
          options={["STD", "OVS", "SSL", "LSL"].map((value) => ({ value: value as HoleType, label: value }))}
        />
        <Select
          label="Slot relative to load"
          value={slot}
          onChange={(v) => set("slot", v)}
          options={[
            { value: "perpendicular", label: "Perpendicular" },
            { value: "parallel", label: "Parallel" },
          ]}
        />
        {field("t", "Material thickness", 0.375)}
        {field("Fu", <Sym s="F{u}" />, 58, "stress")}
        {field("lc", <Sym s="Clear distance l{c}" />, 1.25)}
        {field("frv", "Required bolt shear stress per plane", 0, "stress")}
        <label className="col-span-2 flex gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={deformation}
            onChange={(e) => set("deformation", e.target.checked ? "1" : "0")}
          />
          Deformation at service load is a design consideration
        </label>
        <label className="col-span-2 flex gap-2 text-xs text-muted">
          <input type="checkbox" checked={slip} onChange={(e) => set("slip", e.target.checked ? "1" : "0")} />
          Slip-critical connection
        </label>
        {slip && (
          <>
            <Select
              label="Faying surface"
              value={choice("surface", "A", ["A", "B"])}
              onChange={(v) => set("surface", v)}
              options={[
                { value: "A", label: "Class A · μ 0.30" },
                { value: "B", label: "Class B · μ 0.50" },
              ]}
            />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={params.get("fillers") === "1"}
                onChange={(e) => set("fillers", e.target.checked ? "1" : "0")}
              />
              Two or more fillers
            </label>
          </>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">
        Clear distance is measured between hole edges along the force. Bearing thickness represents one connected ply.
      </p>
    </Card>
  );
  const ex = num("ex", 3),
    angle = num("angle", 0),
    solver = choice<"IC" | "elastic">("solver", "IC", ["IC", "elastic"]);
  const rows = num("rows", 3),
    cols = num("cols", 2),
    spacing = num("spacing", 3),
    gage = num("gage", 3),
    custom = params.get("pattern") === "custom";
  const coords = params.get("coords") ?? "0,0;3,0;0,3;3,3;0,6;3,6";
  const boltAnalysis = useMemo(
    () =>
      attempt(() => {
        let bolts: BoltCoord[];
        if (custom)
          bolts = coords
            .split(";")
            .filter((s) => s.trim())
            .map((s) => {
              const xy = s.split(",").map(Number);
              if (xy.length !== 2 || s.split(",").some((x) => !x.trim()) || xy.some((x) => !Number.isFinite(x)))
                throw new RangeError("Enter one x,y pair per line.");
              return { x: xy[0]!, y: xy[1]! };
            });
        else {
          if (
            !Number.isInteger(rows) ||
            !Number.isInteger(cols) ||
            rows < 1 ||
            cols < 1 ||
            rows * cols > 200 ||
            !(spacing > 0) ||
            !(gage > 0)
          )
            throw new RangeError("Use positive spacing/gage and integer rows/columns (at most 200 bolts).");
          bolts = Array.from({ length: rows * cols }, (_, i) => ({
            x: (i % cols) * gage,
            y: Math.floor(i / cols) * spacing,
          }));
        }
        return { bolts, result: analyzeBoltGroup({ bolts, ex, angle, method: solver }) };
      }),
    [custom, coords, rows, cols, spacing, gage, ex, angle, solver],
  );
  const weldShape = choice("wshape", "C", ["line", "parallel", "C", "L", "box"]),
    l = num("wl", 10),
    kl = num("kl", 0.4),
    w = num("w", 0.25),
    FEXX = num("FEXX", 70),
    we = num("we", 3),
    wa = num("wa", 0),
    wm = choice<"IC" | "elastic">("wm", "IC", ["IC", "elastic"]);
  const weldAnalysis = useMemo(
    () =>
      attempt(() => {
        if (!(l > 0) || !(kl > 0) || !Number.isFinite(l * kl))
          throw new RangeError("Weld length l and proportion k must be positive.");
        const b = kl * l,
          vertical = { x1: 0, y1: 0, x2: 0, y2: l },
          right = { x1: b, y1: 0, x2: b, y2: l },
          bottom = { x1: 0, y1: 0, x2: b, y2: 0 },
          top = { x1: 0, y1: l, x2: b, y2: l };
        const segments: WeldSegment[] =
          weldShape === "line"
            ? [vertical]
            : weldShape === "parallel"
              ? [vertical, right]
              : weldShape === "L"
                ? [vertical, bottom]
                : weldShape === "C"
                  ? [vertical, bottom, top]
                  : [vertical, right, bottom, top];
        const result = analyzeWeldGroup({ segments, ex: we, angle: wa, FEXX, method: wm });
        if (!(w > 0) || !Number.isFinite(w)) throw new RangeError("Weld leg must be positive.");
        const nominal = result.C * (FEXX / 70) * (w * 16) * result.referenceLength!;
        const report: ConnectionResult = {
          kind: "connection",
          quantity: "force",
          nominal,
          phi: 0.75,
          omega: 2,
          governing: "WG",
          section: "Manual Part 8 · Eccentric weld group",
          steps: result.steps,
          limitStates: [
            {
              id: "WG",
              name: "Weld group rupture",
              nominal,
              phi: 0.75,
              omega: 2,
              ref: "Manual Part 8",
              steps: [
                {
                  label: "Nominal group strength",
                  symbol: "R{n}",
                  expr: "C (F{EXX}/70) D l",
                  value: nominal,
                  quantity: "force",
                  ref: "Manual Part 8",
                },
              ],
            },
          ],
          warnings: [
            ...result.warnings,
            "C uses nominal strength and l = longest segment; values are computed rather than copied from Manual Tables 8-4–8-11.",
          ],
        };
        const straight = filletWeld({ w, length: l, FEXX, theta: num("theta", 0) });
        return { segments, result, report, straight };
      }),
    [weldShape, l, kl, we, wa, wm, FEXX, w, params.get("theta")],
  );
  const loadFields = (weld = false) => (
    <Card title="In-plane load & analysis">
      <div className="grid grid-cols-2 gap-3">
        {field(weld ? "we" : "ex", "Eccentricity from centroid", 3)}
        {number(weld ? "wa" : "angle", "Angle from vertical (°)", 0)}
        <div className="col-span-2 overflow-x-auto">
          <Segmented
            ariaLabel="Analysis method"
            value={weld ? wm : solver}
            onChange={(v) => set(weld ? "wm" : "solver", v)}
            options={[
              { value: "IC", label: "Instantaneous center" },
              { value: "elastic", label: "Elastic vector" },
            ]}
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        Positive eccentricity is to the right of the load direction. Positive angle rotates the load from downward
        vertical toward +x.
      </p>
    </Card>
  );
  return (
    <div>
      <PageHeader
        eyebrow="Connections · ANSI/AISC 360-22"
        title="Bolt & weld groups"
        description="Bolt strength, bearing, slip resistance, and eccentric in-plane groups with cited calculations."
      />
      <div className="mb-5 overflow-x-auto">
        <Segmented value={tab} onChange={(v) => set("tab", v)} options={tabs} ariaLabel="Connection calculator" />
      </div>
      {tab === "single" && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[370px_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            {boltInputs}
            {slip && group === "A307" && (
              <Issue message="Slip-critical joints require high-strength bolts; select Group 120, 150, or 200." />
            )}
            {boltChecks.value && (
              <BoltQuickTable
                bolt={bolt}
                planes={planes}
                t={t}
                Fu={Fu}
                lc={lc}
                hole={hole}
                slot={slot}
                deformation={deformation}
              />
            )}
          </div>
          <div className="space-y-4">
            {boltChecks.error !== undefined ? (
              <Issue message={boltChecks.error} />
            ) : (
              <Reports
                results={[
                  boltChecks.value.shear,
                  boltChecks.value.tension,
                  boltChecks.value.bearing,
                  ...(boltChecks.value.slipping ? [boltChecks.value.slipping] : []),
                  boltChecks.value.combined,
                ]}
              />
            )}
          </div>
        </div>
      )}
      {tab === "bolts" && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[370px_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <Card title="Bolt pattern">
              <div className="space-y-3">
                <Segmented
                  value={custom ? "custom" : "grid"}
                  onChange={(v) => set("pattern", v)}
                  options={[
                    { value: "grid", label: "Rectangular grid" },
                    { value: "custom", label: "Custom coordinates" },
                  ]}
                />
                {custom ? (
                  <Coordinates value={coords} onChange={(v) => set("coords", v)} />
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {number("rows", "Rows", 3)}
                    {number("cols", "Columns", 2)}
                    {field("spacing", "Row spacing", 3)}
                    {field("gage", "Column gage", 3)}
                  </div>
                )}
              </div>
            </Card>
            {loadFields()}
            {boltInputs}
          </div>
          <div className="space-y-4">
            {boltAnalysis.error !== undefined ? (
              <Issue message={boltAnalysis.error} />
            ) : (
              <>
                <GroupCard
                  analysis={boltAnalysis.value.result}
                  capacity={boltChecks.value ? boltAnalysis.value.result.C * boltChecks.value.capacity : undefined}
                  label="C × governing single-bolt strength"
                >
                  <GroupDiagram
                    analysis={boltAnalysis.value.result}
                    bolts={boltAnalysis.value.bolts}
                    ex={ex}
                    angle={angle}
                  />
                </GroupCard>
                {boltChecks.error !== undefined ? (
                  <Issue message={boltChecks.error} />
                ) : (
                  <>
                    <p className="text-xs text-muted">
                      Single-bolt strength = min(shear, bearing, tearout) ={" "}
                      {fmtQ(boltChecks.value.capacity, "force", units)}. Apply the entered clear distance conservatively
                      in every bolt-force direction. Slip resistance requires a separate service check.
                    </p>
                    <Reports results={[boltChecks.value.shear, boltChecks.value.bearing]} />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {tab === "welds" && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[370px_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <Card
              title="Fillet weld & group geometry"
              subtitle={<SpecRef>Manual Part 8 · Tables 8-4–8-11 shapes</SpecRef>}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Select
                    label="Weld configuration"
                    value={weldShape}
                    onChange={(v) => set("wshape", v)}
                    options={[
                      { value: "line", label: "Single line" },
                      { value: "parallel", label: "Two parallel lines" },
                      { value: "C", label: "C shape" },
                      { value: "L", label: "L shape" },
                      { value: "box", label: "Box" },
                    ]}
                  />
                </div>
                {field("wl", "Vertical length l", 10)}
                {number("kl", "Width ratio k (width = kl)", 0.4)}
                <NumberInput
                  label="Eccentricity ratio a (e = al)"
                  value={l > 0 ? we / l : undefined}
                  onChange={(v) => set("we", v === undefined ? "" : v * l)}
                />
                {field("w", "Weld leg w", 0.25)}
                {field("FEXX", <Sym s="F{EXX}" />, 70, "stress")}
                {number("theta", "Straight weld load angle θ (°)", 0)}
                {field("t", "Thinner part / edge thickness", 0.375)}
                {field("Fy", <Sym s="Base metal F{y}" />, 36, "stress")}
                {field("Fu", <Sym s="Base metal F{u}" />, 58, "stress")}
              </div>
              <p className="mt-3 text-xs text-muted">
                All segments use one weld size. The entered l sets the vertical leg; width is kl. Eccentricity e = al is
                measured from the computed centroid.
              </p>
              <p className="mt-2 text-xs text-muted">
                a = {l > 0 ? fmt(we / l, 4) : "—"}. Group coefficient reference length uses the longest segment.
              </p>
            </Card>
            {loadFields(true)}
            <WeldSizing w={w} t={t} Fu={Fu} Fy={Fy} l={l} FEXX={FEXX} />
          </div>
          <div className="space-y-4">
            {weldAnalysis.error !== undefined ? (
              <Issue message={weldAnalysis.error} />
            ) : (
              <>
                <GroupCard
                  analysis={weldAnalysis.value.result}
                  capacity={available(weldAnalysis.value.report, method)}
                  label="Available weld group strength"
                >
                  <GroupDiagram
                    analysis={weldAnalysis.value.result}
                    segments={weldAnalysis.value.segments}
                    ex={we}
                    angle={wa}
                  />
                </GroupCard>
                <Reports results={[weldAnalysis.value.report, weldAnalysis.value.straight]} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function GroupCard({
  analysis,
  capacity,
  label,
  children,
}: {
  analysis: GroupAnalysis;
  capacity?: number;
  label: string;
  children: React.ReactNode;
}) {
  const { units, method } = useSettings();
  return (
    <Card
      title={`${analysis.method === "IC" ? "Instantaneous center" : "Elastic"} group analysis`}
      subtitle={<SpecRef>{analysis.ref}</SpecRef>}
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Stat label={<Sym s="Coefficient C" />} value={fmt(analysis.C, 5)} />
        <Stat label={label} value={capacity === undefined ? "—" : fmtQ(capacity, "force", units, 5)} sub={method} />
      </div>
      {children}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-medium text-accent">
          Group calculation steps & assumptions
        </summary>
        <div className="mt-2 divide-y divide-line">
          {analysis.steps.map((s, i) => (
            <StepRow key={i} step={s} />
          ))}
        </div>
        {analysis.warnings.map((w) => (
          <p key={w} className="mt-2 text-xs text-warn">
            {w}
          </p>
        ))}
      </details>
    </Card>
  );
}
function Coordinates({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { units } = useSettings();
  const display = value
    .split(";")
    .map((s) =>
      s
        .split(",")
        .map((v) => fmt(toDisplay(Number(v), "length", units), 6))
        .join(", "),
    )
    .join("\n");
  const [draft, setDraft] = useState<string>();
  return (
    <Field
      label={`Bolt coordinates x, y (${unitLabel("length", units)})`}
      hint="One pair per line. Values are saved in engine units in the URL when applied."
    >
      <textarea
        aria-label="Custom bolt coordinates"
        className="min-h-36 w-full rounded-lg border border-line-strong bg-surface p-2 font-mono text-xs text-ink"
        value={draft ?? display}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button
        type="button"
        className="mt-1 rounded border border-line px-3 py-1 text-xs text-accent"
        onClick={() => {
          const raw = (draft ?? display)
            .trim()
            .split(/\n/)
            .map((s) =>
              s
                .split(",")
                .map((v) =>
                  v.trim() === "" ? "" : String(Number(fromDisplay(Number(v), "length", units).toPrecision(10))),
                )
                .join(","),
            )
            .join(";");
          onChange(raw);
          setDraft(undefined);
        }}
      >
        Apply coordinates
      </button>
    </Field>
  );
}
function BoltQuickTable({
  bolt,
  planes,
  t,
  Fu,
  lc,
  hole,
  slot,
  deformation,
}: {
  bolt: BoltSpec;
  planes: number;
  t: number;
  Fu: number;
  lc: number;
  hole: HoleType;
  slot: SlotOrientation;
  deformation: boolean;
}) {
  const { units, method } = useSettings();
  const calc = attempt(() => {
    const dims = nominalHoleDimensions(bolt.d, hole),
      edge = minEdgeDistance(bolt.d),
      space = minSpacing(bolt.d);
    return {
      dims,
      edge,
      space,
      rows: [
        ["Bolt shear", available(boltShear({ bolt, planes }), method), "Manual Table 7-1 format"],
        ["Bolt tension", available(boltTension(bolt), method), "Table J3.2"],
        [
          "Bearing + tearout, entered ply",
          available(
            boltBearing({ d: bolt.d, t, Fu, lc, holeType: hole, slot, deformationConsidered: deformation }),
            method,
          ),
          "Manual Tables 7-4/7-5 format",
        ],
        ...(bolt.group === "A307"
          ? []
          : [
              [
                "Slip · Class A",
                available(slipResistance({ bolt, surface: "A", ns: planes, holeType: hole, slot }), method),
                "Manual Table 7-3 format",
              ],
              [
                "Slip · Class B",
                available(slipResistance({ bolt, surface: "B", ns: planes, holeType: hole, slot }), method),
                "Manual Table 7-3 format",
              ],
            ]),
      ] as [string, number, string][],
    };
  });
  if (calc.error !== undefined) return <Issue message={calc.error} />;
  const c = calc.value!;
  return (
    <Card title={`Selected bolt · ${method} quick values`}>
      <div className={table.wrap}>
        <table className={table.table}>
          <thead>
            <tr>
              <th className={table.th}>Limit state</th>
              <th className={table.th}>Available</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map(([name, value, ref]) => (
              <tr key={name} className={table.tr}>
                <td className={table.td}>
                  {name}
                  <div>
                    <SpecRef>{ref}</SpecRef>
                  </div>
                </td>
                <td className={table.td}>{fmtQ(value, "force", units)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 space-y-1 text-xs text-muted">
        <p>
          Hole: {fmtQ(c.dims.width, "length", units)} × {fmtQ(c.dims.length, "length", units)}{" "}
          <SpecRef>Table J3.3</SpecRef>
        </p>
        <p>
          Minimum standard-hole edge: {fmtQ(c.edge, "length", units)} <SpecRef>Table J3.4</SpecRef>
        </p>
        <p>
          Spacing: min {fmtQ(c.space.min, "length", units)}, preferred {fmtQ(c.space.preferred, "length", units)}{" "}
          <SpecRef>§J3.4</SpecRef>
        </p>
        {bolt.group !== "A307" && (
          <p>
            Pretension: {fmtQ(minimumPretension(bolt.d, bolt.group), "force", units)} <SpecRef>Table J3.1</SpecRef>
          </p>
        )}
        <p>
          Computed values before Manual rounding. Slip quick values use h{<sub>f</sub>} = 1. Nonstandard holes require
          edge-distance increments from Table J3.5.
        </p>
      </div>
    </Card>
  );
}
function WeldSizing({
  w,
  t,
  Fu,
  Fy,
  l,
  FEXX,
}: {
  w: number;
  t: number;
  Fu: number;
  Fy: number;
  l: number;
  FEXX: number;
}) {
  const { units, method } = useSettings();
  const calc = attempt(() => ({
    min: minFilletWeldSize(t),
    max: maxFilletWeldSize(t),
    base: weldBaseMetalShear({ t, Fy, Fu, length: l }),
    per: filletWeldPerInch(w * 16, method, FEXX),
    one: minimumBaseMetalThickness(w * 16, Fu, 1),
    two: minimumBaseMetalThickness(w * 16, Fu, 2),
  }));
  if (calc.error !== undefined) return <Issue message={calc.error} />;
  const c = calc.value!;
  return (
    <Card title="Weld size & base metal">
      <div className="space-y-2 text-xs text-muted">
        <p>
          Minimum leg {fmtQ(c.min, "length", units)} <SpecRef>Table J2.4</SpecRef>
        </p>
        <p>
          Maximum along edge {fmtQ(c.max, "length", units)} <SpecRef>§J2.2b</SpecRef>
        </p>
        {(w < c.min || w > c.max || l < 4 * w) && (
          <Issue message="Weld size or length is outside the entered edge / minimum-length limits. Revise the detail before using group strength." />
        )}
        <p>
          Longitudinal weld strength: {fmtQ(c.per, "lineLoad", units)} <SpecRef>Manual Part 8</SpecRef>
        </p>
        <p>
          E70 rupture matching thickness: one weld line {fmtQ(c.one, "length", units)}, two weld lines{" "}
          {fmtQ(c.two, "length", units)} (one resisting base shear plane). <SpecRef>Manual Part 9</SpecRef>
        </p>
        <p>Matching thickness assumes E70 and no directional enhancement.</p>
        <CalcReport result={c.base} />
      </div>
    </Card>
  );
}
