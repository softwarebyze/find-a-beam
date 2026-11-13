/**
 * Cross-section drawing for any AISC Shapes Database v16.0 record.
 *  - mode "dimensioned": to-scale drawing with dimension lines (d, bf, tw, tf, k …) and centroidal axes.
 *    Fits the container width (capped at `maxHeight`) unless `scale` is given; text stays a
 *    constant screen size while the geometry scales.
 *  - mode "thumbnail": small filled silhouette (48 px unless sized by `className` or `scale`).
 *  - `scale` (px per inch) lets callers draw several shapes at a common scale (compare view).
 *
 * Set `--cs-halo` on an ancestor when the drawing sits on a background other than `--surface`.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useSettings } from "@/app/settings";
import { displayLabel, type Shape } from "@/data/shapes";
import { dimRank, sectionGeometry, sectionPath, type DimSpec } from "./geometry";
import { dimValue, unitsNote } from "./labels";
import { FONT_PX, LINE_H, estimateLabel, fitScale, layoutScene, type SceneArrow, type SceneText } from "./layout";

export interface CrossSectionProps {
  shape: Shape;
  mode?: "dimensioned" | "thumbnail";
  /** Pixels per inch; omit to fit the container */
  scale?: number;
  className?: string;
  /** Centroidal axes, centroid / shear-center markers and their locating dims (default: on when dimensioned) */
  showAxes?: boolean;
  /** Dimensioned mode: height cap (px) when fitting the container. Default 420. */
  maxHeight?: number;
  /** Dimensioned mode: caption stating the units. Default true. */
  showUnits?: boolean;
}

export function CrossSection(props: CrossSectionProps) {
  return props.mode === "thumbnail" ? <Thumbnail {...props} /> : <Dimensioned {...props} />;
}

const STROKE = { vectorEffect: "non-scaling-stroke" } as const;
const HALO_FILL = "var(--cs-halo, var(--surface))";
const HALO = { stroke: HALO_FILL, strokeWidth: 3, strokeLinejoin: "round" } as const;
const ARROW_LEN = 7;
const ARROW_HALF = 2.4;
const FALLBACK_WIDTH = 360;
const SUB_DY = 3;
const SYMBOL_FONT = "var(--font-sans)";
/** Largest section dimension (px) needed to show dims of each rank (see `dimRank`). */
const MIN_PX_FOR_RANK: Record<number, number> = { 3: 140, 2: 90 };

function Thumbnail({ shape, scale, className, showAxes = false }: CrossSectionProps) {
  const g = useMemo(() => sectionGeometry(shape), [shape]);
  const d = useMemo(() => sectionPath(g), [g]);
  const pad = Math.max(g.width, g.height) * 0.06;
  const vw = g.width + 2 * pad,
    vh = g.height + 2 * pad;
  const sized = scale !== undefined || /(^|\s)(size|w|h)-/.test(className ?? "");
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${vw} ${vh}`}
      width={scale !== undefined ? vw * scale : undefined}
      height={scale !== undefined ? vh * scale : undefined}
      className={clsx(!sized && "size-12", "shrink-0", className)}
      role="img"
      aria-label={`${displayLabel(shape.label)} cross-section`}
    >
      <path
        d={d}
        fillRule="evenodd"
        fill="var(--steel-fill)"
        stroke="var(--steel)"
        strokeWidth={1}
        strokeLinejoin="round"
        style={STROKE}
      />
      {showAxes && (
        <g stroke="var(--muted)" strokeWidth={0.75} strokeDasharray="6 2 1.5 2" style={STROKE}>
          <line x1={-pad} x2={g.width + pad} y1={g.centroid.y} y2={g.centroid.y} />
          <line y1={-pad} y2={g.height + pad} x1={g.centroid.x} x2={g.centroid.x} />
        </g>
      )}
    </svg>
  );
}

/** Symbol as tspans: italic sans letters, `{sub}` parts lowered; returns the dy that restores the baseline. */
function symbolTspans(sym: string): [React.ReactNode[], number | undefined] {
  let lowered = false;
  const nodes = sym
    .split(/(\{[^}]*\})/g)
    .filter(Boolean)
    .map((p, i) => {
      if (p.startsWith("{")) {
        const dy = lowered ? undefined : SUB_DY;
        lowered = true;
        return (
          <tspan key={i} fontSize="0.75em" dy={dy}>
            {p.slice(1, -1)}
          </tspan>
        );
      }
      const dy = lowered ? -SUB_DY : undefined;
      lowered = false;
      return (
        <tspan key={i} fontStyle="italic" dy={dy}>
          {p}
        </tspan>
      );
    });
  return [nodes, lowered ? -SUB_DY : undefined];
}

/**
 * Text drawn twice: a background-coloured stroked copy underneath, then the ink. A single element
 * with paint-order would let each tspan's halo paint over the previous glyph (subscripts).
 */
function Haloed({ children, fill }: { children: (layer: object) => React.ReactNode; fill: string }) {
  return (
    <>
      <g aria-hidden>{children({ fill: HALO_FILL, ...HALO })}</g>
      {children({ fill })}
    </>
  );
}

function DimText({ t, d, main, paren }: { t: SceneText; d: DimSpec; main: string; paren?: string }) {
  const [sym, resetDy] = symbolTspans(d.sym);
  const transform = t.rotate ? `rotate(-90 ${t.x} ${t.y})` : undefined;
  const stacked = t.stacked && paren !== undefined;
  return (
    <Haloed fill="var(--dim)">
      {(layer) => (
        <>
          <text x={t.x} y={stacked ? t.y - LINE_H / 2 : t.y} textAnchor={t.anchor} transform={transform} {...layer}>
            <tspan fontFamily={SYMBOL_FONT}>{sym}</tspan>
            <tspan className="font-mono" dy={resetDy}>{` ${main}${paren && !stacked ? ` ${paren}` : ""}`}</tspan>
          </text>
          {stacked && (
            <text
              x={t.x}
              y={t.y + LINE_H / 2}
              textAnchor={t.anchor}
              transform={transform}
              className="font-mono"
              {...layer}
            >
              {paren}
            </text>
          )}
        </>
      )}
    </Haloed>
  );
}

function arrowPath({ x, y, dx, dy }: SceneArrow): string {
  const bx = x - dx * ARROW_LEN,
    by = y - dy * ARROW_LEN;
  return `M${x} ${y}L${bx - dy * ARROW_HALF} ${by + dx * ARROW_HALF}L${bx + dy * ARROW_HALF} ${by - dx * ARROW_HALF}Z`;
}

function useContainerWidth(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    setWidth(Math.round(el.clientWidth));
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);
  return [ref, width] as const;
}

function Dimensioned({
  shape,
  scale,
  className,
  showAxes = true,
  maxHeight = 420,
  showUnits = true,
}: CrossSectionProps) {
  const { units } = useSettings();
  const [ref, availW] = useContainerWidth(scale === undefined);
  const g = useMemo(() => sectionGeometry(shape), [shape]);

  const dims = useMemo(() => g.dims.filter((d) => showAxes || !d.withAxes), [g, showAxes]);
  const values = useMemo(() => new Map(dims.map((d) => [d.id, dimValue(d, units)])), [dims, units]);
  const scene = useMemo(() => {
    const label = (d: DimSpec) => {
      const v = values.get(d.id);
      return estimateLabel(d.sym, v?.main ?? "", v?.paren);
    };
    const opts = { showAxes, label };
    const fit = (ds: DimSpec[]) => scale ?? fitScale(g, ds, opts, availW || FALLBACK_WIDTH, maxHeight);
    // Small drawings keep only the more important dims so labels don't pile onto the steel
    let rank = 3;
    let shown = dims;
    let s = fit(shown);
    while (rank > 1 && Math.max(g.width, g.height) * s < MIN_PX_FOR_RANK[rank]!) {
      rank--;
      shown = dims.filter((d) => dimRank(d) <= rank);
      s = fit(shown);
    }
    const drawn = rank < 3 ? { ...g, axes: g.axes.filter((a) => !a.principal) } : g;
    return layoutScene(drawn, shown, { ...opts, scale: s });
  }, [g, dims, values, showAxes, scale, availW, maxHeight]);
  const path = useMemo(() => sectionPath(g, { k: scene.scale, dx: scene.ox, dy: scene.oy }), [g, scene]);

  const dimById = new Map(dims.map((d) => [d.id, d]));
  const title = `${displayLabel(shape.label)} cross-section`;
  return (
    <div ref={ref} className={clsx(scale === undefined ? "w-full min-w-0" : "inline-block max-w-full", className)}>
      <svg
        viewBox={`0 0 ${scene.width} ${scene.height}`}
        width={scene.width}
        height={scene.height}
        className="mx-auto block h-auto max-w-full select-none"
        role="img"
        aria-label={title}
        fontSize={FONT_PX}
      >
        <title>{title}</title>
        <path
          d={path}
          fillRule="evenodd"
          fill="var(--steel-fill)"
          stroke="var(--steel)"
          strokeWidth={1.25}
          strokeLinejoin="round"
          style={STROKE}
        />
        <g stroke="var(--muted)" strokeWidth={0.75} strokeDasharray="12 3 2 3" fill="none">
          {scene.lines
            .filter((l) => l.role === "axis")
            .map((l, i) => (
              <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} style={STROKE} />
            ))}
        </g>
        <g stroke="var(--dim)" fill="none">
          {scene.lines
            .filter((l) => l.role !== "axis")
            .map((l, i) => (
              <line
                key={i}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                strokeWidth={l.role === "ext" ? 0.6 : 0.85}
                opacity={l.role === "ext" ? 0.75 : 1}
                style={STROKE}
              />
            ))}
        </g>
        <path d={scene.arrows.map(arrowPath).join("")} fill="var(--dim)" />
        {scene.markers.map((m, i) =>
          m.kind === "cg" ? (
            <g key={i} stroke="var(--muted)" strokeWidth={0.9}>
              <circle cx={m.x} cy={m.y} r={4.5} fill={HALO_FILL} />
              <path
                d={`M${m.x} ${m.y}h4.5a4.5 4.5 0 0 1-4.5 4.5zM${m.x} ${m.y}h-4.5a4.5 4.5 0 0 1 4.5-4.5z`}
                fill="var(--muted)"
                stroke="none"
              />
            </g>
          ) : (
            <circle key={i} cx={m.x} cy={m.y} r={3} stroke="var(--muted)" strokeWidth={0.9} fill={HALO_FILL} />
          ),
        )}
        <g dominantBaseline="central">
          {scene.texts.map((t, i) => {
            if (t.role === "dim") {
              const d = dimById.get(t.ref);
              const v = values.get(t.ref);
              return d && v ? <DimText key={i} t={t} d={d} main={v.main} paren={v.paren} /> : null;
            }
            return (
              <Haloed key={i} fill="var(--muted)">
                {(layer) => (
                  <text
                    x={t.x}
                    y={t.y}
                    textAnchor={t.anchor}
                    fontFamily={SYMBOL_FONT}
                    fontStyle={t.role === "axis" ? "italic" : undefined}
                    fontSize={t.role === "marker" ? 10 : undefined}
                    {...layer}
                  >
                    {t.role === "marker" ? "SC" : t.ref}
                  </text>
                )}
              </Haloed>
            );
          })}
        </g>
      </svg>
      {showUnits && <p className="mt-1 text-center text-[11px] text-faint">{unitsNote(units)}</p>}
    </div>
  );
}
