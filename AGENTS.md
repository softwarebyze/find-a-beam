# Find a Beam — contributor guide (humans and agents)

Steel design workbench on the **AISC Shapes Database v16.0** (16th Ed. Manual) and **ANSI/AISC 360-22**.
Vite 8 + React 19 + TypeScript (strict, `noUncheckedIndexedAccess`) + Tailwind v4 + react-router 7 + Vitest.

## Commands
- `npm run dev` — dev server
- `npm run typecheck` — must be clean
- `npm test` — Vitest, must pass
- `npm run build` — production build (Netlify publishes `dist/`)

## Layout
- `src/data/` — `shapes.ts` (dataset + helpers: `familyOf`, `req`, `num`, `findShape`, `displayLabel`, `slugOf`), `properties.ts` (metadata for every DB column), `materials.ts` (Manual Tables 2-4/2-5, `E`, `G`).
- `src/lib/units.ts` — **engine units are kip, in., ksi, kip-in.** Convert only at the UI via `toDisplay`/`fromDisplay`/`fmtQ` and `Quantity`.
- `src/aisc/` — AISC 360-22 engine. `types.ts` is the contract (extend additively only). Pure functions, no React.
- `src/analysis/` — structural analysis helpers (load combinations, beam cases).
- `src/components/ui.tsx` — shared primitives (Card, PageHeader, QuantityInput, Select, Segmented, Badge, SpecRef, RatioBar, Stat, table classes). `ShapePicker.tsx`, `Sym.tsx`.
- `src/app/` — layout, routes, settings (`useSettings()` → units US/SI, method LRFD/ASD, theme).
- `src/features/<feature>/` — pages. Each feature owns its directory.

## Conventions
- Use semantic color tokens (`bg-surface`, `text-muted`, `border-line`, `text-accent`, `text-pass`, `text-fail` …), never raw Tailwind colors. Both light and dark themes must look right.
- Symbols use the `{sub}` convention: `"I{x}"` renders Iₓ via `<Sym s="I{x}" />`.
- Cite the spec everywhere a number comes from it: `<SpecRef>Eq. F2-2</SpecRef>`, `<SpecRef>Manual Table 3-23</SpecRef>`.
- Every design result must honor the global LRFD/ASD toggle (`available(result, method)`) and US/SI toggle.
- Shareable state: page inputs live in the URL query string (`useSearchParams`) so a design can be linked.
- Engine code: verify against Manual tabulated values in `src/aisc/__tests__/`. No `any`.
- Taste: dense, calm, engineering-grade UI. No emoji, no marketing fluff, no placeholder lorem.
