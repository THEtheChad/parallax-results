import type { Page } from "@playwright/test";
import { sortFn_alphanumeric } from "@tanstack/react-table";
import { fmtInterval, fmtRatio, platformName } from "../../site/src/data/format.ts";
import { KIND_LABEL, METRICS, type Comparison, type Index, type Kind, type ResultSummary } from "../../site/src/data/model.ts";
import { buildLabel, DEFAULT_PROJECT, RESULTS, stubIndex, type FixtureResult, type StubSet } from "./fixtures.ts";

/*
 * The audit's scenarios (docs/ui/AUDIT.md): sparse by construction. A data state appears only on
 * the surfaces that show it, a viewport only where layout is at stake. Every step states what a
 * healthy page shows (the hash route, the page's h1, the shell's active nav item, the first section title and
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

/** The site's brand, in the header of every page (site/src/components/Layout). Each page has its own h1. */
export const BRAND = "Parallax results";

export type NavItem = "Compare" | "Results" | "About";

/** The compare view CompareView draws for an index with no search but a project. */
export interface CompareDefaults {
  readonly kind: Kind;
  readonly metric: string;
  readonly reference: string;
  /** The comparisons it draws: one chart dot and one table row each. */
  readonly shown: readonly Comparison[];
}

/** What the real data holds, read from the built index, as the scenarios use it. */
export interface Fixtures {
  readonly real: {
    readonly index: Index;
    readonly results: number;
    /** The first row of the results list. */
    readonly newest: ResultSummary;
    /** The compare page with no search: its kind, metric label and project choices. */
    readonly compare: { readonly kind: Kind; readonly metric: string; readonly projects: readonly string[] };
  };
}

const unique = <T,>(xs: readonly T[]): T[] => [...new Set(xs)];
const mostCommon = (xs: readonly string[]): string | undefined => {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
};

/**
 * What CompareView shows for `project` with every other filter at its default (first kind, first
 * metric with data, both thread modes, every OS, the most common reference, nothing hidden).
 */
export function compareDefaults(index: Index, project?: string): CompareDefaults {
  const kind = unique(index.comparisons.map((c) => c.kind)).sort()[0] ?? "cli-bench";
  const inKind = index.comparisons.filter((c) => c.kind === kind);
  const p = project ?? unique(inKind.map((c) => c.project)).sort()[0];
  const inProject = inKind.filter((c) => c.project === p);
  const metric = METRICS[kind].find((m) => inProject.some((c) => c.metric === m.key));
  const scoped = inProject.filter((c) => c.metric === metric?.key);
  const reference = mostCommon(scoped.map((c) => c.reference)) ?? "";
  return { kind, metric: metric?.label ?? "", reference, shown: scoped.filter((c) => c.reference === reference) };
}

/** The real index, read the way CompareView picks its defaults (first kind, first project, first metric). */
export function realFixtures(index: Index): Fixtures {
  const newest = index.results[0];
  if (!newest) throw new Error("the real index has no results: the real scenarios need at least one");
  const { kind, metric } = compareDefaults(index);
  const projects = unique(index.comparisons.filter((c) => c.kind === kind).map((c) => c.project)).sort();
  return { real: { index, results: index.results.length, newest, compare: { kind, metric, projects } } };
}

export interface Expectation {
  /**
   * The exact hash route the step must end on, path plus search (`/results`, `/?project=umami`).
   * A step with no `act` defaults to the scenario's own route; a step that acts states it.
   */
  readonly route?: string | RegExp;
  /** The page's one h1, which names the page and its selection. Unsaid: any non-empty h1. */
  readonly heading?: string | RegExp;
  /** The nav item the shell marks active; null where none should be (a result page). */
  readonly nav: NavItem | null;
  /** The first section title (h2); null where the page should have none (an empty state). */
  readonly title: string | RegExp | null;
  /** Text that must be visible: proves the data set loaded. */
  readonly text?: readonly (string | RegExp)[];
  /** Text that must not be visible: proves a state held (e.g. the data has not arrived yet). */
  readonly absent?: readonly (string | RegExp)[];
  /** The ratio chart's dot count, read from ECharts: proves it drew the whole selection. 0: no chart. */
  readonly chartDots?: number;
  /** Text the ratio chart's tooltip must show, and so must be open. */
  readonly tooltip?: readonly (string | RegExp)[];
  /** The colour scheme the page renders in. Defaults to the viewport's (the OS setting). */
  readonly scheme?: "light" | "dark";
  /** The Compare page's Table, sorted by one column: its header's aria-sort and the column's cells, in order. */
  readonly sorted?: { readonly column: string; readonly direction: "ascending" | "descending"; readonly values: readonly string[] };
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
  /**
   * Record each Tab stop (role, name, focus ring) after the last step, at these viewports (desktop
   * if unsaid). The walk reloads the page and asserts the last step's expectation again first.
   */
  readonly keyboard?: { readonly presses: number; readonly viewports?: readonly Viewport[] };
  /** Console errors this scenario expects; any other makes its cell fail. */
  readonly allowConsole?: readonly RegExp[];
  /**
   * Requests (by URL) held unanswered until the scenario's cells are captured: the camera photographs
   * the page while they are in flight (the loading state) instead of waiting for them.
   */
  readonly hold?: RegExp;
}

/**
 * The supported viewports. The OS colour scheme is part of the name (`desktop-dark`), so a cell's
 * name says what it shows. `zoom200` is the desktop window at 200% zoom: 640×400 CSS px drawn at
 * device scale 2, so the 1280×800 screenshot shows what a zoomed user sees. It is an emulation, not
 * the browser's zoom.
 */
export type Viewport = "phone" | "tablet" | "desktop" | "desktop-dark" | "zoom200";

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
  readonly scale?: number;
  /** Mobile emulation, with touch. */
  readonly mobile?: boolean;
  readonly colorScheme: "light" | "dark";
}

export const viewportSizes: Record<Viewport, ViewportSize> = {
  phone: { width: 390, height: 844, mobile: true, colorScheme: "light" },
  tablet: { width: 768, height: 1024, mobile: true, colorScheme: "light" },
  desktop: { width: 1280, height: 800, colorScheme: "light" },
  "desktop-dark": { width: 1280, height: 800, colorScheme: "dark" },
  zoom200: { width: 640, height: 400, scale: 2, colorScheme: "light" },
};

const still = (expect: Step["expect"]): readonly Step[] => [{ name: "page", expect }];

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A result page's h1 (ResultView): the way back to the list, then kind · project · date. */
const resultHeading = (r: { kind: Kind; project: string; date: string }): RegExp => new RegExp(`${escape(`${KIND_LABEL[r.kind]} · ${r.project} · ${r.date}`)}$`);
const fixtureHeading = (r: FixtureResult): RegExp => resultHeading({ kind: r.kind, project: r.project.name, date: r.finishedAt.slice(0, 10) });
/** A result page's sections: the session first. */
const RESULT_TITLE = "the session";

/** The compare page's first section: the filters. Its h1 (the billboard's) names the selection. */
const COMPARE_TITLE = "tune in";
const compareHeading = (kind: Kind, project: string, metric: string): string => `${KIND_LABEL[kind]} · ${project} · ${metric}`;
/** The real compare view's h1, reference and dot count, for one project (the first if unsaid). */
const realCompare = (fx: Fixtures, project?: string): Pick<Expectation, "heading" | "title" | "chartDots"> & { reference: string } => {
  const d = compareDefaults(fx.real.index, project);
  const p = project ?? d.shown[0]?.project ?? "";
  return {
    heading: compareHeading(d.kind, p, d.metric),
    title: COMPARE_TITLE,
    chartDots: d.shown.length,
    reference: `1× = ${fx.real.index.builds.find((b) => b.key === d.reference)?.label ?? "–"}`,
  };
};
/** realCompare as an expectation, with the reference proved by the chart's legend. */
const realCompareExpect = (fx: Fixtures, project?: string, text: readonly (string | RegExp)[] = []): Pick<Expectation, "heading" | "title" | "chartDots" | "text"> => {
  const { reference, ...rest } = realCompare(fx, project);
  return { ...rest, text: [reference, ...text] };
};

/** The comparisons a compare view should draw, from a stub set's index. */
const dots = (set: StubSet, keep: (c: Index["comparisons"][number]) => boolean): number => stubIndex(set).comparisons.filter(keep).length;
const appWall = (c: Index["comparisons"][number]): boolean => c.kind === "cli-bench" && c.project === DEFAULT_PROJECT && c.metric === "cli.wallMs";
/** A stub compare view's h1 and first section, with its reference proved by the chart's legend. */
const stubCompare = (metric: string, kind: Kind = "cli-bench"): Pick<Expectation, "heading" | "title"> & { reference: string } => ({
  heading: compareHeading(kind, DEFAULT_PROJECT, metric),
  title: COMPARE_TITLE,
  reference: `1× = ${buildLabel("base")}`,
});

const EMPTY = "No results have been published yet.";
const COMPARE_LEDE = /One mark is one result/;
const TABLE = "liner notes";
const RESULTS_HEADING = "All results · newest first";
const RESULTS_TITLE = "the sessions";
const NOT_FOUND = "end of side A";
const published = (n: number): string => `${n} published result${n === 1 ? "" : "s"}`;
const BETA = buildLabel("beta");
const ALPHA_NEXT = buildLabel("alphaNext");
const LONG_LABEL = buildLabel("betaLong");

/** The page centre of one chart dot, by comparison id, from ECharts' own coordinates. */
async function dotPosition(page: Page, comparison: string): Promise<{ x: number; y: number }> {
  const at = await page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(".chart");
    const chart = el && echarts.getInstanceByDom(el);
    if (!el || !chart) return null;
    const series = (chart.getOption() as { series: { data?: { id?: string; value: number[] }[] }[] }).series;
    for (const s of series)
      for (const d of s?.data ?? [])
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

/** The dot the tooltip steps open: the first the real compare view draws. */
const tooltipDot = (fx: Fixtures): Comparison => {
  const c = compareDefaults(fx.real.index).shown[0];
  if (!c) throw new Error("the real compare view draws no dot");
  return c;
};

/** The Compare table's Build column, sorted as its header sorts it (TanStack's alphanumeric sort). */
const byBuild = (fx: Fixtures, project?: string): string[] => {
  const labels = compareDefaults(fx.real.index, project).shown.map((c) => fx.real.index.builds.find((b) => b.key === c.candidate)?.label ?? c.candidate);
  const row = (v: string) => ({ getValue: () => v }) as unknown as Parameters<typeof sortFn_alphanumeric>[0];
  return labels.sort((a, b) => sortFn_alphanumeric(row(a), row(b), "build"));
};

export const scenarios: readonly Scenario[] = [
  // ── Real data: every surface, as published ──────────────────────────────────────────────────────
  {
    id: "compare",
    persona: "visitor",
    data: "real",
    route: () => "/",
    viewports: ["desktop", "phone", "tablet", "zoom200"],
    steps: still((fx) => ({
      nav: "Compare",
      ...realCompareExpect(fx, undefined, [COMPARE_LEDE, TABLE]),
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
      heading: RESULTS_HEADING,
      title: RESULTS_TITLE,
      text: [published(fx.real.results), fx.real.newest.id.slice(0, 8)],
    })),
    keyboard: { presses: 40 },
  },
  {
    id: "result-newest",
    persona: "visitor",
    data: "real",
    route: (fx) => `/result/${fx.real.newest.id}`,
    viewports: ["desktop", "phone", "zoom200"],
    steps: still((fx) => ({ nav: null, heading: resultHeading(fx.real.newest), title: RESULT_TITLE, text: ["binaries", "every metric", "Record it again", fx.real.newest.machine.cpuModel] })),
    keyboard: { presses: 40 },
  },
  {
    id: "about",
    persona: "contributor",
    data: "real",
    route: () => "/about",
    viewports: ["desktop", "phone"],
    steps: still(() => ({ nav: "About", heading: "About · liner notes", title: "Side A · how to read it", text: ["What this is", "Side B · run it on your machine", "CONTRIBUTING.md"] })),
    keyboard: { presses: 30 },
  },
  // ── Real data: the states a visitor reaches without a fixture ───────────────────────────────────
  {
    // The chart's tooltip: hovered with a mouse; on a touch screen, a finger held on the dot (a full
    // tap is a click, which opens the dot's result instead).
    id: "compare-tooltip",
    persona: "visitor",
    data: "real",
    route: () => "/",
    viewports: ["desktop", "phone"],
    steps: [
      {
        name: "tooltip",
        act: async (page, fx) => {
          const id = tooltipDot(fx).id;
          await page.locator(".chart").evaluate((el) => el.scrollIntoView({ block: "center" }));
          await page.waitForTimeout(100);
          const at = await dotPosition(page, id);
          if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {
            const cdp = await page.context().newCDPSession(page);
            await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x, y: at.y }] });
          } else await page.mouse.move(at.x, at.y, { steps: 4 });
        },
        expect: (fx) => {
          const c = tooltipDot(fx);
          const r = fx.real.index.results.find((x) => x.id === c.result)!;
          return {
            route: "/",
            nav: "Compare",
            ...realCompareExpect(fx),
            tooltip: [fmtInterval(c.ratio), `${c.ratio.n} rounds`, `${platformName(r.machine.platform)} · ${r.machine.cpuModel}`],
          };
        },
      },
    ],
  },
  {
    // The Table under the chart, sorted from the keyboard by its Build header.
    id: "compare-sort",
    persona: "visitor",
    data: "real",
    route: () => "/",
    viewports: ["desktop"],
    steps: [
      {
        name: "sort-by-build",
        act: async (page) => {
          const table = page.locator("section", { has: page.getByRole("heading", { name: TABLE, exact: true }) });
          await table.getByRole("button", { name: "Build", exact: true }).press("Enter");
          await table.locator('th[aria-sort="ascending"]', { hasText: "Build" }).waitFor();
        },
        expect: (fx) => ({ route: "/", nav: "Compare", ...realCompareExpect(fx), sorted: { column: "Build", direction: "ascending", values: byBuild(fx) } }),
      },
    ],
  },
  {
    // Every build chip pressed off: the chart says nothing is left, the filters stay.
    id: "compare-all-hidden",
    persona: "visitor",
    data: "real",
    route: () => "/",
    viewports: ["desktop"],
    steps: [
      {
        name: "hide-every-build",
        act: async (page) => {
          const chips = page.getByRole("group", { name: "Builds shown" }).getByRole("button");
          const n = await chips.count();
          if (n === 0) throw new Error("no build chips");
          for (let i = 0; i < n; i++) {
            await chips.nth(i).click();
            await page.waitForFunction((k) => document.querySelectorAll('.chip[aria-pressed="false"]').length === k, i + 1);
          }
        },
        expect: (fx) => ({
          route: /^\/\?hide=[^&]+$/,
          nav: "Compare",
          heading: realCompare(fx).heading,
          title: COMPARE_TITLE,
          chartDots: 0,
          text: ["Nothing left to show: every build is hidden."],
        }),
      },
    ],
  },
  {
    // A shared link whose project, metric, OS and hidden build no longer exist: each filter falls
    // back to its first choice, so the link still shows the default view.
    id: "compare-stale-link",
    persona: "visitor",
    data: "real",
    route: () => "/?project=gone&metric=nope&os=plan9&hide=stale",
    viewports: ["desktop"],
    steps: still((fx) => ({ nav: "Compare", ...realCompareExpect(fx, undefined, [COMPARE_LEDE]) })),
  },
  {
    // A mistyped link: the site's not-found page, the end of the tape, with the way back.
    id: "unknown-route",
    persona: "visitor",
    data: "real",
    route: () => "/bogus/typo",
    viewports: ["desktop"],
    steps: still(() => ({ nav: null, heading: NOT_FOUND, title: null, text: ["Nothing was recorded at this address", "Rewind to Compare"] })),
  },
  {
    // The page while data/index.json is still on its way, photographed 1.5 s in: the shell, the
    // loading state (the router's pending component), and no data.
    id: "loading",
    persona: "visitor",
    data: "real",
    route: () => "/",
    viewports: ["desktop"],
    hold: /\/data\/index\.json$/,
    steps: still(() => ({ nav: "Compare", heading: "Loading results…", title: null, absent: [COMPARE_LEDE, TABLE, EMPTY] })),
  },
  // ── Journey: list → a result → Back → compare → a filter, the hash route held at each step ──────
  {
    id: "journey-results-to-compare",
    persona: "visitor",
    data: "real",
    route: () => "/results",
    viewports: ["desktop"],
    steps: [
      { name: "list", expect: (fx) => ({ nav: "Results", heading: RESULTS_HEADING, title: RESULTS_TITLE, text: [fx.real.newest.id.slice(0, 8)] }) },
      {
        name: "open-newest",
        act: async (page, fx) => {
          await page.getByRole("link", { name: fx.real.newest.id.slice(0, 8) }).first().click();
          await page.waitForURL((u) => u.hash === `#/result/${fx.real.newest.id}`);
        },
        expect: (fx) => ({ route: `/result/${fx.real.newest.id}`, nav: null, heading: resultHeading(fx.real.newest), title: RESULT_TITLE }),
      },
      {
        name: "browser-back",
        act: async (page) => {
          await page.goBack();
          await page.waitForURL((u) => u.hash === "#/results");
        },
        expect: (fx) => ({ route: "/results", nav: "Results", heading: RESULTS_HEADING, title: RESULTS_TITLE, text: [fx.real.newest.id.slice(0, 8)] }),
      },
      {
        name: "nav-compare",
        act: async (page) => {
          await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Compare" }).click();
          await page.waitForURL((u) => u.hash === "#/");
        },
        expect: (fx) => ({ route: "/", nav: "Compare", ...realCompareExpect(fx, undefined, [COMPARE_LEDE]) }),
      },
      {
        // Needs a second project; the real results have had two since the first publish.
        name: "change-project",
        act: async (page, fx) => {
          const other = fx.real.compare.projects[1];
          if (!other) throw new Error("the real results have one project: this step needs two");
          // A few projects are a segmented control; many are a select.
          const group = page.getByRole("group", { name: "Project" });
          if (await group.count()) await group.getByRole("button", { name: other, exact: true }).click();
          else await page.getByLabel("Project").selectOption(other);
          await page.waitForURL((u) => u.hash.includes("project="));
        },
        expect: (fx) => ({
          route: `/?project=${encodeURIComponent(fx.real.compare.projects[1] ?? "")}`,
          nav: "Compare",
          ...realCompareExpect(fx, fx.real.compare.projects[1]),
        }),
      },
    ],
  },
  // ── Journey: the theme menu's choice holds across a navigation and a reload ──────────────────────
  {
    id: "journey-theme",
    persona: "visitor",
    data: "real",
    route: () => "/",
    // The OS is light here, so dark can only come from the menu.
    viewports: ["desktop"],
    steps: [
      {
        name: "choose-dark",
        act: async (page) => {
          await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Dark theme" }).click();
          await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
        },
        expect: (fx) => ({ route: "/", nav: "Compare", ...realCompareExpect(fx), scheme: "dark" }),
      },
      {
        name: "open-result",
        act: async (page, fx) => {
          await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Results" }).click();
          await page.waitForURL((u) => u.hash === "#/results");
          await page.getByRole("link", { name: fx.real.newest.id.slice(0, 8) }).first().click();
          await page.waitForURL((u) => u.hash === `#/result/${fx.real.newest.id}`);
        },
        expect: (fx) => ({ route: `/result/${fx.real.newest.id}`, nav: null, heading: resultHeading(fx.real.newest), title: RESULT_TITLE, text: [fx.real.newest.machine.cpuModel], scheme: "dark" }),
      },
      {
        name: "reload",
        act: async (page) => {
          await page.reload();
        },
        expect: (fx) => ({ route: `/result/${fx.real.newest.id}`, nav: null, heading: resultHeading(fx.real.newest), title: RESULT_TITLE, text: [fx.real.newest.machine.cpuModel], scheme: "dark" }),
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
    steps: still(() => ({ nav: "Compare", heading: "blank tape", title: null, text: [EMPTY, "Run it on your machine"] })),
  },
  {
    id: "results-empty~stub",
    persona: "visitor",
    data: "empty",
    route: () => "/results",
    viewports: ["desktop"],
    steps: still(() => ({ nav: "Results", heading: RESULTS_HEADING, title: "blank tape", text: [EMPTY] })),
  },
  {
    // A link to a result that is not (or no longer) published: the index does not list it, so the
    // page is the not-found page (nothing is fetched).
    id: "result-missing~stub",
    persona: "visitor",
    data: "empty",
    route: () => "/result/0000000000000000",
    viewports: ["desktop"],
    steps: still(() => ({ nav: null, heading: NOT_FOUND, title: null, text: ["Nothing was recorded at this address"] })),
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
      ...stubCompare("wall time"),
      text: ["1 result from 1 machine", BETA, stubCompare("wall time").reference],
      chartDots: dots("one", appWall),
    })),
  },
  {
    id: "results-one~stub",
    persona: "visitor",
    data: "one",
    route: () => "/results",
    viewports: ["desktop"],
    steps: still(() => ({ nav: "Results", heading: RESULTS_HEADING, title: RESULTS_TITLE, text: [published(1), RESULTS.appLinux.id.slice(0, 8)] })),
  },
  // ── Many results: projects, both benchmarks, four machines, every call ──────────────────────────
  {
    id: "compare-many~stub",
    persona: "visitor",
    data: "many",
    route: () => "/",
    viewports: ["desktop", "desktop-dark", "phone", "zoom200"],
    steps: still(() => ({
      nav: "Compare",
      ...stubCompare("wall time"),
      text: ["3 results from 3 machines", "unresolved", "slower", "same ±5%", buildLabel("gammaLocal"), stubCompare("wall time").reference],
      chartDots: dots("many", appWall),
    })),
  },
  {
    id: "compare-many-lsp~stub",
    persona: "visitor",
    data: "many",
    route: () => "/?kind=lsp-bench",
    viewports: ["desktop", "phone"],
    steps: still(() => ({
      nav: "Compare",
      ...stubCompare("open: first diagnostics", "lsp-bench"),
      text: ["1 result from 1 machine", BETA, stubCompare("open: first diagnostics", "lsp-bench").reference],
      chartDots: dots("many", (c) => c.kind === "lsp-bench" && c.project === DEFAULT_PROJECT && c.metric === "open.firstDiagnosticsMs"),
    })),
  },
  {
    // A metric with no call, one thread mode, one OS: the narrowest the filters go on fixture-app.
    id: "compare-many-filtered~stub",
    persona: "visitor",
    data: "many",
    route: () => "/?metric=cli.cpuMs&threads=default&os=darwin",
    viewports: ["desktop"],
    steps: still(() => ({
      nav: "Compare",
      ...stubCompare("CPU time"),
      text: ["gets no call", "1 result from 1 machine", stubCompare("CPU time").reference],
      chartDots: dots("many", (c) => c.project === DEFAULT_PROJECT && c.metric === "cli.cpuMs" && c.mode === "default" && c.result === RESULTS.appMac.id),
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
      heading: RESULTS_HEADING,
      title: RESULTS_TITLE,
      text: [published(7), "Language server", RESULTS.edge.project.name, "(not in the suite)", LONG_LABEL],
    })),
  },
  {
    // Every edge on one page: long project, build and CPU labels, a failed candidate, too few
    // rounds, notes, rejected rounds, Low Power Mode, lowered priority, a dirty project, and a ratio
    // small enough to need significant figures.
    id: "result-edge~stub",
    persona: "visitor",
    data: "many",
    route: () => `/result/${RESULTS.edge.id}`,
    viewports: ["desktop", "phone", "zoom200"],
    steps: still(() => ({
      nav: null,
      heading: fixtureHeading(RESULTS.edge),
      title: RESULT_TITLE,
      text: [
        "too few rounds",
        "Low Power Mode on",
        "priority lowered (10)",
        "had local changes",
        "From the bench",
        "Rejected rounds",
        fmtRatio(Math.min(...RESULTS.edge.summary.candidates.flatMap((c) => (c.wallRatio ? [c.wallRatio.estimate] : [])))),
      ],
    })),
  },
  {
    id: "result-noisy~stub",
    persona: "visitor",
    data: "many",
    route: () => `/result/${RESULTS.appWindows.id}`,
    viewports: ["desktop"],
    steps: still(() => ({ nav: null, heading: fixtureHeading(RESULTS.appWindows), title: RESULT_TITLE, text: ["unresolved", buildLabel("gammaLocal"), "not every call settled", "plan: Balanced"] })),
  },
  {
    id: "result-lsp~stub",
    persona: "visitor",
    data: "many",
    route: () => `/result/${RESULTS.appLsp.id}`,
    viewports: ["desktop"],
    steps: still(() => ({ nav: null, heading: fixtureHeading(RESULTS.appLsp), title: RESULT_TITLE, text: ["session: memory", "typing: completion p95", "MB"] })),
  },
  // ── Journey: a chart dot opens its result; Back keeps the view; a chip hides a build ────────────
  {
    id: "journey-chart-to-result~stub",
    persona: "visitor",
    data: "many",
    route: () => "/",
    viewports: ["desktop"],
    steps: [
      { name: "compare", expect: () => ({ nav: "Compare", ...stubCompare("wall time"), chartDots: dots("many", appWall) }) },
      {
        // The Windows dot of beta: drawn last in its row, so no neighbour's hit target covers it.
        name: "click-dot",
        act: async (page) => {
          // The chart sits below the billboard: bring it into view before aiming at a dot.
          await page.locator(".chart").evaluate((el) => el.scrollIntoView({ block: "center" }));
          await page.waitForTimeout(100);
          const at = await dotPosition(page, `${RESULTS.appWindows.id}:beta:cli.wallMs`);
          await page.mouse.click(at.x, at.y);
          await page.waitForURL((u) => u.hash.startsWith("#/result/"));
        },
        expect: () => ({ route: `/result/${RESULTS.appWindows.id}`, nav: null, heading: fixtureHeading(RESULTS.appWindows), title: RESULT_TITLE }),
      },
      {
        name: "browser-back",
        act: async (page) => {
          await page.goBack();
          await page.waitForURL((u) => u.hash === "#/");
        },
        expect: () => ({ route: "/", nav: "Compare", ...stubCompare("wall time"), chartDots: dots("many", appWall) }),
      },
      {
        name: "hide-build",
        act: async (page) => {
          await page.getByRole("group", { name: "Builds shown" }).getByRole("button", { name: ALPHA_NEXT }).click();
          await page.waitForURL((u) => u.hash.includes("hide="));
        },
        expect: () => ({
          route: /^\/\?hide=/,
          nav: "Compare",
          ...stubCompare("wall time"),
          chartDots: dots("many", (c) => appWall(c) && c.candidate !== stubIndex("many").builds.find((b) => b.label === ALPHA_NEXT)?.key),
        }),
      },
    ],
  },
];
