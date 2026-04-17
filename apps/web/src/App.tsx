import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { RunDetailPage } from "./pages/RunDetailPage";
import { TracePage } from "./pages/TracePage";
import { ComparePage } from "./pages/ComparePage";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <DashboardPage /> },
      { path: "/runs/:pipelineId", element: <RunDetailPage /> },
      { path: "/runs/:pipelineId/agent/:agentId", element: <TracePage /> },
      { path: "/compare", element: <ComparePage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
