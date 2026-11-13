import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ShapePicker } from "@/components/ShapePicker";
import { slugOf } from "@/data/shapes";

/** Global shape lookup: ⌘K / Ctrl+K or "/" opens a picker that jumps to the shape page. */
export function QuickFind() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement && (e.target.closest("input, textarea, select") || e.target.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => ref.current?.querySelector("input")?.focus());
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-7 items-center gap-2 rounded-md border border-line-strong bg-surface px-2 text-xs text-faint hover:text-ink md:flex"
      >
        Find shape <kbd className="rounded bg-surface-2 px-1 font-mono text-[10px]">⌘K</kbd>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-[15vh] backdrop-blur-[2px]"
          onMouseDown={() => setOpen(false)}
        >
          <div
            ref={ref}
            className="w-full max-w-md rounded-xl border border-line bg-surface p-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ShapePicker
              label="Go to shape"
              value={undefined}
              placeholder="W18×50, HSS6×6×1/2, L4×4×1/2 …"
              onChange={(s) => {
                setOpen(false);
                navigate(`/shapes/${slugOf(s.label)}`);
              }}
            />
            <p className="mt-2 text-[11px] text-faint">Enter to open · Esc to close</p>
          </div>
        </div>
      )}
    </>
  );
}
