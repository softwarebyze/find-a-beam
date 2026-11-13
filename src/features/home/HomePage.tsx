import { Link, useNavigate } from "react-router";
import { ShapePicker } from "@/components/ShapePicker";
import { SHAPES, SHAPE_TYPES, slugOf } from "@/data/shapes";

const TOOLS = [
  {
    to: "/shapes",
    title: "Shape explorer",
    ref: "Manual Part 1",
    body: "All 2,299 shapes in the AISC Shapes Database v16.0. Filter and sort on any of 80+ properties, in US or SI units.",
  },
  {
    to: "/beam",
    title: "Beam design",
    ref: "Manual Part 3 · AISC 360 Ch. F, G",
    body: "Enter span, loads and bracing. Get the lightest W-shape that satisfies flexure, shear and deflection, ranked like Table 3-2.",
  },
  {
    to: "/column",
    title: "Column design",
    ref: "Manual Part 4 · AISC 360 Ch. E",
    body: "Available axial strength versus effective length, in the format of Table 4-1, with a lightest-section selector.",
  },
  {
    to: "/member",
    title: "Member check",
    ref: "AISC 360 Ch. D–H",
    body: "Check one member for tension, compression, flexure, shear and combined forces. Every equation is cited in the calc report.",
  },
  {
    to: "/diagrams",
    title: "Beam diagrams & formulas",
    ref: "Manual Table 3-23",
    body: "Shear, moment and deflection for the standard support and load cases, with the closed-form equations.",
  },
  {
    to: "/reference",
    title: "Reference",
    ref: "Manual Part 2 · ASCE 7-22",
    body: "Steel material properties, resistance and safety factors, and the LRFD and ASD load combinations.",
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const counts = SHAPE_TYPES.map((t) => ({ ...t, n: SHAPES.filter((s) => s.type === t.type).length }));
  return (
    <div className="space-y-10">
      <section className="grid gap-8 pt-4 lg:grid-cols-[1.25fr_1fr] lg:items-end">
        <div>
          <div className="mb-3 text-xs font-medium uppercase tracking-wider text-accent">
            AISC Steel Construction Manual · 16th Edition
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            Steel design without the page-flipping.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted">
            Every shape in the Manual, searchable on any property. Beam, column and beam-column design to ANSI/AISC
            360-22, with each calculation cited to its equation.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <ShapePicker
            label="Look up a shape"
            onChange={(s) => navigate(`/shapes/${slugOf(s.label)}`)}
            value={undefined}
            placeholder="W18×50, HSS6×6×1/2, L4×4×1/2 …"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {counts.map((t) => (
              <Link
                key={t.type}
                to={`/shapes?type=${t.type}`}
                className="rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:border-line-strong hover:text-ink"
              >
                <span className="font-mono font-medium text-ink">{t.type}</span> <span className="num">{t.n}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="group rounded-xl border border-line bg-surface p-5 transition hover:border-line-strong hover:shadow-sm"
          >
            <div className="font-mono text-[11px] text-faint">{t.ref}</div>
            <div className="mt-2 flex items-center justify-between text-base font-semibold text-ink">
              {t.title}
              <span className="text-faint transition group-hover:translate-x-0.5 group-hover:text-accent">→</span>
            </div>
            <p className="mt-1.5 text-sm text-muted">{t.body}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
