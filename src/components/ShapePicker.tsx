import clsx from "clsx";
import { useId, useMemo, useRef, useState } from "react";
import { displayLabel, findShape, SHAPES, type Shape, type ShapeType } from "@/data/shapes";
import { Field } from "./ui";

/** Searchable shape combobox. Accepts "W18x50", "w18×50", "HSS6x6x1/2" … */
export function ShapePicker({ label = "Shape", value, onChange, types, placeholder = "e.g. W18×50" }: {
  label?: string; value: Shape | undefined; onChange: (s: Shape) => void; types?: ShapeType[]; placeholder?: string;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const pool = useMemo(() => (types ? SHAPES.filter((s) => types.includes(s.type)) : SHAPES), [types]);
  const results = useMemo(() => {
    const needle = q.replace(/×/g, "X").replace(/\s+/g, "").toUpperCase();
    if (!needle) return pool.slice(0, 50);
    const starts = pool.filter((s) => s.label.startsWith(needle));
    const contains = pool.filter((s) => !s.label.startsWith(needle) && s.label.includes(needle));
    return [...starts, ...contains].slice(0, 50);
  }, [q, pool]);

  const pick = (s: Shape) => { onChange(s); setQ(""); setOpen(false); };

  return (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          autoComplete="off"
          className="h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 font-mono text-sm text-ink outline-none placeholder:font-sans placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
          placeholder={value ? displayLabel(value.label) : placeholder}
          value={open ? q : value ? displayLabel(value.label) : q}
          onFocus={() => { setOpen(true); setQ(""); setActive(0); }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") {
              e.preventDefault();
              const s = results[active] ?? findShape(q);
              if (s) pick(s);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
        {open && results.length > 0 && (
          <ul ref={listRef} id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg">
            {results.map((s, i) => (
              <li
                key={s.label}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                onMouseEnter={() => setActive(i)}
                className={clsx("flex cursor-pointer items-center justify-between px-2.5 py-1.5 text-sm", i === active && "bg-accent-soft")}
              >
                <span className="font-mono">{displayLabel(s.label)}</span>
                <span className="num text-xs text-faint">{s.W} lb/ft</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}
