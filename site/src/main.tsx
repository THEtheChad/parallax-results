import { createHashHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { About } from "./components/About/About.tsx";
import { CompareView, type CompareSearch, type Threads } from "./components/CompareView/CompareView.tsx";
import { Layout } from "./components/Layout/Layout.tsx";
import { ResultsList } from "./components/ResultsList/ResultsList.tsx";
import { ResultView } from "./components/ResultView/ResultView.tsx";
import type { Kind } from "./data/model.ts";
import { applyTheme, storedTheme } from "./theme.ts";
import "./styles.css";

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

// Unknown values are dropped here; CompareView falls back for values that do not match the data.
function compareSearch(raw: Record<string, unknown>): CompareSearch {
  const kind = str(raw.kind);
  const threads = str(raw.threads);
  return {
    kind: kind === "cli-bench" || kind === "lsp-bench" ? (kind as Kind) : undefined,
    project: str(raw.project),
    metric: str(raw.metric),
    threads: threads === "default" || threads === "single" ? (threads as Threads) : undefined,
    ref: str(raw.ref),
    os: str(raw.os),
    hide: str(raw.hide),
  };
}

const rootRoute = createRootRoute({ component: Layout });
const compareRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", validateSearch: compareSearch, component: CompareView });
const resultsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/results", component: ResultsList });
const resultRoute = createRoute({ getParentRoute: () => rootRoute, path: "/result/$id", component: ResultView });
const aboutRoute = createRoute({ getParentRoute: () => rootRoute, path: "/about", component: About });

const routeTree = rootRoute.addChildren([compareRoute, resultsRoute, resultRoute, aboutRoute]);
// Hash history: a static host serves index.html for every view without rewrite rules.
const router = createRouter({ routeTree, history: createHashHistory(), scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

applyTheme(storedTheme());
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
