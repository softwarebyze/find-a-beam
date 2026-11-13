import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Sym } from "@/components/Sym";
import { PROPERTY } from "@/data/properties";
import { unitLabel, type UnitSystem } from "@/lib/units";
import { plainSymbol } from "./logic";

/** Symbol with its unit label underneath, as in a Manual column heading. */
export function PropHeading({ k, units, align = "right" }: { k: string; units: UnitSystem; align?: "left" | "right" }) {
  const p = PROPERTY[k];
  if (!p) return <span>{k}</span>;
  const u = unitLabel(p.quantity, units);
  return (
    <span
      className={clsx("flex flex-col leading-tight", align === "right" ? "items-end" : "items-start")}
      title={`${plainSymbol(p.name)} — ${plainSymbol(p.description)}`}
    >
      <Sym s={p.symbol} className="text-[12px] font-semibold normal-case tracking-normal text-ink" />
      <span className="text-[10px] font-normal normal-case tracking-normal text-faint">{u || "\u00a0"}</span>
    </span>
  );
}

/** Copies `text` on click and briefly confirms. */
export function CopyButton({
  text,
  label,
  children,
  className,
}: {
  text: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      title={copied ? "Copied" : `Copy ${text}`}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => setCopied(true),
          () => undefined,
        );
      }}
      className={clsx(
        "relative rounded px-1 -mx-1 text-right transition hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-accent",
        className,
      )}
    >
      {children}
      <span
        aria-live="polite"
        className={clsx(
          "pointer-events-none absolute -top-5 right-0 rounded bg-ink px-1.5 py-0.5 text-[10px] font-medium text-canvas transition-opacity",
          copied ? "opacity-100" : "opacity-0",
        )}
      >
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

/** Button-anchored popover panel; closes on outside click and Escape. */
export function Popover({
  label,
  children,
  align = "right",
  panelClassName,
}: {
  label: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={clsx(toolbarButton, open && "bg-surface-2")}
      >
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          className={clsx(
            "absolute z-30 mt-1 rounded-xl border border-line bg-surface p-3 shadow-xl",
            align === "right" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export const toolbarButton =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition hover:bg-surface-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent";

export const inputClass =
  "h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20";

/** Link styled like a secondary button. */
export function ButtonLink({ to, children, primary }: { to: string; children: ReactNode; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={clsx(
        "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-accent",
        primary
          ? "bg-accent text-accent-ink hover:brightness-110"
          : "border border-line-strong bg-surface text-ink hover:bg-surface-2",
      )}
    >
      {children}
    </Link>
  );
}

/** Small inline chevron / glyph icons (stroke-based, inherit currentColor). */
export function Icon({
  name,
  className,
}: {
  name: "up" | "down" | "x" | "left" | "right" | "download" | "columns" | "search" | "plus";
  className?: string;
}) {
  const d: Record<typeof name, string> = {
    up: "M4 10l4-4 4 4",
    down: "M4 6l4 4 4-4",
    x: "M4.5 4.5l7 7M11.5 4.5l-7 7",
    left: "M10 4L6 8l4 4",
    right: "M6 4l4 4-4 4",
    download: "M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10",
    columns: "M2.5 3.5h11v9h-11zM6.2 3.5v9M9.8 3.5v9",
    search: "M7 12A5 5 0 107 2a5 5 0 000 10zM10.6 10.6L14 14",
    plus: "M8 3.5v9M3.5 8h9",
  };
  return (
    <svg
      viewBox="0 0 16 16"
      className={clsx("size-4 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d[name]} />
    </svg>
  );
}
