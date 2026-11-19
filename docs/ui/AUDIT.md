# UI audit: parallax-results

How this repo audits its site, and what the audit checks against. The audit is
the `ui-audit` skill (`.claude/skills/ui-audit/`, run with `/ui-audit
<surfaces>`), whose principles and rubric are in its
[process.md](../../.claude/skills/ui-audit/process.md). This file is its
configuration for parallax-results. Runs are reported in [audits/](./audits/).

## Spec, in order of precedence

| # | Document | Status | Applies to |
|---|---|---|---|
| 1 | [Parallax's docs/measurement.md](https://github.com/THEtheChad/parallax/blob/main/docs/measurement.md) | In effect (upstream) | What a ratio, an interval and a call mean. The site may simplify it, never contradict it |
| 2 | [README.md](../../README.md) and the About page (`site/src/components/About/About.tsx`) | In effect | What the site claims: every number a ratio to a reference measured on the same machine, machines never averaged, results verified before merge |
| 3 | [CONTRIBUTING.md](../../CONTRIBUTING.md) | In effect | The contributor's path, and what a result contains |
| 4 | `site/src/styles.css` tokens and `site/src/theme.ts` | In effect. Not opened by reviewers; described in [Tokens](#tokens) | Palette (light and dark), series colours, type sizes, radius. No contrast test guards them yet |
| 5 | Layout conventions (below) | Grown per run | Craft calls the documents above don't make |

When two disagree, the lower number wins.

## Surfaces

Only `built` surfaces are audited. The site is static and uses hash routes, so
every route is `#/…` under the site's base.

| Surface | Route | State | Scenarios |
|---|---|---|---|
| Compare: filters, build chips, ratio chart, table | `#/` with `kind`, `project`, `metric`, `threads`, `os`, `ref`, `hide` | built | yes: real (four viewports, a keyboard walk, a sort, every build hidden, a stale shared link), empty, one, many (command line and language server, light and dark), filtered, two journeys |
| Ratio chart tooltip | Compare, on hover (on a touch screen, while a finger is on a dot) | built | yes: real, desktop (hover) and phone (press) |
| Results list | `#/results` | built | yes: real, empty, one, many |
| Result | `#/result/:id` | built | yes: real (light, and dark through the theme journey), an edge-case result, a noisy one, a language-server one, a missing id |
| About | `#/about` | built | yes |
| Shell: brand, Pages nav, theme menu, error boundary | every page | built | yes: asserted in every cell; the theme menu's choice through the theme journey (choose Dark, open a result, reload) |
| Loading state | every page, while `data/index.json` loads | built | yes: real, with the index request held. At the time of writing a visitor sees the header alone: Layout's "Loading results…" fallback never shows |
| Unknown route | `#/<anything else>` (e.g. `#/bogus/typo`) | built | yes: real. At the time of writing the router's default: a bare "Not Found" under the header, no nav item active |

A built surface with no scenarios is written first: auditing it starts at the
skill's step 2.

### Capturing one surface: `--only`

`--only` keeps the scenarios whose id contains any of its comma-separated
substrings. For `/ui-audit Compare and Result`, run
`pnpm ui-audit:capture --only compare,result-,journey`.

| Surface | `--only` | Scenarios it captures |
|---|---|---|
| Compare | `compare` | `compare`, `compare-tooltip`, `compare-sort`, `compare-all-hidden`, `compare-stale-link`, `compare-*~stub`, `journey-results-to-compare` |
| Ratio chart tooltip | `tooltip` | `compare-tooltip` |
| Results list | `results` | `results`, `results-*~stub`, `journey-results-to-compare` |
| Result | `result-,journey` | `result-newest`, `result-*~stub`, and the three journeys (each opens a result) |
| About | `about` | `about` |
| Shell and theme menu | `theme` | `journey-theme` (the shell itself is asserted in every cell) |
| Loading state | `loading` | `loading` |
| Unknown route | `unknown` | `unknown-route` |

### Not captured

- Hover anywhere but the ratio chart's dots, and anything only hover shows
  there (the chips', links' and headers' hover states).
- Motion: captures run with reduced motion, and ECharts' own animation is waited
  out, so transitions and chart animations are never photographed.
- Results at `zoom200`: the list is a wide table that scrolls inside its card.
  Whether it is a supported zoomed surface is the owner's decision (see
  Supported viewports); until then it is not captured there.

## Supported viewports

**Proposed, pending the owner's decision:**

| Viewport | Size | Where |
|---|---|---|
| `phone` | 390×844, mobile emulation with touch | every surface |
| `desktop` | 1280×800 | every surface |
| `desktop-dark` | 1280×800, OS colour scheme dark | Compare (the `many` set) |
| `tablet` | 768×1024, mobile emulation with touch | Compare |
| `zoom200` | 640×400 CSS px at device scale 2 (so its screenshot is 1280×800): desktop at 200% zoom, emulated | Compare and Result |

Light and dark themes are both supported. The site follows the OS unless its
theme menu says otherwise, so the scheme is part of the viewport's name
(`desktop-dark`) and every cell records the scheme it rendered in
(`colorScheme` in the manifest). The theme journey reaches dark through the
menu on a light OS, so its Compare and Result cells are dark at `desktop`. A
layout that fails at a supported width is a finding.

## Personas

There is no sign-in: a persona is a reader, not an account. All stub data is
synthetic (`scripts/ui-audit/fixtures.ts`): every implementation, build,
machine and project in it is named as a fixture (`alpha 1.0.0-fixture`,
`Fixture CPU A`, `fixture-app`), its hashes start with zeros, and none of its
numbers is a measurement. `real` is `results/` as published.

| Persona | Data | Holds |
|---|---|---|
| Visitor | every data set | Someone comparing implementations of the TypeScript compiler and language server (tsc 7, tsrs, the tsc-rs fork, …): wants to know which is faster on projects like theirs, by how much, and whether to believe it |
| Contributor | `real` | Someone who has run, or will run, the Parallax suite and wants to publish results: follows About and CONTRIBUTING.md |

The data sets, each served from the same production build under its own path:

| Set | Mode | What it holds |
|---|---|---|
| `real` | real | `results/` as `pnpm build` indexes it (at the time of writing: two command-line results, hono and umami, one Linux machine) |
| `empty` | stub | No results |
| `one` | stub | One command-line result: `fixture-app` on a Linux fixture machine, three candidates, both thread modes |
| `many` | stub | Seven results: `fixture-app` on Linux, macOS and Windows fixture machines; `fixture-lib`; command-line and language-server benches; every call (faster, slower, same ±r, unresolved, too few rounds); an unregistered binary; a candidate that failed every round; unsettled results with notes and rejected rounds; long project, build and CPU labels; Low Power Mode on battery at lowered priority; a project not in the suite with local changes |

The stub numbers are consistent the way Parallax makes them: each interval is
the distribution-free median interval of synthetic rounds, with the confidence
that round count gives; each call follows from its interval and the same band;
a result with only the minimum rounds calls nothing but "too few rounds". A
fixture whose numbers stop producing the call it is meant to show fails to
build.

## Cold-read questions

**Proposed, pending the owner's decision.** What a visitor seeing a screen for
the first time must be able to answer from the pixels alone. A wrong or missing
answer is a finding with reference `cold-read: Qn`.

1. What does this site compare, and against what?
2. On a project, which implementation is fastest, by how much, and is a smaller
   number better?
3. How sure is that: is the difference real, and does it hold across machines?
4. Where do these numbers come from, and can I check them?
5. How do I add my own results?
6. On a Result page: should I trust this result, and what would make me doubt
   it?

## Component vocabulary

A finding's `component` is one of these, `route:<path>` for a page-specific
defect, or `ui-audit harness`. Add a name when a run needs one.

```text
theme                 # site/src/theme.ts and the tokens in site/src/styles.css: palette, series colours, contrast
Layout                # the shell: header, Pages nav, theme menu, error boundary, loading fallback
PagesNav              # Layout's nav: Compare, Results, About
ThemeMenu             # Layout's theme select
ErrorBoundary         # Layout's Boundary: "Could not load the results: …"
LoadingState          # Layout's Suspense fallback: "Loading results…"
NotFound              # what the router renders for an unknown route (TanStack Router's default today)
EmptyState            # the .empty message: no results, every build hidden, no metric
Card                  # the .card section: h2 title, .sub line
DataTable             # shared table styling and its .table-wrap scroller
CallLabel             # the .call text: faster, slower, same ±r, unresolved, too few rounds
format                # site/src/data/format.ts: ratios, intervals, values, platform names, series slots
build-index           # scripts/build-index.ts: build labels and grouping, what the data says
CompareView
Filters
BuildChips            # Filters' "Builds shown" chips
RatioChart
RatioChartTooltip     # RatioChart's tooltip: interval, call, rounds, both sides' figures, machine
ComparisonTable
ResultsList
ResultView
FactsList             # ResultView's dl.facts: project, machine, state, harness, rounds, raw
About
```

## Tokens

Reviewers judge pixels and do not open stylesheets; this is what
`site/src/styles.css` and `site/src/theme.ts` define, so a finding can name the
token it is about. Light is the base. Dark applies under the OS setting unless
the theme menu says Light, and always when it says Dark (`data-theme` on the
root, remembered in `localStorage`).

| Token | Role | Light | Dark |
|---|---|---|---|
| `--page` | page background (tier 0) | `#f9f9f7` | `#0d0d0d` |
| `--surface-1` | cards, selects, chips, tooltip (tier 1) | `#fcfcfb` | `#1a1a19` |
| `--surface-2` | tier 2 (defined, not used by the current pages) | `#f3f2ef` | `#232321` |
| `--text-primary` | body text, titles, active nav item | `#0b0b0b` | `#f0efec` |
| `--text-secondary` | lede, `.sub` lines, labels, table headers, inactive nav | `#52514e` | `#c3c2b7` |
| `--text-muted` | axis labels, unpressed chips, "unresolved", "too few rounds" | `#898781` | `#898781` |
| `--border` | card, select and chip borders | `rgba(11,11,11,.10)` | `rgba(255,255,255,.10)` |
| `--grid` | chart grid lines, table row rules | `#e1e0d9` | `#2c2c2a` |
| `--axis` | chart axes, the reference line at 1× | `#c3c2b7` | `#383835` |
| `--accent` | links; equal to series 1 | `#2a78d6` | `#3987e5` |
| `--series-1` | blue | `#2a78d6` | `#3987e5` |
| `--series-2` | orange | `#eb6834` | `#d95926` |
| `--series-3` | green | `#1baf7a` | `#199e70` |
| `--series-4` | amber | `#eda100` | `#c98500` |
| `--series-5` | pink | `#e87ba4` | `#d55181` |
| `--good` | the call "faster" | `#006300` | `#0ca30c` |
| `--critical` | the call "slower" | `#d03b3b` | `#e66767` |
| `--same-band` | the grey "same ±r" band around 1× on the chart | `rgba(11,11,11,.045)` | `rgba(255,255,255,.05)` |
| `--radius` | cards | `8px` | `8px` |

- **Series.** An implementation keeps one series colour everywhere (chart dots
  and intervals, legend, build chips), assigned from every build in the index:
  the tsc-rs fork, tsrs and tsc 7 take series 1–3 in that order, any other
  implementation the next slot alphabetically, capped at 5. Series 1 is also
  the link colour.
- **Calls** are drawn as a word plus a colour, never colour alone: "faster" in
  `--good`, "slower" in `--critical`, "same ±5%" in the body colour, and
  "unresolved" and "too few rounds" in `--text-muted`. The chart colours dots by
  implementation, not by call; its calls are words, in the tooltip and the table.
- **Type and shape.** System UI face throughout; body 14px/1.45; brand 20px/600;
  card titles 15px/600; `.sub` lines and tables 13px; filter labels 12px; chart
  text 12px (the band label 11px); tooltip 12px with a 15px/600 headline. Selects
  have a 6px radius, chips are pills.

## Layout conventions

These are the dominant patterns in the code, which a consistency finding may
cite as precedent. Each run adds what it settles.

- **Type.** Body text is 14px at line-height 1.45 in the system UI face.
  Secondary text (labels, `.sub` lines, tables) is 12–13px in
  `--text-secondary`. There is no separate heading face.
- **Cards.** Every page section is a `.card` (`--surface-1`, 1px `--border`,
  `--radius`, 16px padding, 16px apart) with an `h2` title at 15px/600 and an
  optional `.sub` line under it.
- **Page.** At most 1200px wide with a 16px gutter. The header wraps rather
  than collapsing into a menu.
- **Headings.** The brand is the only `h1`, on every page; page sections are
  `h2`.
- **Numbers.** Tabular figures, right-aligned (`.num`). Ratios, intervals and
  values are written by `format.ts` only (`0.32×`, `0.32× (0.31×–0.33×)`,
  `340 ms`).
- **Calls** are a word and a colour (`.call`), never colour alone.
- **Implementations** keep one series colour across every view, assigned from
  every build in the index, whatever a filter hides.
- **Tables** don't wrap their cells; they scroll sideways inside `.table-wrap`.
- **State** in the compare view lives in the URL: a view is a link.

## Accepted deviations

Each has an owner and a revisit trigger. A finding that matches one is reported
as matched, not as new.

| Deviation | Source | Owner | Revisit |
|---|---|---|---|
| None yet | | | |

## Deferred findings

Findings the owner deferred. Each is out of scope for a run until its revisit
trigger, and a reviewer who meets one reports it as matched, not new.

| Finding | Deferred to | Owner | Revisit |
|---|---|---|---|
| None yet | | | |

## Budgets per run

- Cells: at most 100 per capture. The scenarios make 56 today (31 real, 25
  stub).
- Captures: a full capture for r1, one more after the pre-flight's harness
  fixes (if it reports any), the touched cells once per fix batch, and a full
  capture to verify: three or four full captures in a typical run.
- Reviewer runs: 1 pre-flight + 3 review + 1 per invalid return (`fix-<name>`,
  at most one per reviewer) + 1 verify per judgement fix. With no invalid
  returns and five judgement fixes, that is 9.
- Findings: at most 15 per reviewer, of which at most 5 are taste.
- Owner triage: one hour or less.
- Rounds: one critique round, then one verification round.

## Gates

`pnpm check` (typecheck and tests) and `pnpm build`, as CI runs them
(`.github/workflows/verify.yml`).

## Running it

`pnpm ui-audit:capture` builds the site for production (`pnpm build`), serves
`dist/` itself on 127.0.0.1:4179 (`AUDIT_PORT` to change it), once per data set
(`/<set>/#/…`), and stops the server when it is done: nothing else needs to be
running. `AUDIT_BUILD` is optional; set, it replaces the manifest's
description of what served the build.

A capture needs a clean tree: one logged as an audit revision must be
reproducible from its commit, so the camera refuses uncommitted changes and
exits 2. `--allow-dirty` captures anyway (the manifest records `dirty: true`),
for a look while working, never for a logged revision.

It needs no network: the page's one third-party script, Apache ECharts from
cdnjs, is answered from `node_modules/echarts` after the camera checks that
file against the page's integrity hash, and any other request off the host is
refused and fails its cell. Playwright's Chromium build 1254 must be installed
(`pnpm exec playwright install chromium` if `~/.cache/ms-playwright` lacks it).

```sh
pnpm install
pnpm ui-audit:capture                          # pnpm build, fixtures, capture → scripts/ui-audit/runs/<run-id>/
pnpm ui-audit:capture --only compare,result-   # scenarios whose id contains either substring (see Surfaces)
pnpm ui-audit:capture --no-build               # reuse dist/ from an earlier pnpm build
pnpm ui-audit:capture --allow-dirty            # capture uncommitted work; not a loggable revision
node scripts/ui-audit/fixtures.ts              # write the stub sets to scripts/ui-audit/fixtures/out/ to read them
node scripts/ui-audit/serve.ts                 # serve dist/ and every data set for a look by hand (ECharts from cdnjs)
```

Exit codes: 0 when every expected cell is valid; 1 when any is failed or
blocked (a setup failure, such as a browser that will not launch, blocks every
cell and still writes the manifest, with the reason); 2 when it refuses before
capturing (a usage mistake, an `--only` that matches no scenario, or a dirty
tree).

There are no report-only static rules for this repo: the site is one
stylesheet whose colours all sit in its token blocks (the chart reads them
through `cssVar`; its one literal is a transparent hit target), and the one cross-file
invariant (index.html's ECharts integrity against the pinned package) is
checked by the camera before every run.
