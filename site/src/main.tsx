import { createHashHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { About } from "./components/About/About.tsx";
import { CompareView, type CompareSearch, type Threads } from "./components/CompareView/CompareView.tsx";
import { Layout } from "./components/Layout/Layout.tsx";
import { Loading } from "./components/Loading/Loading.tsx";
import { NotFound } from "./components/NotFound/NotFound.tsx";
import { ResultsList } from "./components/ResultsList/ResultsList.tsx";
import { ResultView } from "./components/ResultView/ResultView.tsx";
import type { Kind } from "./data/model.ts";
import { applyTheme, storedTheme } from "./theme.ts";
// The house faces, self-hosted (no font CDN): Geist Mono for text and figures, Yellowtail for the
// neon section words, Cedarville Cursive for captions. Latin subsets only; each swaps in when loaded.
import "@fontsource-variable/geist-mono/wght.css";
import "@fontsource/yellowtail/latin-400.css";
import "@fontsource/cedarville-cursive/latin-400.css";
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
// The router suspends each page in its own boundary, so its pending and not-found components are
// what a visitor sees while the index loads and at an unknown address.
const router = createRouter({
  routeTree,
  history: createHashHistory(),
  scrollRestoration: true,
  defaultPendingComponent: Loading,
  defaultNotFoundComponent: NotFound,
});

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
