import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type Browser, type BrowserContext, chromium, type Page } from "@playwright/test";
import type { Index } from "../../site/src/data/model.ts";
import { describeSets, STUB_SETS, writeFixtureSets } from "./fixtures.ts";
import { type Expectation, type Fixtures, type PersonaKey, realFixtures, type Scenario, scenarios, viewportSizes } from "./scenarios.ts";
import { serve } from "./serve.ts";

/*
 * The audit's camera (docs/ui/AUDIT.md). It has no opinions: it builds the site for production,
 * serves the build once per data set, drives every scenario, and for each step asserts the page is
 * the one intended BEFORE it keeps any evidence. A step that fails its assertions is recorded as
 * `failed`, never as a clean screenshot a reviewer could critique. It writes what the ui-audit
 * skill's camera contract (.claude/skills/ui-audit/camera-contract.md) promises, and exits 1
 * unless every expected cell is valid.
 *
 *   node scripts/ui-audit/capture.ts [--only <id-substring>] [--no-build]
 *
 * Hermetic: the one third-party request the site makes (Apache ECharts from cdnjs) is answered from
 * node_modules after checking that file against the page's integrity hash, and every other request
 * that leaves 127.0.0.1 is refused and fails its cell. No network is needed.
 */

const REPO = resolve(import.meta.dirname, "../..");
const ROOT = import.meta.dirname;
const DIST = join(REPO, "dist");
const PORT = Number(process.env.AUDIT_PORT ?? 4179);
const arg = (name: string): string | undefined => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const only = arg("--only");
const reuseBuild = process.argv.includes("--no-build");

const capturedAt = new Date().toISOString();
const runId = capturedAt.replace(/[:.]/g, "-").slice(0, 19);
const runDir = join(ROOT, "runs", runId);
mkdirSync(runDir, { recursive: true });

type Status = "valid" | "failed" | "blocked";

/** A keyboard walk's step name: its cell is `<scenario>.keyboard@<viewport>`. */
const KEYBOARD = "keyboard";

interface CellRecord {
  scenario: string;
  step: string;
  viewport: string;
  persona: PersonaKey;
  mode: "real" | "stub";
  data: string;
  url: string;
  status: Status;
  unasserted: string[];
  problems: string[];
  consoleErrors: string[];
  files: Record<string, string>;
}

const cells: CellRecord[] = [];
const modeOf = (sc: Scenario): "real" | "stub" => (sc.data === "real" ? "real" : "stub");

// ── The build and what it loads from elsewhere ───────────────────────────────────────────────────

if (!reuseBuild) {
  process.stdout.write("pnpm build …\n");
  execSync("pnpm build", { cwd: REPO, stdio: ["ignore", "ignore", "inherit"] });
}
if (!existsSync(join(DIST, "index.html"))) throw new Error("no dist/index.html: run without --no-build");

/**
 * The ECharts file the page asks cdnjs for, served from node_modules instead, but only if it is
 * byte-for-byte what the page's integrity attribute pins (the browser would refuse anything else).
 */
function echartsFromNodeModules(): { url: string; version: string; body: Buffer } {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const tag = html.match(/<script[^>]*src="(https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/echarts\/([^/]+)\/echarts\.min\.js)"[^>]*>/);
  const integrity = tag?.[0].match(/integrity="(sha\d+)-([^"]+)"/);
  if (!tag?.[1] || !tag[2] || !integrity?.[1] || !integrity[2]) throw new Error("dist/index.html has no pinned, integrity-checked ECharts script");
  const pkg = JSON.parse(readFileSync(join(REPO, "node_modules/echarts/package.json"), "utf8")) as { version: string };
  if (pkg.version !== tag[2]) throw new Error(`index.html loads ECharts ${tag[2]} but node_modules has ${pkg.version}: align the devDependency`);
  const body = readFileSync(join(REPO, "node_modules/echarts/dist/echarts.min.js"));
  const digest = createHash(integrity[1]).update(body).digest("base64");
  if (digest !== integrity[2])
    throw new Error(`node_modules/echarts/dist/echarts.min.js does not match index.html's ${integrity[1]} integrity: the CDN file differs, so captures cannot be hermetic`);
  return { url: tag[1], version: pkg.version, body };
}
const echartsFile = echartsFromNodeModules();

// ── Data sets and the server ─────────────────────────────────────────────────────────────────────

const dataDirs: Record<string, string> = { real: join(DIST, "data"), ...writeFixtureSets() };
const fixtures: Fixtures = realFixtures(JSON.parse(readFileSync(join(DIST, "data/index.json"), "utf8")) as Index);
const server = await serve({ port: PORT, dist: DIST, data: dataDirs });
const ORIGIN = server.origin;
const BUILD =
  process.env.AUDIT_BUILD ??
  `${reuseBuild ? "dist/ from an earlier `pnpm build`" : "`pnpm build` (vite build, production)"}, served by scripts/ui-audit/serve.ts at ${ORIGIN}/<data set>/; ECharts ${echartsFile.version} from node_modules (integrity-checked)`;

// ── Assertions ───────────────────────────────────────────────────────────────────────────────────

/**
 * In-flight requests per page. A hash navigation is same-document, so Playwright's load states
 * have long been reached when its data fetch starts: settle() waits on this count instead.
 */
const inFlight = new WeakMap<Page, { count: number; last: number }>();
function trackRequests(page: Page) {
  const t = { count: 0, last: Date.now() };
  inFlight.set(page, t);
  page.on("request", () => {
    t.count++;
    t.last = Date.now();
  });
  const done = () => {
    t.count--;
    t.last = Date.now();
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  const t = inFlight.get(page);
  for (const deadline = Date.now() + 15_000; t && (t.count > 0 || Date.now() - t.last < 300); ) {
    if (Date.now() > deadline) throw new Error(`network never went quiet: ${t.count} requests in flight`);
    await page.waitForTimeout(50);
  }
  await page.evaluate(() => document.fonts.ready);
  // The pages suspend until their data arrives: wait out the fallback, not a fixed time.
  await page.getByText("Loading results…").waitFor({ state: "detached", timeout: 15_000 });
  // ECharts animates in JavaScript (reduced motion does not reach it): let its 650 ms update finish.
  if (await page.locator(".chart svg").count()) await page.waitForTimeout(900);
  else await page.waitForTimeout(150);
}

const matches = (actual: string, want: string | RegExp): boolean => (typeof want === "string" ? actual === want : want.test(actual));

async function check(page: Page, sc: Scenario, exp: Expectation, route: string | RegExp | undefined): Promise<string[]> {
  const problems: string[] = [];
  const at = new URL(page.url());
  if (at.origin !== ORIGIN) problems.push(`left the site: ${page.url()}`);
  if (at.pathname !== `/${sc.data}/`) problems.push(`on data set ${at.pathname}, expected /${sc.data}/`);
  const hashRoute = decodeURIComponent(at.hash.replace(/^#/, "")) || "/";
  if (route !== undefined && !matches(hashRoute, typeof route === "string" ? decodeURIComponent(route) : route))
    problems.push(`on #${hashRoute}, expected #${route}`);

  const h1s = await page.locator("h1").allInnerTexts();
  if (h1s.length !== 1) problems.push(`expected one h1, found ${h1s.length}`);
  const heading = (h1s[0] ?? "").trim();
  if (!matches(heading, exp.heading ?? "Parallax results")) problems.push(`h1 "${heading}" does not match ${exp.heading ?? "Parallax results"}`);

  // The shell: the brand in the header, and the nav marking this page (none on a result page).
  const brand = await page.locator("header h1").isVisible().catch(() => false);
  if (!brand) problems.push("the header's brand is not visible");
  const active = (await page.locator('header nav[aria-label="Pages"] a[data-status="active"]').allInnerTexts()).map((t) => t.trim());
  const wantNav = exp.nav ? [exp.nav] : [];
  if (active.join("|") !== wantNav.join("|")) problems.push(`active nav [${active.join(", ")}], expected [${wantNav.join(", ")}]`);

  const titles = (await page.locator("h2").allInnerTexts()).map((t) => t.trim());
  if (exp.title === null) {
    if (titles.length) problems.push(`expected no section title, found "${titles[0]}"`);
  } else if (!titles[0] || !matches(titles[0], exp.title)) problems.push(`first h2 "${titles[0] ?? ""}" does not match ${exp.title}`);

  for (const t of exp.text ?? []) {
    const shown = await page
      .getByText(t)
      .first()
      .isVisible()
      .catch(() => false);
    if (!shown) problems.push(`expected text ${t} not visible`);
  }
  if (exp.chartDots !== undefined) {
    const drawn = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".chart");
      const chart = el && echarts.getInstanceByDom(el);
      if (!chart) return null;
      const series = (chart.getOption() as { series: { type?: string; data?: unknown[] }[] }).series;
      return series.filter((s) => s.type === "custom").reduce((n, s) => n + (s.data?.length ?? 0), 0);
    });
    if (drawn !== exp.chartDots) problems.push(`chart has ${drawn ?? "no"} dots, expected ${exp.chartDots}`);
  }
  return problems;
}

/** Rendered-reality probes no source reading can make. */
async function probes(page: Page) {
  return page.evaluate(() => {
    // Rendered for a sighted user: not hidden, not sr-only.
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && el.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    };
    const describe = (el: Element) => {
      const name = el.getAttribute("aria-label") ?? (el as HTMLElement).innerText?.trim().slice(0, 60) ?? "";
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].join(".")}` : ""} "${name}"`;
    };
    const pageOverflowX = document.documentElement.scrollWidth > window.innerWidth + 1;
    const clipped: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      if (!vis(el) || el.children.length > 0 || el.closest("svg")) continue;
      const s = getComputedStyle(el);
      if ((s.overflow === "hidden" || s.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1)
        clipped.push(`${describe(el)} (ellipsis: ${s.textOverflow === "ellipsis"})`);
    }
    // Text taller than its fixed-height box spills over its neighbours: nothing clips, so the
    // leaf rule above cannot see it.
    const spills: string[] = [];
    for (const el of document.querySelectorAll(".chip, .call, td, th")) {
      if (!vis(el)) continue;
      if (el.scrollHeight > el.clientHeight + 2) spills.push(`${describe(el)} content ${el.scrollHeight}px in ${el.clientHeight}px`);
    }
    // Tables scroll sideways inside .table-wrap by design; say which do, at this width.
    const scrollsX = [...document.querySelectorAll(".table-wrap")]
      .filter((el) => vis(el) && el.scrollWidth > el.clientWidth + 1)
      .map((el) => `${el.closest("section")?.querySelector("h2")?.textContent?.trim() ?? "table"}: ${el.scrollWidth}px in ${el.clientWidth}px`);
    const smallTargets: string[] = [];
    for (const el of document.querySelectorAll("a[href], button, [role=button], [role=tab], [role=menuitem], input, select, [role=checkbox], [role=combobox]")) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) smallTargets.push(`${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    // The site has no heading face of its own: when the h1's face is the body's, the probe has
    // nothing to find, and says so.
    const h1 = document.querySelector("h1");
    const headingFace = h1 ? getComputedStyle(h1).fontFamily : "";
    const bodyFace = getComputedStyle(document.body).fontFamily;
    const headingFont: string[] = [];
    if (headingFace && headingFace !== bodyFace)
      for (const el of document.querySelectorAll("body *")) {
        if (!vis(el) || el.children.length > 0) continue;
        if (getComputedStyle(el).fontFamily === headingFace && !el.closest("h1, h2, h3, h4")) headingFont.push(describe(el));
      }
    const outline = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(vis).map((h) => `${h.tagName} ${(h as HTMLElement).innerText.trim().slice(0, 80)}`);
    const landmarks = [
      ...document.querySelectorAll("main, nav, header, aside, footer, section[aria-label], [role=main], [role=navigation], [role=banner], [role=complementary], [role=region], [role=contentinfo]"),
    ]
      .filter(vis)
      .map((l) => `${l.getAttribute("role") ?? l.tagName.toLowerCase()}${l.getAttribute("aria-label") ? ` "${l.getAttribute("aria-label")}"` : ""}`);
    // The ratio charts: their size against their card, and what ECharts was given to draw.
    const charts = [...document.querySelectorAll<HTMLElement>(".chart")].map((el) => {
      const r = el.getBoundingClientRect();
      const card = el.closest(".card")?.getBoundingClientRect();
      const option = echarts.getInstanceByDom(el)?.getOption() as { series?: { type?: string; data?: unknown[] }[] } | undefined;
      return {
        label: el.getAttribute("aria-label"),
        width: Math.round(r.width),
        height: Math.round(r.height),
        overflowsCard: card ? r.right > card.right + 1 : null,
        dots: option?.series?.filter((s) => s.type === "custom").reduce((n, s) => n + (s.data?.length ?? 0), 0) ?? null,
      };
    });
    return {
      pageOverflowX,
      clipped: clipped.slice(0, 40),
      spills: spills.slice(0, 40),
      smallTargets: smallTargets.slice(0, 40),
      headingFontOutsideTitles: headingFont.slice(0, 20),
      headingFace: headingFace === bodyFace ? `same as body: ${bodyFace}` : headingFace,
      outline,
      landmarks,
      tablesScrollX: scrollsX,
      charts,
    };
  });
}

/** Grow the viewport to the scrolling main region so one shot holds all of it. */
async function fullShot(page: Page, path: string, height: number) {
  // What the supported viewport actually shows, before growing it.
  await page.screenshot({ path: path.replace(/\.png$/, ".viewport.png") });
  // The document scrolls here (there is no inner scroller), so a full-page shot holds it all; an
  // inner `main` scroller, if one appears, is grown into view as in the original camera.
  const extra = await page.evaluate(() => {
    let most = 0;
    for (const el of document.querySelectorAll("main, [role=main]")) most = Math.max(most, el.scrollHeight - el.clientHeight);
    return most;
  });
  const vp = page.viewportSize();
  if (vp && extra > 0) await page.setViewportSize({ width: vp.width, height: Math.min(height + extra, 6000) });
  await page.screenshot({ path, fullPage: true });
  if (vp && extra > 0) await page.setViewportSize(vp);
}

/**
 * Tab from a fresh load until focus comes back to the first stop (`wrapped`: the walk is complete)
 * or `presses` runs out (`cap`: it isn't).
 */
async function keyboardWalk(page: Page, presses: number, base: string) {
  // A reload, not a click or a goto: a click moves the sequential-focus starting point, and a goto
  // to the same hash URL is a same-document navigation that keeps focus where it was.
  await page.reload();
  await settle(page);
  // The page the walk crosses, for context the focus crops cut away.
  await page.screenshot({ path: join(runDir, `${base}.keyboard.png`) });
  const stops: { stop: number; tag?: string; key?: string; [detail: string]: unknown }[] = [];
  let terminatedBy: "wrapped" | "cap" = "cap";
  for (let i = 1; i <= presses; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role"),
        name: (
          el.getAttribute("aria-label") ??
          ((el.getAttribute("aria-labelledby") ?? "")
            .split(" ")
            .map((id) => document.getElementById(id)?.innerText ?? "")
            .join(" ")
            .trim() ||
            ((el as HTMLInputElement).labels?.[0]?.innerText ?? "") ||
            el.getAttribute("placeholder") ||
            el.innerText ||
            "")
        )
          .trim()
          .slice(0, 60),
        region: el.closest("main") ? "main" : el.closest("nav, aside") ? "nav" : el.closest("header") ? "header" : el.closest("footer") ? "footer" : "other",
        box: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
    });
    const exposed = info
      ? await page
          .locator(":focus")
          .ariaSnapshot()
          .then((a) => (a.split("\n")[0] ?? "").replace(/^- /, ""))
          .catch(() => null)
      : null;
    const file = `${base}.tab${String(i).padStart(2, "0")}.png`;
    if (info) {
      const pad = 16;
      const vp = page.viewportSize();
      const x = Math.max(0, info.box.x - pad);
      const y = Math.max(0, info.box.y - pad);
      await page.screenshot({
        path: join(runDir, file),
        clip: {
          x,
          y,
          width: Math.max(1, Math.min(info.box.width + pad * 2, (vp?.width ?? 4000) - x)),
          height: Math.max(1, Math.min(info.box.height + pad * 2, (vp?.height ?? 4000) - y)),
        },
      });
    }
    const key = info ? `${info.tag}|${info.name}|${Math.round(info.box.x)},${Math.round(info.box.y + (await page.evaluate(() => window.scrollY)))}` : undefined;
    if (i > 1 && key && key === stops.find((s) => s.key)?.key) {
      terminatedBy = "wrapped";
      break;
    }
    stops.push({ stop: i, exposed, ...info, key, file: info ? file : null });
  }
  return { terminatedBy, stops };
}

// ── Running scenarios ────────────────────────────────────────────────────────────────────────────

/** Answer the CDN's ECharts request locally; refuse, and remember, every other request off this host. */
async function hermetic(ctx: BrowserContext, external: string[]) {
  await ctx.route(
    (url) => url.origin !== ORIGIN,
    (route) => {
      external.push(route.request().url());
      return route.abort("blockedbyclient");
    },
  );
  // Registered last, so it is matched first. The page loads it with crossorigin="anonymous", so it
  // needs the CORS header a CDN sends, or the integrity check refuses it.
  await ctx.route(echartsFile.url, (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "application/javascript; charset=utf-8", "access-control-allow-origin": "*" },
      body: echartsFile.body,
    }),
  );
}

async function runScenario(browser: Browser, sc: Scenario) {
  for (const vpKey of sc.viewports) {
    const size = viewportSizes[vpKey];
    const ctx = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: size.scale ?? 1,
      isMobile: size.mobile ?? false,
      hasTouch: size.mobile ?? false,
      colorScheme: sc.colorScheme ?? "light",
      reducedMotion: "reduce",
      locale: "en-US",
      timezoneId: "UTC",
    });
    const external: string[] = [];
    await hermetic(ctx, external);
    const page = await ctx.newPage();
    trackRequests(page);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 400));
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
    // Each cell answers for every error, and every refused request, since the previous cell: the
    // first for the page load, each for its own capture.
    let consumed = 0;
    let externalSeen = 0;
    const consoleProblems = (problems: string[]) => {
      for (const err of consoleErrors.slice(consumed)) if (!sc.allowConsole?.some((re) => re.test(err))) problems.push(`console: ${err.slice(0, 160)}`);
      consumed = consoleErrors.length;
      for (const url of external.slice(externalSeen)) problems.push(`request off the site, refused: ${url}`);
      externalSeen = external.length;
    };
    const url = () => {
      const u = new URL(page.url());
      return u.origin === ORIGIN ? `${u.pathname}${u.search}${u.hash}` : page.url();
    };
    await page.goto(`${ORIGIN}/${sc.data}/#${sc.route(fixtures)}`);
    for (const step of sc.steps) {
      const base = `${sc.id}.${step.name}@${vpKey}`;
      const problems: string[] = [];
      try {
        if (step.act) await step.act(page, fixtures);
        await settle(page);
        const exp = step.expect(fixtures);
        const route = exp.route ?? (step.act ? null : sc.route(fixtures));
        if (route === null) problems.push("a step that acts must state the route it lands on");
        problems.push(...(await check(page, sc, exp, route ?? undefined)));
      } catch (e) {
        problems.push(`step threw: ${(e as Error).message.split("\n")[0]}`);
      }
      const errorsBefore = consumed;
      consoleProblems(problems);
      const files: Record<string, string> = {};
      const status: Status = problems.length === 0 ? "valid" : "failed";
      try {
        files.screenshot = `${base}.png`;
        files.viewport = `${base}.viewport.png`;
        await fullShot(page, join(runDir, files.screenshot), size.height);
        files.aria = `${base}.aria.yml`;
        writeFileSync(join(runDir, files.aria), await page.locator("body").ariaSnapshot());
        if (status === "valid") {
          const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
          files.axe = `${base}.axe.json`;
          writeFileSync(
            join(runDir, files.axe),
            JSON.stringify(
              axe.violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                help: v.help,
                nodes: v.nodes.slice(0, 8).map((n) => ({ target: n.target, html: n.html.slice(0, 300), summary: n.failureSummary })),
              })),
              null,
              2,
            ),
          );
          files.probes = `${base}.probes.json`;
          writeFileSync(join(runDir, files.probes), JSON.stringify(await probes(page), null, 2));
        }
      } catch (e) {
        problems.push(`capture threw: ${(e as Error).message.split("\n")[0]}`);
      }
      consoleProblems(problems);
      cells.push({
        scenario: sc.id,
        step: step.name,
        viewport: vpKey,
        persona: sc.persona,
        mode: modeOf(sc),
        data: sc.data,
        url: url(),
        status: problems.length === 0 ? "valid" : "failed",
        // The pixels show the shell's brand and active nav; hover (the chart's tooltips) is never
        // captured, so every number the chart shows only on hover goes unasserted.
        unasserted: (await page.locator(".chart").count()) ? ["chart tooltips (hover) are not captured; the table below the chart is"] : [],
        problems,
        consoleErrors: consoleErrors.slice(errorsBefore),
        files,
      });
      process.stdout.write(`${problems.length ? "✗" : "✓"} ${base}${problems.length ? `  — ${problems.join("; ")}` : ""}\n`);
    }
    if (sc.keyboard && (sc.keyboard.viewports ?? ["desktop"]).includes(vpKey)) {
      // The walk is a cell of its own (`<scenario>.keyboard@<viewport>`), so a walk that throws
      // fails the run like any other cell.
      const base = `${sc.id}@${vpKey}`;
      const problems: string[] = [];
      const errorsBefore = consumed;
      const files: Record<string, string> = {};
      try {
        const walk = await keyboardWalk(page, sc.keyboard.presses, base);
        files.keyboard = `${base}.keyboard.json`;
        files.screenshot = `${base}.keyboard.png`;
        writeFileSync(join(runDir, files.keyboard), JSON.stringify(walk, null, 2));
        if (!walk.stops.some((s) => s.tag)) problems.push("no element ever took focus");
      } catch (e) {
        problems.push(`walk threw: ${(e as Error).message.split("\n")[0]}`);
      }
      consoleProblems(problems);
      cells.push({
        scenario: sc.id,
        step: KEYBOARD,
        viewport: vpKey,
        persona: sc.persona,
        mode: modeOf(sc),
        data: sc.data,
        url: url(),
        status: problems.length === 0 ? "valid" : "failed",
        unasserted: [],
        problems,
        consoleErrors: consoleErrors.slice(errorsBefore),
        files,
      });
      process.stdout.write(`${problems.length ? "✗" : "✓"} ${sc.id}.${KEYBOARD}@${vpKey}${problems.length ? `  — ${problems.join("; ")}` : ""}\n`);
    }
    await ctx.close();
  }
}

for (const sc of scenarios)
  if (sc.id.endsWith("~stub") !== (modeOf(sc) === "stub")) throw new Error(`scenario ${sc.id}: a stub scenario's id ends in ~stub, and only a stub's`);

const selected = scenarios.filter((sc) => !only || sc.id.includes(only));
const blockedBy = new Map<string, string>();
let browserVersion = "";
try {
  const browser = await chromium.launch();
  browserVersion = browser.version();
  try {
    for (const sc of selected) {
      try {
        await runScenario(browser, sc);
      } catch (e) {
        blockedBy.set(sc.id, (e as Error).message.split("\n")[0] ?? "");
        process.stdout.write(`✗ ${sc.id}  — ${(e as Error).message.split("\n")[0]}\n`);
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}

// Every expected cell is accounted for: one the run never reached is blocked.
for (const sc of selected)
  for (const vp of sc.viewports)
    for (const step of [...sc.steps.map((st) => st.name), ...(sc.keyboard && (sc.keyboard.viewports ?? ["desktop"]).includes(vp) ? [KEYBOARD] : [])])
      if (!cells.some((c) => c.scenario === sc.id && c.step === step && c.viewport === vp))
        cells.push({
          scenario: sc.id,
          step,
          viewport: vp,
          persona: sc.persona,
          mode: modeOf(sc),
          data: sc.data,
          url: "",
          status: "blocked",
          unasserted: [],
          problems: [`not reached: ${blockedBy.get(sc.id) ?? "an earlier step threw"}`],
          consoleErrors: [],
          files: {},
        });

const git = (...args: string[]) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
// Read from node_modules: not every package exports its package.json.
const version = (pkg: string) => (JSON.parse(readFileSync(join(REPO, "node_modules", pkg, "package.json"), "utf8")) as { version: string }).version;
writeFileSync(
  join(runDir, "manifest.json"),
  JSON.stringify(
    {
      runId,
      capturedAt,
      base: ORIGIN,
      build: BUILD,
      commit: git("rev-parse", "HEAD"),
      dirty: git("status", "--porcelain").length > 0,
      browser: browserVersion,
      playwright: version("@playwright/test"),
      axe: version("@axe-core/playwright"),
      node: process.version,
      fixtures: {
        real: { results: fixtures.real.results, newest: fixtures.real.newest.id, compare: fixtures.real.compare },
        stub: describeSets(),
        sets: Object.fromEntries(["real", ...STUB_SETS].map((s) => [s, `${ORIGIN}/${s}/`])),
      },
      hidden: null,
      cells,
    },
    null,
    2,
  ),
);
const count = (s: Status) => cells.filter((c) => c.status === s).length;
const byMode = (m: "real" | "stub") => cells.filter((c) => c.mode === m).length;
process.stdout.write(
  `\n${count("valid")} valid, ${count("failed")} failed, ${count("blocked")} blocked (${byMode("real")} real, ${byMode("stub")} stub) → ${runDir}\n`,
);
if (count("valid") < cells.length) process.exitCode = 1;
