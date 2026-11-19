import type { Page } from "@playwright/test";
import { KIND_LABEL, METRICS, type Index, type Kind, type ResultSummary } from "../../site/src/data/model.ts";
import { buildLabel, RESULTS, stubIndex, type FixtureResult, type StubSet } from "./fixtures.ts";

/*
 * The audit's scenarios (docs/ui/AUDIT.md): sparse by construction. A data state appears only on
 * the surfaces that show it, a viewport only where layout is at stake. Every step states what a
 * healthy page shows (the hash route, the h1, the shell's active nav item, the section title and
 * text from the data set), so the camera can refuse to photograph the wrong page.
 *
 * There is no sign-in: the "identity" the camera contract asks the shell to show is the site's own
 * header here (the brand, and which page the nav says you are on).
 */

export type PersonaKey = "visitor" | "contributor";

export interface Persona {
  readonly label: string;
}

export const personas: Record<PersonaKey, Persona> = {
  visitor: { label: "someone comparing TypeScript compiler and language-server implementations" },
  contributor: { label: "someone who has run the suite and wants to publish results" },
};

/** Where a scenario's data comes from: results/ as built (`real`), or a fixture set (`stub`). */
export type DataSet = "real" | StubSet;

/** The site's brand: the only h1, on every page (site/src/components/Layout). */
export const BRAND = "Parallax results";

export type NavItem = "Compare" | "Results" | "About";

/** What the real data holds, read from the built index, as the scenarios use it. */
export interface Fixtures {
  readonly real: {
    readonly results: number;
    /** The first row of the results list. */
    readonly newest: ResultSummary;
    /** The compare page with no search: its kind, metric label and project choices. */
    readonly compare: { readonly kind: Kind; readonly metric: string; readonly projects: readonly string[] };
  };
}

/** The real index, read the way CompareView picks its defaults (first kind, first project, first metric). */
export function realFixtures(index: Index): Fixtures {
  const newest = index.results[0];
  if (!newest) throw new Error("the real index has no results: the real scenarios need at least one");
  const kind = [...new Set(index.comparisons.map((c) => c.kind))].sort()[0] ?? "cli-bench";
  const projects = [...new Set(index.comparisons.filter((c) => c.kind === kind).map((c) => c.project))].sort();
  const inProject = index.comparisons.filter((c) => c.kind === kind && c.project === projects[0]);
  const metric = METRICS[kind].find((m) => inProject.some((c) => c.metric === m.key))?.label ?? "";
  return { real: { results: index.results.length, newest, compare: { kind, metric, projects } } };
}

export interface Expectation {
  /**
   * The exact hash route the step must end on, path plus search (`/results`, `/?project=umami`).
   * A step with no `act` defaults to the scenario's own route; a step that acts states it.
   */
  readonly route?: string | RegExp;
  /** The page's one h1. Defaults to the brand: every page has the same one. */
  readonly heading?: string | RegExp;
  /** The nav item the shell marks active; null where none should be (a result page). */
  readonly nav: NavItem | null;
  /** The first section title (h2); null where the page should have none (an empty state). */
  readonly title: string | RegExp | null;
  /** Text that must be visible: proves the data set loaded. */
  readonly text?: readonly (string | RegExp)[];
  /** The ratio chart's dot count, read from ECharts: proves it drew the whole selection. */
  readonly chartDots?: number;
}

export interface Step {
  readonly name: string;
  readonly act?: (page: Page, fx: Fixtures) => Promise<void>;
  readonly expect: (fx: Fixtures) => Expectation;
}

export interface Scenario {
  /** Stub scenarios end in `~stub` (the camera contract); capture.ts refuses one that doesn't. */
  readonly id: string;
  readonly persona: PersonaKey;
  readonly data: DataSet;
  /** The hash route the scenario opens. */
  readonly route: (fx: Fixtures) => string;
  readonly viewports: readonly Viewport[];
  /** A still has one step; a journey several, each asserted and captured. */
  readonly steps: readonly Step[];
  /** Record each Tab stop (role, name, focus ring) after the last step, at these viewports (desktop if unsaid). */
  readonly keyboard?: { readonly presses: number; readonly viewports?: readonly Viewport[] };
  /** Console errors this scenario expects; any other makes its cell fail. */
  readonly allowConsole?: readonly RegExp[];
  /** The OS colour scheme. The site follows it unless its theme menu says otherwise. */
  readonly colorScheme?: "light" | "dark";
}

/**
 * `zoom200` is the desktop window at 200% zoom: 640×400 CSS px drawn at device scale 2, so the
 * 1280×800 screenshot shows what a zoomed user sees. It is an emulation, not the browser's zoom.
 */
export type Viewport = "phone" | "desktop" | "zoom200";

export const viewportSizes: Record<Viewport, { width: number; height: number; scale?: number; mobile?: boolean }> = {
  phone: { width: 390, height: 844, mobile: true },
  desktop: { width: 1280, height: 800 },
  zoom200: { width: 640, height: 400, scale: 2 },
};

const still = (expect: Step["expect"]): readonly Step[] => [{ name: "page", expect }];

/** A result page's section title (ResultView). */
const resultTitle = (r: { kind: Kind; project: string; date: string }): string => `${KIND_LABEL[r.kind]} · ${r.project} · ${r.date}`;
const fixtureTitle = (r: FixtureResult): string => resultTitle({ kind: r.kind, project: r.project.name, date: r.finishedAt.slice(0, 10) });
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The comparisons a compare view should draw, from a stub set's index. */
const dots = (set: StubSet, keep: (c: Index["comparisons"][number]) => boolean): number => stubIndex(set).comparisons.filter(keep).length;
const honoWall = (c: Index["comparisons"][number]): boolean => c.kind === "cli-bench" && c.project === "hono" && c.metric === "cli.wallMs";

const EMPTY = "No results have been published yet.";
const COMPARE_LEDE = /Each dot is one published result/;
const TSRS = buildLabel("tsrs");
const TSC71 = buildLabel("tsc71");
const NIGHTLY = buildLabel("tsrsNightly");

/** The page centre of one chart dot, by comparison id, from ECharts' own coordinates. */
async function dotPosition(page: Page, comparison: string): Promise<{ x: number; y: number }> {
  const at = await page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(".chart");
    const chart = el && echarts.getInstanceByDom(el);
    if (!el || !chart) return null;
    const series = (chart.getOption() as { series: { data?: { id?: string; value: number[] }[] }[] }).series;
    for (const s of series)
      for (const d of s.data ?? [])
        if (d.id === id) {
          const [x, y] = chart.convertToPixel({ gridIndex: 0 }, [d.value[2]!, d.value[3]!]) as number[];
          const box = el.getBoundingClientRect();
          return { x: box.x + x!, y: box.y + y! };
        }
    return null;
  }, comparison);
  if (!at) throw new Error(`no chart dot ${comparison}`);
  return at;
}

export const scenarios: readonly Scenario[] = [
  // ── Real data: every surface, as published ──────────────────────────────────────────────────────
  {
    id: "compare",
    persona: "visitor",
    data: "real",
    route: () => "/",
    viewports: ["desktop", "phone", "zoom200"],
    steps: still((fx) => ({
      nav: "Compare",
      title: new RegExp(`^${escape(fx.real.compare.metric)} · ${escape(fx.real.compare.projects[0] ?? "")} · against `),
      text: [COMPARE_LEDE, "Table"],
    })),
    // Zoomed is where keyboard users who also magnify lose the focus ring off-screen.
    keyboard: { presses: 70, viewports: ["desktop", "zoom200"] },
  },
  {
    id: "results",
    persona: "visitor",
    data: "real",
    route: () => "/results",
    viewports: ["desktop", "phone"],
    steps: still((fx) => ({
      nav: "Results",
      title: "All results",
      text: [`${fx.real.results} published result${fx.real.results === 1 ? "" : "s"}`, fx.real.newest.id.slice(0, 8)],
    })),
    keyboard: { presses: 40 },
  },
  {
    id: "result",
    persona: "visitor",
    data: "real",
    route: (fx) => `/result/${fx.real.newest.id}`,
    viewports: ["desktop", "phone", "zoom200"],
    steps: still((fx) => ({ nav: null, title: resultTitle(fx.real.newest), text: ["Binaries", "Comparisons", fx.real.newest.machine.cpuModel] })),
    keyboard: { presses: 40 },
  },
  {
    id: "about",
    persona: "contributor",
    data: "real",
    route: () => "/about",
    viewports: ["desktop", "phone"],
    steps: still(() => ({ nav: "About", title: "What this is", text: ["Contributing results", "CONTRIBUTING.md"] })),
    keyboard: { presses: 30 },
  },
  // ── Journey: list → a result → Back → compare → a filter, the hash route held at each step ──────
  {
    id: "journey-results-to-compare",
    persona: "visitor",
    data: "real",
    route: () => "/results",
    viewports: ["desktop"],
    steps: [
      { name: "list", expect: (fx) => ({ nav: "Results", title: "All results", text: [fx.real.newest.id.slice(0, 8)] }) },
      {
        name: "open-newest",
        act: async (page, fx) => {
          await page.getByRole("link", { name: fx.real.newest.id.slice(0, 8), exact: true }).click();
          await page.waitForURL((u) => u.hash === `#/result/${fx.real.newest.id}`);
        },
        expect: (fx) => ({ route: `/result/${fx.real.newest.id}`, nav: null, title: resultTitle(fx.real.newest) }),
      },
      {
        name: "browser-back",
        act: async (page) => {
          await page.goBack();
          await page.waitForURL((u) => u.hash === "#/results");
        },
        expect: (fx) => ({ route: "/results", nav: "Results", title: "All results", text: [fx.real.newest.id.slice(0, 8)] }),
      },
      {
        name: "nav-compare",
        act: async (page) => {
          await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Compare" }).click();
          await page.waitForURL((u) => u.hash === "#/");
        },
        expect: (fx) => ({ route: "/", nav: "Compare", title: new RegExp(` · ${escape(fx.real.compare.projects[0] ?? "")} · `), text: [COMPARE_LEDE] }),
      },
      {
        // Needs a second project; the real results have had two since the first publish.
        name: "change-project",
        act: async (page, fx) => {
          const other = fx.real.compare.projects[1];
          if (!other) throw new Error("the real results have one project: this step needs two");
          await page.getByLabel("Project").selectOption(other);
          await page.waitForURL((u) => u.hash.includes("project="));
        },
        expect: (fx) => ({
          route: `/?project=${encodeURIComponent(fx.real.compare.projects[1] ?? "")}`,
          nav: "Compare",
          title: new RegExp(` · ${escape(fx.real.compare.projects[1] ?? "")} · `),
        }),
      },
    ],
  },
  // ── No results ───────────────────────────────────────────────────────────────────────────────────
  {
    id: "compare-empty~stub",
    persona: "visitor",
    data: "empty",
    route: () => "/",
    viewports: ["desktop", "phone"],
    steps: still(() => ({ nav: "Compare", title: null, text: [EMPTY] })),
  },
  {
    id: "results-empty~stub",
    persona: "visitor",
    data: "empty",
    route: () => "/results",
    viewports: ["desktop"],
    steps: still(() => ({ nav: "Results", title: null, text: [EMPTY] })),
  },
  {
    // A link to a result that is not (or no longer) published: the fetch 404s and the page says so.
    id: "result-missing~stub",
    persona: "visitor",
    data: "empty",
    route: () => "/result/0000000000000000",
    viewports: ["desktop"],
    steps: still(() => ({ nav: null, title: null, text: [/Could not load the results: result 0000000000000000: HTTP 404/] })),
    allowConsole: [/status of 404/, /HTTP 404/, /The above error occurred/],
  },
  // ── One result ───────────────────────────────────────────────────────────────────────────────────
  {
    id: "compare-one~stub",
    persona: "visitor",
    data: "one",
    route: () => "/",
    viewports: ["desktop", "phone"],
    steps: still(() => ({
      nav: "Compare",
      title: `wall time · hono · against ${buildLabel("tsc702")}`,
      text: ["1 result from 1 machine", TSRS],
      chartDots: dots("one", honoWall),
    })),
  },
  {
    id: "results-one~stub",
    persona: "visitor",
    data: "one",
    route: () => "/results",
    viewports: ["desktop"],
    steps: still(() => ({ nav: "Results", title: "All results", text: ["1 published result,", RESULTS.honoLinux.id.slice(0, 8)] })),
  },
  // ── Many results: projects, both benchmarks, four machines, every call ──────────────────────────
  {
    id: "compare-many~stub",
    persona: "visitor",
    data: "many",
    route: () => "/",
    viewports: ["desktop", "phone", "zoom200"],
    steps: still(() => ({
      nav: "Compare",
      title: `wall time · hono · against ${buildLabel("tsc702")}`,
      text: ["3 results from 3 machines", "unresolved", "slower", "same ±5%", buildLabel("forkLocal")],
      chartDots: dots("many", honoWall),
    })),
  },
  {
    id: "compare-many-dark~stub",
    persona: "visitor",
    data: "many",
    route: () => "/",
    viewports: ["desktop"],
    colorScheme: "dark",
    steps: still(() => ({ nav: "Compare", title: `wall time · hono · against ${buildLabel("tsc702")}`, chartDots: dots("many", honoWall) })),
  },
  {
    id: "compare-many-lsp~stub",
    persona: "visitor",
    data: "many",
    route: () => "/?kind=lsp-bench",
    viewports: ["desktop", "phone"],
    steps: still(() => ({
      nav: "Compare",
      title: `open: first diagnostics · hono · against ${buildLabel("tsc702")}`,
      text: ["1 result from 1 machine", TSRS],
      chartDots: dots("many", (c) => c.kind === "lsp-bench" && c.project === "hono" && c.metric === "open.firstDiagnosticsMs"),
    })),
  },
  {
    // A metric with no call, one thread mode, one OS: the narrowest the filters go on hono.
    id: "compare-many-filtered~stub",
    persona: "visitor",
    data: "many",
    route: () => "/?metric=cli.cpuMs&threads=default&os=darwin",
    viewports: ["desktop"],
    steps: still(() => ({
      nav: "Compare",
      title: `CPU time · hono · against ${buildLabel("tsc702")}`,
      text: ["this metric gets no call", "1 result from 1 machine"],
      chartDots: dots("many", (c) => c.project === "hono" && c.metric === "cli.cpuMs" && c.mode === "default" && c.result === RESULTS.honoMac.id),
    })),
  },
  {
    id: "results-many~stub",
    persona: "visitor",
    data: "many",
    route: () => "/results",
    viewports: ["desktop", "phone"],
    steps: still(() => ({
      nav: "Results",
      title: "All results",
      text: ["7 published results", "Language server", RESULTS.edge.project.name, "(not in the suite)", NIGHTLY],
    })),
  },
  {
    // Every edge on one page: long project, build and CPU labels, a failed candidate, too few
    // rounds, notes, rejected rounds, Low Power Mode, lowered priority, a dirty project.
    id: "result-edge~stub",
    persona: "visitor",
    data: "many",
    route: () => `/result/${RESULTS.edge.id}`,
    viewports: ["desktop", "phone", "zoom200"],
    steps: still(() => ({
      nav: null,
      title: fixtureTitle(RESULTS.edge),
      text: ["too few rounds", "Low Power Mode on", "priority lowered (10)", "had local changes", "Notes from the bench", "Rejected rounds", "0.023×"],
    })),
  },
  {
    id: "result-noisy~stub",
    persona: "visitor",
    data: "many",
    route: () => `/result/${RESULTS.honoWindows.id}`,
    viewports: ["desktop"],
    steps: still(() => ({ nav: null, title: fixtureTitle(RESULTS.honoWindows), text: ["unresolved", buildLabel("forkLocal"), "not every call settled", "plan: Balanced"] })),
  },
  {
    id: "result-lsp~stub",
    persona: "visitor",
    data: "many",
    route: () => `/result/${RESULTS.honoLsp.id}`,
    viewports: ["desktop"],
    steps: still(() => ({ nav: null, title: fixtureTitle(RESULTS.honoLsp), text: ["session: memory", "typing: completion p95", "MB"] })),
  },
  // ── Journey: a chart dot opens its result; Back keeps the view; a chip hides a build ────────────
  {
    id: "journey-chart-to-result~stub",
    persona: "visitor",
    data: "many",
    route: () => "/",
    viewports: ["desktop"],
    steps: [
      { name: "compare", expect: () => ({ nav: "Compare", title: /^wall time · hono · /, chartDots: dots("many", honoWall) }) },
      {
        // The Windows dot of tsrs: drawn last in its row, so no neighbour's hit target covers it.
        name: "click-dot",
        act: async (page) => {
          const at = await dotPosition(page, `${RESULTS.honoWindows.id}:tsrs:cli.wallMs`);
          await page.mouse.click(at.x, at.y);
          await page.waitForURL((u) => u.hash.startsWith("#/result/"));
        },
        expect: () => ({ route: `/result/${RESULTS.honoWindows.id}`, nav: null, title: fixtureTitle(RESULTS.honoWindows) }),
      },
      {
        name: "browser-back",
        act: async (page) => {
          await page.goBack();
          await page.waitForURL((u) => u.hash === "#/");
        },
        expect: () => ({ route: "/", nav: "Compare", title: /^wall time · hono · /, chartDots: dots("many", honoWall) }),
      },
      {
        name: "hide-build",
        act: async (page) => {
          await page.getByRole("group", { name: "Builds shown" }).getByRole("button", { name: TSC71 }).click();
          await page.waitForURL((u) => u.hash.includes("hide="));
        },
        expect: () => ({
          route: /^\/\?hide=/,
          nav: "Compare",
          title: /^wall time · hono · /,
          chartDots: dots("many", (c) => honoWall(c) && c.candidate !== stubIndex("many").builds.find((b) => b.label === TSC71)?.key),
        }),
      },
    ],
  },
];
