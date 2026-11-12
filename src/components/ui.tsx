/**
 * Shared UI primitives. Keep feature code consistent by composing these.
 * Palette tokens (see index.css): canvas, surface, surface-2, line, line-strong, ink, muted, faint,
 * accent, accent-soft, accent-ink, pass(-soft), fail(-soft), warn(-soft), steel, steel-fill, dim.
 */
import clsx from "clsx";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useSettings } from "@/app/settings";
import { fmt, fromDisplay, toDisplay, unitLabel, type Quantity } from "@/lib/units";
import { Sym } from "./Sym";

export { Sym };

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wider text-accent">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 no-print">{actions}</div>}
    </header>
  );
}

export function Card({ title, subtitle, actions, children, className, bodyClassName }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={clsx("rounded-xl border border-line bg-surface shadow-[0_1px_0_rgba(15,23,42,0.03)]", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={clsx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-faint">{hint}</p>}
    </div>
  );
}

const inputBase =
  "h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20";

/**
 * Numeric input bound to an ENGINE-unit value. Displays/accepts the active unit system.
 * e.g. <QuantityInput label="Span" quantity="span" value={spanIn} onChange={setSpanIn} />
 */
export function QuantityInput({ label, quantity, value, onChange, hint, min, step, placeholder, sig = 4 }: {
  label: ReactNode; quantity: Quantity; value: number | undefined; onChange: (v: number | undefined) => void;
  hint?: ReactNode; min?: number; step?: number; placeholder?: string; sig?: number;
}) {
  const { units } = useSettings();
  const id = useId();
  const shown = value === undefined ? "" : String(Number(toDisplay(value, quantity, units).toPrecision(sig)));
  const [text, setText] = useState(shown);
  // Re-sync when value or units change from outside
  useEffect(() => { setText((t) => (t !== "" && Number(t) === Number(shown) ? t : shown)); }, [shown]);
  const u = unitLabel(quantity, units);
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          className={clsx(inputBase, "num", u && "pr-14")}
          value={text}
          placeholder={placeholder}
          min={min}
          step={step}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            onChange(e.target.value.trim() === "" || !Number.isFinite(n) ? undefined : fromDisplay(n, quantity, units));
          }}
        />
        {u && <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-faint">{u}</span>}
      </div>
    </Field>
  );
}

/** Plain number input (unitless, e.g. Cb, K). */
export function NumberInput({ label, value, onChange, hint, step }: { label: ReactNode; value: number | undefined; onChange: (v: number | undefined) => void; hint?: ReactNode; step?: number }) {
  return <QuantityInput label={label} quantity="ratio" value={value} onChange={onChange} hint={hint} step={step} />;
}

export function Select<T extends string>({ label, value, onChange, options, hint }: { label?: ReactNode; value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] | readonly { value: T; label: ReactNode }[]; hint?: ReactNode }) {
  const id = useId();
  const el = (
    <select id={id} className={clsx(inputBase, "pr-8")} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{typeof o.label === "string" ? o.label : o.value}</option>)}
    </select>
  );
  return label ? <Field label={label} hint={hint} htmlFor={id}>{el}</Field> : el;
}

export function Segmented<T extends string>({ value, onChange, options, size = "md", ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: "sm" | "md"; ariaLabel?: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg border border-line-strong bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-md font-medium transition",
            size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
            o.value === value ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({ children, variant = "secondary", className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition disabled:opacity-50",
        variant === "primary" && "bg-accent text-accent-ink hover:brightness-110",
        variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-surface-2",
        variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "pass" | "fail" | "warn"; className?: string }) {
  return (
    <span className={clsx(
      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4",
      tone === "neutral" && "bg-surface-2 text-muted ring-1 ring-line",
      tone === "accent" && "bg-accent-soft text-accent",
      tone === "pass" && "bg-pass-soft text-pass",
      tone === "fail" && "bg-fail-soft text-fail",
      tone === "warn" && "bg-warn-soft text-warn",
      className,
    )}>{children}</span>
  );
}

/** Specification / Manual reference chip, e.g. <SpecRef>Eq. F2-2</SpecRef> or <SpecRef>Manual Table 3-23</SpecRef>. */
export function SpecRef({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center rounded border border-line bg-surface-2 px-1 py-px font-mono text-[10.5px] leading-4 text-muted whitespace-nowrap">
      {children}
    </span>
  );
}

/** Demand/capacity bar. ratio ≤ 1 passes. */
export function RatioBar({ ratio, label }: { ratio: number; label?: ReactNode }) {
  const pass = ratio <= 1.0 + 1e-9;
  return (
    <div className="flex items-center gap-2">
      {label && <div className="w-24 shrink-0 text-xs text-muted">{label}</div>}
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
        <div className={clsx("h-full rounded-full", pass ? "bg-pass" : "bg-fail")} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      <div className={clsx("num w-12 text-right text-xs font-semibold", pass ? "text-pass" : "text-fail")}>{fmt(ratio, 3)}</div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "pass" | "fail" }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</div>
      <div className={clsx("num mt-0.5 text-lg font-semibold", tone === "pass" ? "text-pass" : tone === "fail" ? "text-fail" : "text-ink")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Standard dense data-table classes for consistent tables across the app. */
export const table = {
  wrap: "overflow-x-auto rounded-xl border border-line bg-surface",
  table: "w-full border-collapse text-sm",
  th: "sticky top-0 z-10 border-b border-line bg-surface-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted whitespace-nowrap",
  td: "border-b border-line px-3 py-1.5 whitespace-nowrap num",
  tr: "hover:bg-surface-2/60",
};
