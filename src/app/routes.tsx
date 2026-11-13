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
const CompositeBeamPage = page(() => import("@/features/composite/CompositeBeamPage"), "CompositeBeamPage");
const ColumnDesignPage = page(() => import("@/features/column/ColumnDesignPage"), "ColumnDesignPage");
const MemberCheckPage = page(() => import("@/features/member/MemberCheckPage"), "MemberCheckPage");
const StabilityPage = page(() => import("@/features/stability/StabilityPage"), "StabilityPage");
const FramePage = page(() => import("@/features/frame/FramePage"), "FramePage");
const BoltWeldGroupsPage = page(() => import("@/features/connections/groups/BoltWeldGroupsPage"), "BoltWeldGroupsPage");
const ShearConnectionPage = page(
  () => import("@/features/connections/shear/ShearConnectionPage"),
  "ShearConnectionPage",
);
const BasePlatePage = page(() => import("@/features/connections/base-plate/BasePlatePage"), "BasePlatePage");
const ConcentratedForcesPage = page(
  () => import("@/features/connections/concentrated/ConcentratedForcesPage"),
  "ConcentratedForcesPage",
);
const MomentConnectionPage = page(
  () => import("@/features/connections/moment/MomentConnectionPage"),
  "MomentConnectionPage",
);
const BracketPage = page(() => import("@/features/connections/bracket/BracketPage"), "BracketPage");
const BracingConnectionPage = page(
  () => import("@/features/connections/bracing/BracingConnectionPage"),
  "BracingConnectionPage",
);
const HangerPage = page(() => import("@/features/connections/hanger/HangerPage"), "HangerPage");
const HssConnectionPage = page(() => import("@/features/connections/hss/HssConnectionPage"), "HssConnectionPage");
const FatiguePage = page(() => import("@/features/fatigue/FatiguePage"), "FatiguePage");
const VibrationPage = page(() => import("@/features/vibration/VibrationPage"), "VibrationPage");
const PondingPage = page(() => import("@/features/ponding/PondingPage"), "PondingPage");
const FirePage = page(() => import("@/features/fire/FirePage"), "FirePage");
const ReferencePage = page(() => import("@/features/reference/ReferencePage"), "ReferencePage");
const ReferenceLibraryPage = page(() => import("@/features/references/ReferenceLibraryPage"), "ReferenceLibraryPage");

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "shapes", element: <ExplorerPage /> },
      { path: "shapes/:slug", element: <ShapeDetailPage /> },
      { path: "compare", element: <ComparePage /> },
      { path: "beam", element: <BeamDesignPage /> },
      { path: "composite", element: <CompositeBeamPage /> },
      { path: "diagrams", element: <DiagramsPage /> },
      { path: "column", element: <ColumnDesignPage /> },
      { path: "member", element: <MemberCheckPage /> },
      { path: "frame", element: <FramePage /> },
      { path: "stability", element: <StabilityPage /> },
      { path: "fatigue", element: <FatiguePage /> },
      { path: "vibration", element: <VibrationPage /> },
      { path: "ponding", element: <PondingPage /> },
      { path: "fire", element: <FirePage /> },
      { path: "reference", element: <ReferencePage /> },
      { path: "references", element: <ReferenceLibraryPage /> },
      { path: "connections/bolts-welds", element: <BoltWeldGroupsPage /> },
      { path: "connections/shear", element: <ShearConnectionPage /> },
      { path: "connections/base-plate", element: <BasePlatePage /> },
      { path: "connections/concentrated-forces", element: <ConcentratedForcesPage /> },
      { path: "connections/moment", element: <MomentConnectionPage /> },
      { path: "connections/bracket", element: <BracketPage /> },
      { path: "connections/bracing", element: <BracingConnectionPage /> },
      { path: "connections/hanger", element: <HangerPage /> },
      { path: "connections/hss", element: <HssConnectionPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
