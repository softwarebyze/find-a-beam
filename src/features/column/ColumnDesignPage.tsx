import { useMemo } from "react";
import { Link } from "react-router";
import { alignmentK, EFFECTIVE_LENGTH_CASES } from "@/aisc";
import { useSettings } from "@/app/settings";
import { CalcReport, StepRow } from "@/components/CalcReport";
import { ShapePicker } from "@/components/ShapePicker";
import { LineChart } from "@/components/charts/LineChart";
import {
  Badge,
  Card,
  EmptyState,
  NumberInput,
  PageHeader,
  QuantityInput,
  RatioBar,
  Segmented,
  Select,
  SpecRef,
  Stat,
  Sym,
  table,
} from "@/components/ui";
import { materialById, materialsFor } from "@/data/materials";
import { displayLabel, findShape, num, slugOf } from "@/data/shapes";
import { CrossSection } from "@/features/drawings/CrossSection";
import { fmt, fmtQ, toDisplay, unitLabel, type Quantity } from "@/lib/units";
import {
  COLUMN_FAMILIES,
  columnFamilyById,
  columnFamilyOf,
  defaultMaterial,
  equivalentLc,
  evaluateColumn,
  governingAxial,
  leastR,
  lightestPerGroup,
  nominalGroups,
  searchColumns,
  strengthCurve,
  strengthTable,
  tableLengths,
  transitionSlenderness,
  type ColumnLengths,
} from "./column-design";
import { parseK, resolveK } from "./effective-length";
import { useQueryState } from "./url-state";

export function ColumnDesignPage() {
  const q = useQueryState();
  const { units, method } = useSettings();
  const requested = findShape(q.str("shape"));
  const family = (requested && columnFamilyOf(requested)) ?? columnFamilyById(q.str("family")) ?? COLUMN_FAMILIES[0]!;
  const materials = materialsFor(family.family);
  const proposedMaterial = materialById(q.str("mat"));
  const material =
    proposedMaterial && materials.includes(proposedMaterial) ? proposedMaterial : defaultMaterial(family);
  const direct = q.str("load", "types") === "direct";
  const loads = {
    D: q.numOr("D", 200),
    L: q.numOr("L", 100),
    Lr: q.numOr("Lr", 0),
    S: q.numOr("S", 0),
    W: q.numOr("W", 0),
    E: q.numOr("E", 0),
  };
  const combined = governingAxial(loads, method);
  const Pr = direct ? q.numOr("P", 400) : Math.max(0, combined.value);
  const Lx = q.numOr("Lx", 168),
    Ly = q.numOr("Ly", 168),
    Lz = q.numOr("Lz", 168);
  const chartK = (axis: string) =>
    alignmentK({
      GA: Math.max(0, q.numOr(`GA${axis}`, 1)),
      GB: Math.max(0, q.numOr(`GB${axis}`, 1)),
      sway: q.bool(`sway${axis}`, true),
    });
  const Kx = q.str("Kx") === "alignment" ? chartK("x") : resolveK(parseK(q.str("Kx"))),
    Ky = q.str("Ky") === "alignment" ? chartK("y") : resolveK(parseK(q.str("Ky"))),
    Kz = resolveK(parseK(q.str("Kz")));
  const e5 = family.id === "L" && q.bool("e5");
  const lengths: ColumnLengths = {
    Lcx: e5 ? Lx : Lx * Kx,
    Lcy: e5 ? Lx : Ly * Ky,
    Lcz: Lz * Kz,
    ...(e5
      ? {
          singleAngle: {
            connectedLeg: q.str("leg") === "short" ? ("short" as const) : ("long" as const),
            trussWeb: q.bool("truss"),
          },
        }
      : {}),
    ...(family.id === "2L"
      ? {
          connectorSpacing: q.numOr("spacing", 24),
          connectorType:
            q.str("connector") === "welded-pretensioned" ? ("welded-pretensioned" as const) : ("snug" as const),
        }
      : {}),
  };
  const invalid = Pr < 0 || [Lx, Ly, Lz].some((v) => v < 0);
  const group = q.str("depth");
  // Numeric dependencies are serialized so unrelated query changes do not rerun the full search.
  const searchKey = JSON.stringify({ family: family.id, mat: material.id, lengths, Pr, method, group, invalid });
  const search = useMemo(
    () =>
      invalid
        ? { candidates: [], unsupported: [] }
        : searchColumns({ family, material, lengths, Pr, method, groups: group ? [group] : undefined }),
    [searchKey],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const passing = search.candidates.filter((c) => c.pass);
  const best = lightestPerGroup(search.candidates);
  const selected = requested ?? passing[0]?.shape ?? search.candidates[0]?.shape;
  const evaluation = selected && !invalid ? evaluateColumn(selected, material, lengths, Pr, method) : undefined;
  const current = evaluation && "result" in evaluation ? evaluation : undefined;
  const detailKey = `${selected?.label}/${material.id}/${units}/${JSON.stringify(lengths)}`;
  const rows = useMemo(
    () => (selected ? strengthTable(selected, material, tableLengths(units), lengths) : []),
    [detailKey],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const eqLc = selected ? equivalentLc(selected, lengths) : 0;
  const transition = selected ? leastR(selected) * transitionSlenderness(material.Fy) : 0;
  const maxLc = Math.max(tableLengths(units).at(-1)!, transition * 1.15, eqLc * 1.15);
  const curve = useMemo(
    () => (selected ? strengthCurve(selected, material, "LRFD", maxLc, 120, lengths) : []),
    [detailKey, maxLc],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const quantity = (key: string, label: string, value: number, quantity: Quantity = "span") => (
    <QuantityInput
      key={key}
      label={<Sym s={label} />}
      quantity={quantity}
      value={value}
      onChange={(v) => q.set({ [key]: v ?? 0 })}
    />
  );
  const kPicker = (axis: string) => {
    const key = `K${axis}`,
      selection = parseK(q.str(key));
    return (
      <div className="space-y-1.5" key={axis}>
        <Select
          label={<Sym s={`K{${axis}} end restraint`} />}
          value={q.str(key) === "alignment" ? "alignment" : selection.kind === "case" ? selection.id : "custom"}
          onChange={(v) => q.set({ [key]: v === "custom" ? "1" : v })}
          options={[
            ...EFFECTIVE_LENGTH_CASES.map((c) => ({
              value: c.id,
              label: `(${c.id}) K = ${c.recommendedK} · ${c.description}`,
            })),
            { value: "custom", label: "Custom K" },
            ...(axis !== "z" ? [{ value: "alignment", label: "Use alignment chart" }] : []),
          ]}
        />
        {q.str(key) !== "alignment" && selection.kind === "custom" && (
          <NumberInput
            label="Custom K"
            value={selection.K}
            onChange={(v) => q.set({ [key]: v && v > 0 ? String(v) : "1" })}
          />
        )}
        {q.str(key) === "alignment" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {["GA", "GB"].map((g) => (
                <NumberInput
                  key={g}
                  label={`${g} · ${axis}`}
                  value={q.numOr(`${g}${axis}`, 1)}
                  onChange={(v) => q.set({ [`${g}${axis}`]: Math.max(0, v ?? 0) })}
                />
              ))}
            </div>
            <Select
              label="Frame sidesway"
              value={q.bool(`sway${axis}`, true) ? "sway" : "braced"}
              onChange={(v) => q.set({ [`sway${axis}`]: v === "sway" })}
              options={[
                { value: "sway", label: "Sidesway permitted" },
                { value: "braced", label: "Sidesway inhibited" },
              ]}
            />
            <p className="num text-xs text-muted">
              K = {fmt(chartK(axis), 4)} · <SpecRef>Commentary Eqs. C-A-7-1/2</SpecRef>
            </p>
            <Link className="text-xs text-accent" to="/stability">
              Joint stiffness calculator and assumptions
            </Link>
          </div>
        )}
      </div>
    );
  };
  const chooseShape = (s: NonNullable<typeof selected>) =>
    q.set({ shape: slugOf(s.label), family: columnFamilyOf(s)?.id ?? family.id });
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Manual Part 4 · ANSI/AISC 360-22"
        title="Column design"
        description="Find the lightest passing section and inspect its axial compression strength."
      />
      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4 no-print">
          <Card
            title="Axial demand"
            actions={<SpecRef>{method === "LRFD" ? "ASCE 7-22 §2.3.1" : "ASCE 7-22 §2.4.1"}</SpecRef>}
          >
            <div className="space-y-3">
              <Segmented
                value={direct ? "direct" : "types"}
                onChange={(load) => q.set({ load })}
                options={[
                  { value: "types", label: "By load type" },
                  { value: "direct", label: "Direct demand" },
                ]}
                ariaLabel="Axial load input"
              />
              {direct ? (
                quantity("P", method === "LRFD" ? "P{u}" : "P{a}", Pr, "force")
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(loads).map(([key, value]) => quantity(key, key, value, "force"))}
                </div>
              )}
              <p className="text-xs text-muted">
                Compression positive. Wind and seismic are signed, strength-level effects. Supply the controlling
                direction; evaluate the opposite direction separately.
              </p>
              <div className="rounded-lg bg-surface-2 p-3 text-sm">
                <div className="font-mono text-xs text-muted">
                  {direct ? "Direct required strength" : `${combined.combo.id}: ${combined.combo.label}`}
                </div>
                <div className="num mt-1 font-semibold">{fmtQ(Pr, "force", units)}</div>
              </div>
              {!direct && combined.value <= 0 && (
                <p className="text-xs text-warn">No compression demand; use the member check for tension.</p>
              )}
              {!direct && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted">All combinations</summary>
                  <div className="mt-2 max-h-48 overflow-auto">
                    {combined.all.map((c) => (
                      <div key={c.combo.id} className="flex justify-between gap-2 border-b border-line py-1">
                        <span>{c.combo.label}</span>
                        <span className="num whitespace-nowrap">{fmtQ(c.value, "force", units)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </Card>
          <Card title="Lengths & end restraint" subtitle={<SpecRef>Commentary Table C-A-7.1</SpecRef>}>
            <div className="space-y-3">
              <p className="text-xs text-muted">
                {family.id === "L" ? "For single angles, Lx/Ly are the principal w/z-axis lengths. " : ""}Recommended
                design K values. Effective length Lc = KL; determine frame stability in the structural analysis.
              </p>
              {(["x", "y", "z"] as const).map((axis) => (
                <div key={axis} className="space-y-2 border-t border-line pt-2">
                  {quantity(
                    `L${axis}`,
                    `L{${axis}}${axis === "z" ? " (torsional)" : ""}`,
                    axis === "x" ? Lx : axis === "y" ? Ly : Lz,
                  )}
                  {kPicker(axis)}
                </div>
              ))}
              {family.id === "L" && (
                <>
                  <label className="flex gap-2 text-xs">
                    <input type="checkbox" checked={e5} onChange={(e) => q.set({ e5: e.target.checked })} />
                    Use §E5 single-angle connection provisions
                  </label>
                  {e5 && (
                    <>
                      <p className="text-xs text-warn">
                        Uses physical Lx for both axes, without K; §E5 connection and loading conditions must be
                        satisfied.
                      </p>
                      <Select
                        label="Connected leg"
                        value={q.str("leg", "long")}
                        onChange={(leg) => q.set({ leg })}
                        options={[
                          { value: "long", label: "Long leg" },
                          { value: "short", label: "Short leg" },
                        ]}
                      />
                      <label className="flex gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={q.bool("truss")}
                          onChange={(e) => q.set({ truss: e.target.checked })}
                        />
                        Planar truss web member
                      </label>
                    </>
                  )}
                </>
              )}
              {family.id === "2L" && (
                <>
                  {quantity("spacing", "Connector spacing a", q.numOr("spacing", 24))}
                  <Select
                    label="Intermediate connectors · §E6"
                    value={q.str("connector", "snug")}
                    onChange={(connector) => q.set({ connector })}
                    options={[
                      { value: "snug", label: "Snug-tight bolts" },
                      { value: "welded-pretensioned", label: "Welded / pretensioned bolts" },
                    ]}
                  />
                </>
              )}
            </div>
          </Card>
          <Card title="Section & material">
            <div className="space-y-3">
              <Select
                label="Shape family"
                value={family.id}
                onChange={(id) => q.set({ family: id, shape: null, depth: null, mat: null })}
                options={COLUMN_FAMILIES.map((f) => ({ value: f.id, label: f.label }))}
              />
              <Select
                label="Nominal depth"
                value={group}
                onChange={(depth) => q.set({ depth, shape: null })}
                options={[
                  { value: "", label: "All nominal depths" },
                  ...nominalGroups(family).map((g) => ({ value: g, label: g })),
                ]}
              />
              <Select
                label="Material"
                value={material.id}
                onChange={(mat) => q.set({ mat })}
                options={materials.map((m) => ({ value: m.id, label: m.name }))}
              />
              <p className="text-xs text-muted">
                Fy = {fmtQ(material.Fy, "stress", units)} · Fu = {fmtQ(material.Fu, "stress", units)}{" "}
                <SpecRef>Manual Tables 2-4, 2-5</SpecRef>
              </p>
              <ShapePicker label="Inspect a specific shape" value={selected} onChange={chooseShape} />
            </div>
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          {invalid && (
            <EmptyState title="Check the input values">Demand and physical lengths must be nonnegative.</EmptyState>
          )}
          <Card
            title={`${passing.length} passing shapes · lightest first`}
            subtitle={
              <>
                Bold sections are the lightest passing shape at each nominal depth.{" "}
                <SpecRef>{family.table} format · Ch. E</SpecRef>
              </>
            }
            bodyClassName="p-0"
          >
            <div className="max-h-[440px] overflow-auto">
              <table className={table.table}>
                <thead>
                  <tr>
                    {[
                      "Shape",
                      `Weight (${unitLabel("weight", units)})`,
                      `${method === "LRFD" ? "φcPn" : "Pn/Ωc"} (${unitLabel("force", units)})`,
                      "D/C",
                      "Limit state / axis",
                      "Lc/r",
                    ].map((s) => (
                      <th className={table.th} key={s}>
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {passing.map((c) => (
                    <tr
                      key={c.shape.label}
                      className={`${table.tr} ${selected?.label === c.shape.label ? "bg-accent-soft" : ""} ${best.has(c.shape.label) ? "font-semibold" : ""}`}
                    >
                      <td className={table.td}>
                        <button
                          className="cursor-pointer font-mono text-accent hover:underline"
                          onClick={() => chooseShape(c.shape)}
                        >
                          {displayLabel(c.shape.label)}
                        </button>
                      </td>
                      <td className={table.td}>{fmtQ(num(c.shape, "W"), "weight", units)}</td>
                      <td className={table.td}>{fmtQ(c.available, "force", units)}</td>
                      <td className={`${table.td} text-pass`}>{fmt(c.ratio)}</td>
                      <td className={table.td}>
                        {c.result.governing} /{" "}
                        {c.result.governing.startsWith("FB")
                          ? c.shape.type === "L"
                            ? c.axis === "x"
                              ? "w"
                              : "z"
                            : c.axis
                          : "coupled"}
                      </td>
                      <td className={table.td}>{fmt(c.result.slenderness)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!passing.length && !invalid && (
              <div className="p-5 text-sm text-muted">
                No passing sections. Reduce demand or effective length, or change the family / depth filter.
              </div>
            )}
            {search.unsupported.length > 0 && (
              <details className="border-t border-line p-3 text-xs text-warn">
                <summary className="cursor-pointer">
                  {search.unsupported.length} shapes skipped · unavailable engine checks
                </summary>
                <ul className="mt-2 space-y-1">
                  {search.unsupported.map((s) => (
                    <li key={s.shape.label}>
                      {displayLabel(s.shape.label)}: {s.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
          {selected && (
            <>
              <Card
                title={displayLabel(selected.label)}
                actions={
                  <Link
                    className="text-xs text-accent no-print hover:underline"
                    to={`/member?shape=${slugOf(selected.label)}&mat=${material.id}&Lcx=${lengths.Lcx}&Lcy=${lengths.Lcy}&Lcz=${lengths.Lcz}&P=${Pr}`}
                  >
                    Check combined forces →
                  </Link>
                }
              >
                <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <CrossSection shape={selected} maxHeight={260} />
                  <div className="space-y-3">
                    {current ? (
                      <>
                        <Stat
                          label={method === "LRFD" ? "φcPn" : "Pn/Ωc"}
                          value={fmtQ(current.available, "force", units)}
                          sub={<SpecRef>§E1 · {current.result.section}</SpecRef>}
                          tone={current.pass ? "pass" : "fail"}
                        />
                        <RatioBar ratio={current.ratio} label="Axial D/C" />
                        <div className="flex gap-2">
                          <Badge tone={current.pass ? "pass" : "fail"}>{current.pass ? "PASS" : "FAIL"}</Badge>
                          <SpecRef>{current.result.governing}</SpecRef>
                        </div>
                        {(["x", "y", "z"] as const).map((a) => (
                          <StepRow
                            key={a}
                            step={{
                              label: `${a}-axis effective length`,
                              symbol: `L{c${a}}`,
                              value: lengths[`Lc${a}`],
                              quantity: "span",
                              expr: e5 && a !== "z" ? "L (physical work-point length)" : "K × L",
                              ref: e5 && a !== "z" ? "§E5" : "§E2",
                            }}
                          />
                        ))}
                      </>
                    ) : (
                      <p className="text-sm text-warn">
                        {evaluation && "message" in evaluation
                          ? evaluation.message
                          : "Correct the input values to evaluate this section."}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
              {curve.length > 0 && (
                <Card
                  title="Axial compression strength versus effective length"
                  subtitle={<SpecRef>§E3 · Eqs. E3-2, E3-3</SpecRef>}
                >
                  <LineChart
                    series={[
                      {
                        id: "compression",
                        label: "φcPn · equal effective lengths",
                        points: curve.map((p) => ({
                          x: toDisplay(p.x, "span", units),
                          y: toDisplay(p.y, "force", units),
                        })),
                      },
                    ]}
                    xLabel={`Lc (${unitLabel("span", units)})`}
                    yLabel={`φcPn (${unitLabel("force", units)})`}
                    yMin={0}
                    xMin={0}
                    formatX={(v) => fmt(v)}
                    formatY={(v) => fmt(v)}
                    markers={[
                      {
                        x: toDisplay(eqLc, "span", units),
                        label: "Current flexural equivalent Lc",
                        color: "var(--accent)",
                      },
                      {
                        x: toDisplay(transition, "span", units),
                        label: "E3 inelastic → elastic",
                        color: "var(--muted)",
                      },
                    ]}
                  />
                  <p className="mt-2 text-xs text-muted">
                    E3 transition Lc/r = 4.71√(E/Fy) = {fmt(transitionSlenderness(material.Fy), 4)}. Curve and table use
                    Lcx = Lcy = Lcz; the current marker uses the flexural equivalent length {fmtQ(eqLc, "span", units)}.
                    Torsional, local buckling, and built-up / connection effects can govern separately; use the
                    actual-length report below.
                  </p>
                </Card>
              )}
              <Card
                title="Available strength in axial compression"
                subtitle={
                  <>
                    Equal effective lengths · {material.name} · Fy = {fmtQ(material.Fy, "stress", units)}{" "}
                    <SpecRef>{family.table} format · §E1–E7</SpecRef>
                  </>
                }
                bodyClassName="p-0"
              >
                <div className="max-h-[460px] overflow-auto">
                  <table className={table.table}>
                    <thead>
                      <tr>
                        <th className={table.th}>Lc ({unitLabel("span", units)})</th>
                        <th className={`${table.th} ${method === "LRFD" ? "text-accent" : ""}`}>
                          φcPn ({unitLabel("force", units)})
                        </th>
                        <th className={`${table.th} ${method === "ASD" ? "text-accent" : ""}`}>
                          Pn/Ωc ({unitLabel("force", units)})
                        </th>
                        <th className={table.th}>Lc/r</th>
                        <th className={table.th}>Governs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.Lc} className={table.tr}>
                          <td className={table.td}>{fmt(toDisplay(r.Lc, "span", units))}</td>
                          <td
                            className={`${table.td} ${method === "LRFD" ? "bg-accent-soft/40 font-semibold text-accent" : ""}`}
                          >
                            {fmt(toDisplay(r.phiPn, "force", units), 4)}
                          </td>
                          <td
                            className={`${table.td} ${method === "ASD" ? "bg-accent-soft/40 font-semibold text-accent" : ""}`}
                          >
                            {fmt(toDisplay(r.PnOmega, "force", units), 4)}
                          </td>
                          <td className={`${table.td} ${r.over200 ? "text-warn" : ""}`}>
                            {fmt(r.slenderness)}
                            {r.over200 ? " *" : ""}
                          </td>
                          <td className={table.td}>{r.governing}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2 p-3 text-xs">
                  {(
                    [
                      ["A", "area"],
                      ["rx", "length"],
                      ["ry", "length"],
                      ["rz", "length"],
                    ] as const
                  )
                    .filter(([p]) => num(selected, p) !== undefined)
                    .map(([p, quantity]) => (
                      <span key={p}>
                        {p} = <strong className="num">{fmtQ(num(selected, p), quantity, units)}</strong>
                      </span>
                    ))}
                  <span>rx/ry = {fmt((num(selected, "rx") ?? 0) / (num(selected, "ry") ?? 1))}</span>
                  <SpecRef>AISC Shapes Database v16.0</SpecRef>
                </div>
                <p className="px-3 pb-3 text-xs text-muted">
                  * Lc/r exceeds 200, §E2 user note. Values are engine calculations, displayed without Manual rounding.
                </p>
              </Card>
              {current && (
                <Card title="Compression calculation report" subtitle={<SpecRef>ANSI/AISC 360-22 · Chapter E</SpecRef>}>
                  <CalcReport result={current.result} demand={Pr} />
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
