// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { SettingsProvider } from "@/app/settings";
import { BeamDesignPage } from "@/features/beam/BeamDesignPage";
import { DiagramsPage } from "@/features/diagrams/DiagramsPage";
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Location() {
  return createElement("output", { "data-testid": "location" }, useLocation().search);
}
function mount(page: typeof BeamDesignPage | typeof DiagramsPage, query: string) {
  return render(
    createElement(
      SettingsProvider,
      null,
      createElement(MemoryRouter, { initialEntries: [query] }, createElement(page), createElement(Location)),
    ),
  );
}
it("renders the flagship and retains a failing linked shape instead of selecting a passing replacement", async () => {
  mount(BeamDesignPage, "/beam?shape=W8X10&method=ASD&units=SI");
  await waitFor(() => expect(screen.getByText(/Selected section check · ASD/)).toBeTruthy());
  expect(screen.getByRole("heading", { name: "W8×10 · A992" })).toBeTruthy();
  expect(screen.getByText(/FAIL ·/)).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});
it("renders invalid span input as a form error", () => {
  mount(BeamDesignPage, "/beam?L=0");
  expect(screen.getByRole("alert").textContent).toMatch(/positive beam length/);
});
it("renders malformed point-load URL data as a recoverable error", () => {
  mount(BeamDesignPage, "/beam?points=broken");
  expect(screen.getByRole("alert").textContent).toMatch(/Invalid point-load URL/);
  fireEvent.click(screen.getByRole("button", { name: "Reset point loads" }));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("heading", { name: "Demand summary" })).toBeTruthy();
});
it("selects a diagram card and updates the shared URL", () => {
  mount(DiagramsPage, "/diagrams?case=propped-uniform");
  fireEvent.click(screen.getByRole("button", { name: /^Simple · concentrated at center/ }));
  expect(screen.getByRole("heading", { name: "Simple · concentrated at center" })).toBeTruthy();
  expect(screen.getByTestId("location").textContent).toContain("case=simple-center");
  expect(screen.getByText(/PL³\/\(48EI\)/)).toBeTruthy();
});
it("rejects reversed partial-load bounds without crashing the page", () => {
  mount(DiagramsPage, "/diagrams?case=simple-partial&a=180&b=60");
  expect(screen.getByRole("alert").textContent).toMatch(/bounds are invalid/);
});

it("reports near-coincident overhang supports without an uncaught analysis error", () => {
  mount(BeamDesignPage, "/beam?support=overhang&L=240&overhang=239.9999999999999");
  expect(screen.getByRole("alert").textContent).toMatch(/Unstable or degenerate/);
});
