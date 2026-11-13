import { useMemo } from "react";
import { BEAM_CASES, beamCaseById, DEFAULT_BEAM_PARAMETERS, type BeamParameters } from "@/analysis/beam-cases";
import { useSettings } from "@/app/settings";
import { Card, PageHeader, QuantityInput, SpecRef, Stat, Sym, Button } from "@/components/ui";
import { ShapePicker } from "@/components/ShapePicker";
import { findShape, req, slugOf } from "@/data/shapes";
import { E } from "@/data/materials";
import { fmtQ } from "@/lib/units";
import { BeamDiagrams, LoadingSchematic } from "./BeamPlot";
import { useBeamUrl } from "@/features/beam/url";

export function DiagramsPage() {
  const url = useBeamUrl(),
    { units } = useSettings();
  const selected = beamCaseById(url.text("case", "simple-uniform"));
  const shape = findShape(url.text("shape", ""));
  const p = Object.fromEntries(
    Object.entries(DEFAULT_BEAM_PARAMETERS).map(([key, value]) => [key, url.number(key, value)]),
  ) as unknown as BeamParameters;
  if (shape) p.I = req(shape, "Ix");
  const result = useMemo(() => {
    try {
      return { beam: selected.solve(p), error: "" };
    } catch (error) {
      return { beam: undefined, error: error instanceof Error ? error.message : "Invalid beam parameters." };
    }
  }, [selected, p.L, p.w, p.P, p.P2, p.a, p.b, p.E, p.I]);
  const cards = useMemo(() => BEAM_CASES.map((c) => ({ c, beam: c.solve(DEFAULT_BEAM_PARAMETERS) })), []);
  const beam = result.beam;
  return (
    <>
      <PageHeader
        eyebrow="Manual Part 3"
        title="Beam diagrams and formulas"
        description={
          <>
            Elastic shears, moments and deflections for prismatic beams. <SpecRef>Manual Table 3-23</SpecRef>
          </>
        }
        actions={<Button onClick={() => window.print()}>Print calculation</Button>}
      />
      <div className="grid items-start gap-4 md:grid-cols-[280px_minmax(0,1fr)] print:block">
        <div className="space-y-4 no-print">
          <Card
            title="Load case"
            subtitle={`${BEAM_CASES.length} support and loading arrangements`}
            bodyClassName="p-2"
          >
            <div className="grid max-h-[590px] grid-cols-2 gap-2 overflow-auto md:grid-cols-1">
              {cards.map(({ c, beam: preview }) => (
                <button
                  key={c.id}
                  onClick={() => url.set("case", c.id)}
                  aria-pressed={selected.id === c.id}
                  className={`rounded-lg border p-2 text-left transition ${selected.id === c.id ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"}`}
                >
                  <span className="text-xs font-medium text-ink">{c.name}</span>
                  <LoadingSchematic loading={preview.loading} compact />
                </button>
              ))}
            </div>
          </Card>
          <Card title="Case parameters">
            <div className="grid grid-cols-2 gap-3">
              {selected.parameters.map((q) => (
                <QuantityInput
                  key={q.key}
                  label={q.label}
                  quantity={q.quantity}
                  value={p[q.key]}
                  onChange={(v) => url.set(q.key, v)}
                />
              ))}
              <QuantityInput
                label="Elastic modulus E"
                quantity="stress"
                value={p.E}
                onChange={(v) => url.set("E", v)}
              />
              <QuantityInput
                label="Moment of inertia Iₓ"
                quantity="inertia"
                value={p.I}
                onChange={(v) => url.update({ I: v, shape: undefined })}
              />
            </div>
            <div className="mt-4">
              <ShapePicker
                label="Optional section for Iₓ"
                value={shape}
                onChange={(s) => url.set("shape", slugOf(s.label))}
              />
            </div>
            {shape && (
              <Button variant="ghost" onClick={() => url.set("shape", undefined)}>
                Use manual inertia
              </Button>
            )}
            <p className="mt-3 text-xs text-faint">
              L is total beam length. For continuous beams each span is L/2; for overhangs the support spacing is L − a.
              E = {fmtQ(E, "stress", units)} for steel. <SpecRef>Manual Table 2-4</SpecRef>
            </p>
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          {result.error && (
            <div role="alert" className="rounded-lg bg-fail-soft p-4 text-sm text-fail">
              {result.error}
            </div>
          )}
          {beam && (
            <>
              <Card title={selected.name} subtitle={<SpecRef>Manual Table 3-23</SpecRef>}>
                <LoadingSchematic loading={beam.loading} />
                <div className="mb-5 grid gap-2 sm:grid-cols-3">
                  <Stat label="Maximum |V|" value={fmtQ(Math.abs(beam.max.V.value), "force", units)} />
                  <Stat label="Maximum |M|" value={fmtQ(Math.abs(beam.max.M.value), "moment", units)} />
                  <Stat label="Maximum |Δ|" value={fmtQ(Math.abs(beam.max.delta.value), "length", units)} />
                </div>
                <BeamDiagrams result={beam} />
              </Card>
              <Card
                title="Reactions and formulas"
                subtitle={
                  <>
                    Exact integration with support compatibility · <SpecRef>Manual Table 3-23</SpecRef>
                  </>
                }
              >
                <div className="mb-4 flex flex-wrap gap-3">
                  {beam.reactions.map((r, i) => (
                    <div key={i} className="rounded-lg border border-line px-3 py-2 text-xs">
                      <div className="text-muted">
                        Support {String.fromCharCode(65 + i)} · x = {fmtQ(r.x, "span", units)}
                      </div>
                      <div className="num mt-1">
                        R = {fmtQ(r.force, "force", units)}
                        {beam.loading.supports[i]?.fixed && <> · C = {fmtQ(r.moment, "moment", units)}</>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="divide-y divide-line">
                  {(["definitions", "R", "V", "M", "delta", "Vmax", "Mmax", "deltaMax"] as const)
                    .filter((key) => beam.formulas[key])
                    .map((key) => (
                      <div key={key} className="py-2 text-sm leading-relaxed">
                        <Sym s={beam.formulas[key]!} />
                      </div>
                    ))}
                </div>
                <p className="mt-3 text-xs text-muted">
                  Downward loads and deflections are positive; sagging moments are positive. R is upward and C is an
                  external counterclockwise support couple. H is a unit step; ⟨x − a⟩ = max(0, x − a). Support
                  deflection is zero; fixed supports also have zero rotation. Deflections exclude shear deformation.
                </p>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
