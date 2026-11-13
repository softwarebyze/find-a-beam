import clsx from "clsx";
import { Suspense } from "react";
import { NavLink, Outlet } from "react-router";
import { Segmented } from "@/components/ui";
import { QuickFind } from "./QuickFind";
import { useSettings, type Theme } from "./settings";

const NAV = [
  { to: "/shapes", label: "Shapes" },
  { to: "/beam", label: "Beam design" },
  { to: "/column", label: "Column design" },
  { to: "/member", label: "Member check" },
  { to: "/diagrams", label: "Beam diagrams" },
  { to: "/compare", label: "Compare" },
  { to: "/reference", label: "Reference" },
];

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-ink" />
      <path d="M8 8h16v3.5h-6.25v9H24V24H8v-3.5h6.25v-9H8z" className="fill-canvas" />
    </svg>
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
          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => clsx(
                  "whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition",
                  isActive ? "bg-surface-2 font-medium text-ink" : "text-muted hover:text-ink",
                )}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <QuickFind />
            <Segmented size="sm" ariaLabel="Design method" value={method} onChange={setMethod} options={[{ value: "LRFD", label: "LRFD" }, { value: "ASD", label: "ASD" }]} />
            <Segmented size="sm" ariaLabel="Units" value={units} onChange={setUnits} options={[{ value: "US", label: "US" }, { value: "SI", label: "SI" }]} />
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
            Shape data: AISC Shapes Database v16.0 (16th Ed. Steel Construction Manual). Design per ANSI/AISC 360-22. For use by qualified engineers; verify all results.
          </span>
          <a className="hover:text-ink" href="https://github.com/softwarebyze/find-a-beam">Source</a>
        </div>
      </footer>
    </div>
  );
}
