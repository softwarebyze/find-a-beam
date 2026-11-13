import { lazy } from "react";
import { createBrowserRouter } from "react-router";
import { Layout } from "./Layout";
import { NotFound } from "./NotFound";

const page = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as React.ComponentType }));

const HomePage = page(() => import("@/features/home/HomePage"), "HomePage");
const ExplorerPage = page(() => import("@/features/shapes/ExplorerPage"), "ExplorerPage");
const ShapeDetailPage = page(() => import("@/features/shapes/ShapeDetailPage"), "ShapeDetailPage");
const ComparePage = page(() => import("@/features/shapes/ComparePage"), "ComparePage");
const BeamDesignPage = page(() => import("@/features/beam/BeamDesignPage"), "BeamDesignPage");
const DiagramsPage = page(() => import("@/features/diagrams/DiagramsPage"), "DiagramsPage");
const ColumnDesignPage = page(() => import("@/features/column/ColumnDesignPage"), "ColumnDesignPage");
const MemberCheckPage = page(() => import("@/features/member/MemberCheckPage"), "MemberCheckPage");
// temporary-j10-page-check-start
const TestBasePlatePage = page(() => import("@/features/connections/base-plate/BasePlatePage"), "BasePlatePage");
const TestConcentratedPage = page(
  () => import("@/features/connections/concentrated/ConcentratedForcesPage"),
  "ConcentratedForcesPage",
);
const TestMomentPage = page(() => import("@/features/connections/moment/MomentConnectionPage"), "MomentConnectionPage");
// temporary-j10-page-check-end
const CompositeBeamPage = page(() => import("@/features/composite/CompositeBeamPage"), "CompositeBeamPage");
const BoltWeldGroupsPage = page(() => import("@/features/connections/groups/BoltWeldGroupsPage"), "BoltWeldGroupsPage");
const ReferencePage = page(() => import("@/features/reference/ReferencePage"), "ReferencePage");

const TemporaryStabilityPage = page(() => import("@/features/stability/StabilityPage"), "StabilityPage"); // stability-agent-temporary

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "shapes", element: <ExplorerPage /> },
      { path: "shapes/:slug", element: <ShapeDetailPage /> },
      { path: "compare", element: <ComparePage /> },
      { path: "beam", element: <BeamDesignPage /> },
      { path: "diagrams", element: <DiagramsPage /> },
      { path: "stability", element: <TemporaryStabilityPage /> }, // stability-agent-temporary
      { path: "column", element: <ColumnDesignPage /> },
      { path: "member", element: <MemberCheckPage /> },
      { path: "composite", element: <CompositeBeamPage /> },
      { path: "reference", element: <ReferencePage /> },
      { path: "connections/bolts-welds", element: <BoltWeldGroupsPage /> },
      // temporary-j10-page-routes-start
      { path: "connections/base-plate", element: <TestBasePlatePage /> },
      { path: "connections/concentrated-forces", element: <TestConcentratedPage /> },
      { path: "connections/moment", element: <TestMomentPage /> },
      // temporary-j10-page-routes-end
      { path: "*", element: <NotFound /> },
    ],
  },
]);
