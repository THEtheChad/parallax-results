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
| 4 | `site/src/styles.css` tokens and `site/src/theme.ts` | In effect | Palette (light and dark), series colours, type sizes, radius. No contrast test guards them yet |
| 5 | Layout conventions (below) | Grown per run | Craft calls the documents above don't make |

When two disagree, the lower number wins.

## Surfaces

Only `built` surfaces are audited. The site is static and uses hash routes, so
every route is `#/…` under the site's base.

| Surface | Route | State | Scenarios |
|---|---|---|---|
| Compare: filters, build chips, ratio chart, table | `#/` with `kind`, `project`, `metric`, `threads`, `os`, `ref`, `hide` | built | yes: real, empty, one, many (command line and language server), filtered, dark, a journey |
| Results list | `#/results` | built | yes: real, empty, one, many |
| Result | `#/result/:id` | built | yes: real, an edge-case result, a noisy one, a language-server one, a missing id |
| About | `#/about` | built | yes |
| Shell: brand, Pages nav, theme menu, error boundary | every page | built | yes, through the pages above |
| Loading state ("Loading results…") | every page, while data loads | built | not captured: the camera waits it out, and local data loads in milliseconds |
| Ratio chart tooltip | Compare, on hover | built | not captured: hover is a camera blind spot; the table under the chart shows the same figures |

A built surface with no scenarios is written first: auditing it starts at the
skill's step 2.

## Supported viewports

**Proposed, pending the owner's decision:** phone (390×844, mobile emulation)
and desktop (1280×800) are supported on every surface, and so is desktop at
200% zoom, emulated as the `zoom200` viewport (640×400 CSS px at device scale
2, so its screenshot is 1280×800), on Compare and Result. Light and dark themes
are both supported (the site follows the OS unless its theme menu says
otherwise); dark is captured once, on Compare. A layout that fails at a
supported width is a finding.

## Personas

There is no sign-in: a persona is a reader, not an account. All stub data is
synthetic (`scripts/ui-audit/fixtures.ts`); `real` is `results/` as published.

| Persona | Data | Holds |
|---|---|---|
| Visitor | every data set | Someone comparing implementations of the TypeScript compiler and language server (tsc 7, tsrs, the tsc-rs fork, …): wants to know which is faster on projects like theirs, by how much, and whether to believe it |
| Contributor | `real` | Someone who has run, or will run, the Parallax suite and wants to publish results: follows About and CONTRIBUTING.md |

The data sets, each served from the same production build under its own path:

| Set | Mode | What it holds |
|---|---|---|
| `real` | real | `results/` as `pnpm build` indexes it (at the time of writing: two command-line results, hono and umami, one Linux machine) |
| `empty` | stub | No results |
| `one` | stub | One command-line result: hono on Linux, three candidates, both thread modes |
| `many` | stub | Seven results: hono on Linux, macOS and Windows; umami; command-line and language-server benches; every call (faster, slower, same ±r, unresolved, too few rounds); an unregistered binary; a candidate that failed every round; an unsettled result with notes and rejected rounds; long project, build and CPU labels; Low Power Mode on battery at lowered priority; a project not in the suite with local changes |

## Cold-read questions

**Proposed, pending the owner's decision.** What a visitor seeing a screen for
the first time must be able to answer from the pixels alone. A wrong or missing
answer is a finding with reference `cold-read: Qn`.

1. What does this site compare, and against what?
2. On this project, which implementation is fastest, and by how much?
3. How sure is that: is the difference real, and does it hold across machines?
4. Where do these numbers come from, and can I check them?
5. How do I add my own results?

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
ComparisonTable
ResultsList
ResultView
FactsList             # ResultView's dl.facts: project, machine, state, harness, rounds, raw
About
```

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

- Captures: at most 100 cells (the scenarios make 45 today).
- Findings: at most 15 per reviewer, of which at most 5 are taste.
- Owner triage: one hour or less.
- Rounds: one critique round, then one verification round.

## Gates

`pnpm check` (typecheck and tests) and `pnpm build`, as CI runs them
(`.github/workflows/verify.yml`).

## Running it

The camera builds the site for production, serves `dist/` itself on
127.0.0.1:4179 (`AUDIT_PORT` to change it), once per data set
(`/<set>/#/…`), and stops the server when it is done. It needs no network:
the page's one third-party script, Apache ECharts from cdnjs, is answered from
`node_modules/echarts` after the camera checks that file against the page's
integrity hash, and any other request off the host is refused and fails its
cell. Playwright's Chromium build 1254 must be installed
(`pnpm exec playwright install chromium` if `~/.cache/ms-playwright` lacks it).

```sh
pnpm install
pnpm ui-audit:capture                   # pnpm build, fixtures, capture → scripts/ui-audit/runs/<run-id>/; exits 1 unless every cell is valid
pnpm ui-audit:capture --only compare    # scenarios whose id contains "compare"
pnpm ui-audit:capture --no-build        # reuse dist/ from an earlier pnpm build
node scripts/ui-audit/fixtures.ts       # write the stub sets to scripts/ui-audit/fixtures/out/ to read them
node scripts/ui-audit/serve.ts          # serve dist/ and every data set for a look by hand (ECharts from cdnjs)
```

There are no report-only static rules for this repo: the site is one
stylesheet whose colours all sit in its token blocks (the chart reads them
through `cssVar`; its one literal is a transparent hit target), and the one cross-file
invariant (index.html's ECharts integrity against the pinned package) is
checked by the camera before every run.
