import clsx from "clsx";
import { memo, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PROPERTY } from "@/data/properties";
import { displayLabel, num, slugOf, type Shape } from "@/data/shapes";
import { CrossSection } from "@/features/drawings/CrossSection";
import type { UnitSystem } from "@/lib/units";
import { fmtExact, plainSymbol, type SortSpec } from "./logic";
import { Icon, PropHeading } from "./shared";

const ROW_H = 36;
const LEAD_W = 232;
const WIDE = new Set(["Ix", "Iy", "Iz", "Iw", "Cw", "Zx", "Sx", "J", "C", "Wno", "Sw1", "Sw2", "Sw3"]);
const colWidth = (k: string) => (WIDE.has(k) ? 84 : k.includes("/") ? 70 : 72);

export interface ShapeTableProps {
  rows: readonly Shape[];
  cols: readonly string[];
  units: UnitSystem;
  sort: SortSpec;
  onSort: (key: string) => void;
  bold: ReadonlySet<Shape>;
  compare: readonly string[];
  compareFull: boolean;
  onToggleCompare: (slug: string) => void;
  height: number | string;
}

export function ShapeTable({
  rows,
  cols,
  units,
  sort,
  onSort,
  bold,
  compare,
  compareFull,
  onToggleCompare,
  height,
}: ShapeTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const hintId = useId();
  const [active, setActive] = useState(0);
  const pendingFocus = useRef(false);
  const open = useCallback((slug: string) => navigate(`/shapes/${slug}`), [navigate]);
  const template = `${LEAD_W}px ${cols.map((k) => `${colWidth(k)}px`).join(" ")} minmax(0,1fr)`;
  const width = LEAD_W + cols.reduce((a, k) => a + colWidth(k), 0);

  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 14,
  });

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(rows.length - 1, 0)));
  }, [rows.length]);
  useEffect(() => {
    if (!pendingFocus.current) return;
    // The target row may not be rendered until the virtualizer reacts to the scroll; retry on the next render.
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`);
    if (el) {
      pendingFocus.current = false;
      el.focus({ preventScroll: true });
    }
  });

  const moveTo = (i: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, i));
    setActive(next);
    v.scrollToIndex(next, { align: "auto" });
    pendingFocus.current = true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (!t.dataset.row) return;
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / ROW_H) - 2);
    const s = rows[active];
    switch (e.key) {
      case "ArrowDown":
        moveTo(active + 1);
        break;
      case "ArrowUp":
        moveTo(active - 1);
        break;
      case "PageDown":
        moveTo(active + page);
        break;
      case "PageUp":
        moveTo(active - page);
        break;
      case "Home":
        moveTo(0);
        break;
      case "End":
        moveTo(rows.length - 1);
        break;
      case "Enter":
        if (s) open(slugOf(s.label));
        break;
      case " ":
        if (s) onToggleCompare(slugOf(s.label));
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-label="Shapes"
      aria-rowcount={rows.length + 1}
      aria-colcount={cols.length + 1}
      aria-describedby={hintId}
      onKeyDown={onKeyDown}
      className="relative overflow-auto overscroll-contain rounded-xl border border-line bg-surface [--cs-halo:var(--surface)]"
      style={{ height }}
    >
      <span id={hintId} className="sr-only">
        Arrow keys move between rows. Enter opens the shape. Space adds it to the compare tray.
      </span>
      <div style={{ minWidth: width }}>
        <div
          role="row"
          aria-rowindex={1}
          className="sticky top-0 z-20 grid border-b border-line-strong bg-surface-2"
          style={{ gridTemplateColumns: template }}
        >
          <div
            role="columnheader"
            aria-sort={sort.key === "label" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
            className="sticky left-0 z-10 flex items-end border-r border-line bg-surface-2 px-3 py-1.5"
          >
            <button
              type="button"
              onClick={() => onSort("label")}
              className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-ink"
            >
              Shape <span className="font-normal normal-case tracking-normal text-faint">(Manual order)</span>
              {sort.key === "label" && sort.dir === "desc" && <Icon name="up" className="size-3 text-accent" />}
            </button>
          </div>
          {cols.map((k) => {
            const on = sort.key === k;
            return (
              <div
                key={k}
                role="columnheader"
                aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                className={clsx("px-1.5 py-1.5", on && "bg-accent-soft/60")}
              >
                <button
                  type="button"
                  onClick={() => onSort(k)}
                  aria-label={`Sort by ${plainSymbol(PROPERTY[k]?.name ?? k)}`}
                  className="flex w-full items-end justify-end gap-0.5 rounded hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {on && <Icon name={sort.dir === "asc" ? "up" : "down"} className="mb-0.5 size-3 text-accent" />}
                  <PropHeading k={k} units={units} />
                </button>
              </div>
            );
          })}
          <div />
        </div>
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-muted">No shapes match these filters.</div>
        ) : (
          <div className="relative" style={{ height: v.getTotalSize() }}>
            {v.getVirtualItems().map((item) => {
              const s = rows[item.index]!;
              const slug = slugOf(s.label);
              const inCompare = compare.includes(slug);
              return (
                <Row
                  key={s.label}
                  shape={s}
                  slug={slug}
                  index={item.index}
                  top={item.start}
                  template={template}
                  cols={cols}
                  units={units}
                  sortKey={sort.key}
                  bold={bold.has(s)}
                  inCompare={inCompare}
                  compareDisabled={compareFull && !inCompare}
                  focusable={item.index === active}
                  onFocusRow={setActive}
                  onToggleCompare={onToggleCompare}
                  onOpen={open}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  shape: Shape;
  slug: string;
  index: number;
  top: number;
  template: string;
  cols: readonly string[];
  units: UnitSystem;
  sortKey: string;
  bold: boolean;
  inCompare: boolean;
  compareDisabled: boolean;
  focusable: boolean;
  onFocusRow: (i: number) => void;
  onToggleCompare: (slug: string) => void;
  onOpen: (slug: string) => void;
}

const Row = memo(function Row({
  shape: s,
  slug,
  index,
  top,
  template,
  cols,
  units,
  sortKey,
  bold,
  inCompare,
  compareDisabled,
  focusable,
  onFocusRow,
  onToggleCompare,
  onOpen,
}: RowProps) {
  const label = displayLabel(s.label);
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      aria-selected={inCompare}
      data-row={index}
      tabIndex={focusable ? 0 : -1}
      onFocus={() => onFocusRow(index)}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("a,input,label")) onOpen(slug);
      }}
      className={clsx(
        "group absolute left-0 top-0 grid w-full cursor-pointer border-b border-line text-[13px] outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
        inCompare ? "bg-accent-soft/50" : "bg-surface hover:bg-surface-2",
      )}
      style={{ height: ROW_H, transform: `translateY(${top}px)`, gridTemplateColumns: template }}
    >
      <div
        role="rowheader"
        className={clsx(
          "sticky left-0 z-[1] flex items-center gap-2 border-r border-line px-2",
          inCompare ? "bg-accent-soft" : "bg-surface group-hover:bg-surface-2",
        )}
      >
        <label
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center"
          title={
            compareDisabled ? "Compare tray is full (4 shapes)" : inCompare ? "Remove from compare" : "Add to compare"
          }
        >
          <input
            type="checkbox"
            tabIndex={-1}
            className="size-3.5 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed"
            checked={inCompare}
            disabled={compareDisabled}
            onChange={() => onToggleCompare(slug)}
            aria-label={`Compare ${label}`}
          />
        </label>
        <CrossSection shape={s} mode="thumbnail" className="size-7" />
        <Link
          to={`/shapes/${slug}`}
          tabIndex={-1}
          className={clsx(
            "truncate font-mono text-[12.5px] hover:text-accent hover:underline",
            bold ? "font-bold text-ink" : "text-ink",
          )}
        >
          {label}
        </Link>
      </div>
      {cols.map((k) => {
        const p = PROPERTY[k];
        const v = num(s, k);
        return (
          <div
            key={k}
            role="gridcell"
            className={clsx(
              "num flex items-center justify-end px-2",
              k === sortKey && "bg-accent-soft/30",
              v === undefined ? "text-faint" : k === "W" && bold ? "font-bold text-ink" : "text-ink",
            )}
          >
            {p ? fmtExact(v, p.quantity, units) : "—"}
          </div>
        );
      })}
      <div />
    </div>
  );
});
