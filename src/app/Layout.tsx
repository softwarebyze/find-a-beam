import clsx from "clsx";
import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { Segmented } from "@/components/ui";
import { NAV_GROUPS, type NavGroup } from "./nav";
import { QuickFind } from "./QuickFind";
import { useSettings, type Theme } from "./settings";

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-ink" />
      <path d="M8 8h16v3.5h-6.25v9H24V24H8v-3.5h6.25v-9H8z" className="fill-canvas" />
    </svg>
  );
}

function NavMenu({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const active = group.items.some((i) => pathname.startsWith(i.to));
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition",
          active || open ? "bg-surface-2 font-medium text-ink" : "text-muted hover:text-ink",
        )}
      >
        {group.label}
        <svg viewBox="0 0 12 12" className={clsx("h-3 w-3 transition", open && "rotate-180")} aria-hidden>
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className={clsx(
            "absolute left-0 top-full z-50 mt-1.5 grid rounded-xl border border-line bg-surface p-1.5 shadow-xl",
            group.items.length > 5 ? "w-[42rem] grid-cols-2" : "w-[22rem]",
          )}
        >
          {group.items.map((item) => (
            <Link
              key={item.to}
              role="menuitem"
              to={item.to}
              className={clsx(
                "block rounded-lg px-3 py-2 transition hover:bg-surface-2",
                pathname.startsWith(item.to) && "bg-surface-2",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-ink">{item.label}</span>
                <span className="font-mono text-[10.5px] text-faint">{item.ref}</span>
              </div>
              <div className="mt-0.5 text-xs leading-snug text-muted">{item.description}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const THEME_ICON: Record<Theme, string> = { light: "☀", dark: "☾", system: "◐" };
const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

export function Layout() {
  const { units, setUnits, method, setMethod, theme, setTheme } = useSettings();
  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
          <NavLink to="/" className="flex shrink-0 items-center gap-2">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">Find a Beam</span>
          </NavLink>
          <nav className="flex min-w-0 flex-1 items-center gap-0.5">
            <NavLink
              to="/shapes"
              className={({ isActive }) =>
                clsx(
                  "whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition",
                  isActive ? "bg-surface-2 font-medium text-ink" : "text-muted hover:text-ink",
                )
              }
            >
              Shapes
            </NavLink>
            {NAV_GROUPS.map((g) => (
              <NavMenu key={g.label} group={g} />
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <QuickFind />
            <Segmented
              size="sm"
              ariaLabel="Design method"
              value={method}
              onChange={setMethod}
              options={[
                { value: "LRFD", label: "LRFD" },
                { value: "ASD", label: "ASD" },
              ]}
            />
            <Segmented
              size="sm"
              ariaLabel="Units"
              value={units}
              onChange={setUnits}
              options={[
                { value: "US", label: "US" },
                { value: "SI", label: "SI" },
              ]}
            />
            <button
              type="button"
              title={`Theme: ${theme}`}
              onClick={() => setTheme(NEXT_THEME[theme])}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
            >
              {THEME_ICON[theme]}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:py-8">
        <Suspense fallback={<div className="py-20 text-center text-sm text-faint">Loading…</div>}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="no-print border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-faint">
          <span>
            Shape data: AISC Shapes Database v16.0 (16th Ed. Steel Construction Manual). Design per ANSI/AISC 360-22.
            For use by qualified engineers; verify all results.
          </span>
          <a className="hover:text-ink" href="https://github.com/softwarebyze/find-a-beam">
            Source
          </a>
        </div>
      </footer>
    </div>
  );
}
