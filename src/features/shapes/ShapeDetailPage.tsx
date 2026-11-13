import clsx from "clsx";
import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { useSettings } from "@/app/settings";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { displayLabel, findShape, labelFromSlug, SHAPES, slugOf, type Shape } from "@/data/shapes";
import { CrossSection } from "@/features/drawings/CrossSection";
import { fmtQ } from "@/lib/units";
import { Classification, DesignStrengths, MomentChart } from "./DesignCard";
import { designSummary, momentCurve } from "./design";
import {
  categoryOf,
  fmtExact,
  manualTableOf,
  neighbours,
  noteText,
  normalizeQuery,
  queryShapes,
  seriesKey,
  seriesOf,
  typeInfo,
} from "./logic";
import { groupedProperties, PropertyGroupTable } from "./PropertyTables";
import { ButtonLink, Icon } from "./shared";

export function ShapeDetailPage() {
  const { slug = "" } = useParams();
  const shape = useMemo(() => findShape(slug), [slug]);
  return shape ? <ShapeDetail key={shape.label} shape={shape} /> : <NotFoundShape slug={slug} />;
}

function NotFoundShape({ slug }: { slug: string }) {
  const label = labelFromSlug(slug);
  const suggestions = useMemo(() => {
    const q = normalizeQuery(label);
    const stem = q.includes("X") ? q.slice(0, q.lastIndexOf("X") + 1) : q;
    return queryShapes(SHAPES, { type: "ALL", q: stem, filters: [], sort: { key: "label", dir: "asc" } }).slice(0, 12);
  }, [label]);
  return (
    <>
      <PageHeader
        eyebrow="Shapes"
        title="Shape not found"
        description={
          <>
            No shape named <span className="font-mono text-ink">{label}</span> in the AISC Shapes Database v16.0.
          </>
        }
      />
      <EmptyState title={suggestions.length ? "Similar designations" : "Try the shape explorer"}>
        {suggestions.length > 0 && (
          <div className="mx-auto mt-3 flex max-w-2xl flex-wrap justify-center gap-1.5">
            {suggestions.map((s) => (
              <Link
                key={s.label}
                to={`/shapes/${slugOf(s.label)}`}
                className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[13px] text-ink hover:border-accent hover:text-accent"
              >
                {displayLabel(s.label)}
              </Link>
            ))}
          </div>
        )}
        <div className="mt-4">
          <Link to="/shapes" className="text-accent hover:underline">
            Browse all shapes
          </Link>
        </div>
      </EmptyState>
    </>
  );
}

function ShapeDetail({ shape }: { shape: Shape }) {
  const { units, method } = useSettings();
  const slug = slugOf(shape.label);
  const label = displayLabel(shape.label);
  const d = useMemo(() => designSummary(shape), [shape]);
  const curve = useMemo(
    () => (d.flexX.ok ? momentCurve(shape, d.material, d.flexX.value, method) : undefined),
    [shape, d, method],
  );
  const groups = useMemo(() => groupedProperties(shape), [shape]);
  const { lighter, heavier } = neighbours(shape);
  const series = seriesOf(shape);
  const cat = categoryOf(shape);
  const typeName = typeInfo(cat).name;
  const note = noteText(shape);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-xs text-muted">
        <Link to="/shapes" className="hover:text-ink">
          Shapes
        </Link>
        <Icon name="right" className="size-3 text-faint" />
        <Link to={`/shapes?type=${cat}`} className="hover:text-ink">
          {typeInfo(cat).name}
        </Link>
        <Icon name="right" className="size-3 text-faint" />
        <span className="text-ink">{label}</span>
      </nav>

      <PageHeader
        eyebrow={`${typeName} · Manual ${manualTableOf(shape)}`}
        title={
          <span className="flex flex-wrap items-baseline gap-x-3">
            {label}
            {shape.metricLabel && (
              <span className="text-base font-normal text-muted">
                {displayLabel(shape.metricLabel)} <span className="text-xs text-faint">metric</span>
              </span>
            )}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <span className="num text-ink">{fmtQ(shape.W as number, "weight", units, 4)}</span> ·{" "}
              <span className="num text-ink">{fmtQ(shape.A as number, "area", units, 4)}</span>
            </span>
            <span>
              Preferred material{" "}
              <span className="text-ink">
                {d.material.astm}
                {d.material.grade ? ` Gr. ${d.material.grade}` : ""}
              </span>
            </span>
            {note && <Badge tone="warn">{note}</Badge>}
          </span>
        }
        actions={<SeriesStep lighter={lighter} heavier={heavier} />}
      />

      <div className="no-print -mt-2 mb-5 flex flex-wrap gap-2">
        <ButtonLink primary to={`/beam?shape=${slug}`}>
          Design as beam
        </ButtonLink>
        <ButtonLink to={`/column?shape=${slug}`}>Check as column</ButtonLink>
        <ButtonLink to={`/member?shape=${slug}`}>Member check</ButtonLink>
        <ButtonLink to={`/compare?s=${slug}`}>Compare</ButtonLink>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-4">
          <Card title="Cross section" subtitle="To scale; dimensions as tabulated." bodyClassName="p-3">
            <CrossSection shape={shape} mode="dimensioned" maxHeight={420} />
          </Card>
          <SeriesCard shape={shape} series={series} />
        </div>
        <div className="columns-1 gap-4 md:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
          {groups.map((g) => (
            <PropertyGroupTable key={g.group} group={g.group} items={g.items} units={units} />
          ))}
          <p className="text-[11px] text-faint">Click a symbol for its definition, or a value to copy it.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <DesignStrengths shape={shape} d={d} units={units} method={method} />
        </div>
        <div className="space-y-4">
          {curve && <MomentChart curve={curve} units={units} method={method} />}
          <Classification d={d} units={units} />
        </div>
      </div>
    </>
  );
}

function SeriesStep({ lighter, heavier }: { lighter?: Shape; heavier?: Shape }) {
  const cls =
    "inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 font-mono text-[13px] text-ink transition hover:bg-surface-2";
  const off = "inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-[13px] text-faint";
  return (
    <div className="flex items-center gap-1.5" aria-label="Same series by weight">
      {lighter ? (
        <Link to={`/shapes/${slugOf(lighter.label)}`} className={cls} title="Next lighter in series" rel="prev">
          <Icon name="left" className="size-3.5 text-muted" />
          {displayLabel(lighter.label)}
        </Link>
      ) : (
        <span className={off}>
          <Icon name="left" className="size-3.5" />
          Lightest
        </span>
      )}
      {heavier ? (
        <Link to={`/shapes/${slugOf(heavier.label)}`} className={cls} title="Next heavier in series" rel="next">
          {displayLabel(heavier.label)}
          <Icon name="right" className="size-3.5 text-muted" />
        </Link>
      ) : (
        <span className={off}>
          Heaviest
          <Icon name="right" className="size-3.5" />
        </span>
      )}
    </div>
  );
}

function SeriesCard({ shape, series }: { shape: Shape; series: Shape[] }) {
  const { units } = useSettings();
  if (series.length < 2) return null;
  const key = displayLabel(seriesKey(shape));
  const chipRem = 4.5 + 0.5 * Math.max(...series.map((s) => s.label.length));
  return (
    <Card title={<>{key} series</>} subtitle={`${series.length} shapes, lightest first`} bodyClassName="p-2">
      <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${chipRem}rem, 1fr))` }}>
        {series.map((s) => {
          const on = s === shape;
          return (
            <li key={s.label}>
              <Link
                to={`/shapes/${slugOf(s.label)}`}
                aria-current={on ? "page" : undefined}
                className={clsx(
                  "flex items-baseline justify-between gap-2 rounded-md px-2 py-1 text-[12.5px] transition",
                  on ? "bg-accent-soft font-semibold text-accent" : "text-ink hover:bg-surface-2",
                )}
              >
                <span className="truncate font-mono">{displayLabel(s.label)}</span>
                <span className="num shrink-0 text-[11px] text-faint">
                  {fmtExact(s.W as number, "weight", units, 3)}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
