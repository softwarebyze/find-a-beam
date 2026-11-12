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
const ReferencePage = page(() => import("@/features/reference/ReferencePage"), "ReferencePage");

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
      { path: "column", element: <ColumnDesignPage /> },
      { path: "member", element: <MemberCheckPage /> },
      { path: "reference", element: <ReferencePage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
