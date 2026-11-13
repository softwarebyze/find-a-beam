import { Link, useNavigate } from "react-router";
import { NAV_GROUPS } from "@/app/nav";
import { ShapePicker } from "@/components/ShapePicker";
import { SHAPES, SHAPE_TYPES, slugOf } from "@/data/shapes";

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
            Every shape in the Manual, searchable on any property. Members, connections, composite beams and stability
            to ANSI/AISC 360-22, with each calculation cited to its equation.
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

      {NAV_GROUPS.map((group) => (
        <section key={group.label}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">{group.label}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className="group rounded-xl border border-line bg-surface p-5 transition hover:border-line-strong hover:shadow-sm"
              >
                <div className="font-mono text-[11px] text-faint">{t.ref}</div>
                <div className="mt-2 flex items-center justify-between text-base font-semibold text-ink">
                  {t.label}
                  <span className="text-faint transition group-hover:translate-x-0.5 group-hover:text-accent">→</span>
                </div>
                <p className="mt-1.5 text-sm text-muted">{t.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
