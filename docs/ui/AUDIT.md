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
| 4 | [REFERENCES.md](./REFERENCES.md): reference sites and the standard (F1–F12, L1–L9) | In effect; its scorecard says which criteria the site meets | What the site must convey and how it should look. A criterion the scorecard marks unmet is known work, not a new finding |
| 5 | `site/src/styles.css` tokens and `site/src/theme.ts` | In effect. Not opened by reviewers; described in [Tokens](#tokens) | The house palette (light and dark), series colours and shapes, faces, radii. Contrast checked by hand when the palette was set (REFERENCES.md L1); no test guards it yet |
| 6 | Layout conventions (below) | Grown per run | Craft calls the documents above don't make |

When two disagree, the lower number wins.

## Surfaces

Only `built` surfaces are audited. The site is static and uses hash routes, so
every route is `#/…` under the site's base.

| Surface | Route | State | Scenarios |
|---|---|---|---|
| Compare: billboard, filters, build chips, ratio chart, table | `#/` with `kind`, `project`, `metric`, `threads`, `os`, `ref`, `hide` | built | yes: real (four viewports, a keyboard walk, a sort, every build hidden, a stale shared link), empty, one, many (command line and language server, light and dark), filtered, no candidate beating the reference, two journeys |
| Ratio chart tooltip | Compare, on hover (on a touch screen, while a finger is on a dot) | built | yes: real, desktop (hover) and phone (press) |
| Results list | `#/results` | built | yes: real, empty, one, many |
| Result | `#/result/:id` | built | yes: real (light, and dark through the theme journey), an edge-case result, a noisy one, a language-server one, a missing id |
| About | `#/about` | built | yes |
| Shell: the sky (brand, Pages nav, theme switch, telemetry), footer, error boundary | every page | built | yes: asserted in every cell; the theme switch's choice through the theme journey (choose Dark, open a result, reload) |
| Loading state | every page, while `data/index.json` loads | built | yes: real, with the index request held: two turning reels and "Loading results…" (the router's pending component) |
| Unknown route | `#/<anything else>` (e.g. `#/bogus/typo`), and a result id the index does not list | built | yes: real, and a missing result id: "end of side A", with the way back |

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
theme                 # site/src/theme.ts and the tokens in site/src/styles.css: palette, series colours, contrast, faces
Layout                # the shell: the sky, footer, error boundary
Sky                   # Layout's header: dusk gradient, stars, sun, grid floor, horizon line
PagesNav              # Layout's nav pills: Compare, Results, About
ThemeSwitch           # Layout's Auto / Light / Dark switch
Telemetry             # Layout's strip along the horizon: results, machines, implementations, latest run
Footer                # Layout's footer: provenance, "Run it on your machine", the caption
ErrorBoundary         # Layout's Boundary: "the tape snapped", the error, Try again
Loading               # the pending state: two reels and "Loading results…"
NotFound              # "end of side A" for an unknown route or result, with the way back
EmptyState            # "blank tape" (no results) and the .empty messages (every build hidden, no metric)
Section               # a section's numbered rule with its neon script word (h2), aside and sub line
Panel                 # the .panel box (filters, chart, facts)
LinerNotes            # the .liner box around a table: its Side label and tools
Controls              # .btn, .select, Segmented: sizes, states, focus
Shape                 # an implementation's shape (circle, square, triangle, diamond, cross)
DataTable             # shared table styling, its .table-wrap scroller, and its phone cards
CallLabel             # the .call badge: faster, slower, same ±r, unresolved, too few rounds, no call
format                # site/src/data/format.ts: ratios, intervals, values, "in words", platform names, series slots
build-index           # scripts/build-index.ts: build labels and grouping, what the data says
CompareView
Billboard             # CompareView's hero: h1, the figure, the sentence, badges, the race with a pip per machine, Copy link
Filters               # incl. the phone's Filters button
BuildChips            # Filters' "Builds shown" chips
Spotlight             # one implementation lit across the billboard, chips, legend, chart and table
RatioChart            # incl. its legend and the "How to read" disclosure
RatioChartTooltip     # RatioChart's tooltip: interval, in words, call, rounds, both sides' figures, machine
ComparisonTable       # incl. CSV and JSON downloads
ResultsList
ResultView
TapeCounter           # ResultView's rounds counter and splices
FactsList             # ResultView's dl.facts: project, machine, state, harness, rounds, raw
ReproduceCommand      # ResultView's "Record it again" and About's suite command
About                 # the J-card: Side A, Side B
```

## Tokens

Reviewers judge pixels and do not open stylesheets; this is what
`site/src/styles.css` and `site/src/theme.ts` define, so a finding can name the
token it is about. The palette is the house style from
[REFERENCES.md](./REFERENCES.md) (L1): synthwave Kansas City at dusk. Light is
the base in the stylesheet; dark applies under the OS setting unless the theme
switch says Light, and always when it says Dark (`data-theme` on the root,
remembered in `localStorage`). The sky band at the top is dusk in both.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--page` | page ground | `#fbf6ff` | `#0d0b14` |
| `--surface-1` | panels, liner boxes, controls, tooltip | `#ffffff` | `#15111f` |
| `--surface-2` | hover, tracks of the race bars | `#f4ecfb` | `#1d1729` |
| `--text-primary` | body text, figures | `#1a1033` | `#f3e9ff` |
| `--text-secondary` | sub lines, labels, table headers | `#4d3d6b` | `#c9b8e8` |
| `--text-muted` | units, hints, "unresolved" | `#65567f` | `#a594c6` |
| `--edge` | control and chip borders (3:1) | `#8f7cb0` | `#7a68a0` |
| `--border` | panel and liner borders (decoration) | `#e4d6f5` | `#3a1f5c` |
| `--grid` | chart grid, table rules | `#ece2f7` | `#261c38` |
| `--pink` / `--accent` | section words, links, primary button, figure | `#c2186b` | `#ff3ea5` (links `#ff65b8`) |
| `--cyan` | section numbers, Side labels, pressed segments, focus ring | `#0e7490` | `#2de2e6` |
| `--reference` | the reference: the amber lamp at 1×, its race bar | `#b26b00` | `#ffcf7a` |
| `--series-1` … `--series-5` | implementations: pink, cyan/teal, violet, orange, lime/green | `#c2186b` `#0e7490` `#6d3fd1` `#c2410c` `#4d7c0f` | `#ff3ea5` `#2de2e6` `#b38cff` `#ff8a3d` `#b8f35a` |
| `--good` | the call "faster" | `#047857` | `#5cf2a0` |
| `--critical` | the call "slower" | `#c81e3a` | `#ff6b7a` |
| `--same-band` | the "same ±r" band at 1× | cyan at 8% | cyan at 7% |
| `--figure-fill` | the billboard's figure | rose → pink → violet | amber → pink |
| `--radius` / `--radius-control` | panels / controls | `16px` / `12px` | same |
| sky | the header band in both schemes | `#0b0620` → `#1b1240` → `#4b1d6b` → `#b0306a` → `#ff8a6b`, horizon pink → cyan | same |

- **Faces.** Geist Mono for everything that is read: text, labels, figures,
  tables, controls. Yellowtail (neon script) only for section words, the
  brand's "results" and state titles; Cedarville Cursive only for captions.
  All self-hosted.
- **Series.** An implementation keeps one colour and one shape everywhere
  (chips, legend, chart marks, race, table): the tsc-rs fork, tsrs and tsc 7
  take slots 1–3 (circle, square, triangle) in that order, any other
  implementation the next slot alphabetically, capped at 5 (diamond, cross).
  The reference is never a series colour: it is the amber lamp.
- **Calls** are a word in a badge plus a colour, never colour alone: "faster"
  in `--good`, "slower" in `--critical`, "same ±5%" in the body colour,
  "unresolved", "too few rounds" and "no call" muted with a dashed edge.
- **Glow** sits on section words, the brand, chips, the billboard's figure and
  border, the lowest race bar and the reference lamp; never behind body text
  and never on an interval.

## Layout conventions

These are the dominant patterns in the code, which a consistency finding may
cite as precedent. Each run adds what it settles.

- **Page.** The sky band spans the window; content is at most 1200px wide with
  a 16px gutter. On a phone the nav pills take a row of their own.
- **Headings.** Each page has one h1 naming it and its selection, set as a
  small capitals kicker (on Compare, inside the billboard). Sections are a
  numbered rule (`01 —`) with a neon script word as their h2, an optional
  aside on the right and a sub line under it.
- **Boxes.** Filters, the chart and facts sit in a `.panel`; tables sit in a
  `.liner` with a "Side A · …" label and their tools (downloads) on the right.
- **Controls.** At least 44px tall (48px under a finger), 16px or more of side
  padding. Up to five short choices are a segmented control, its pressed
  segment pink; more, or long labels, are a select. The primary action and the
  pressed chips carry a hard offset shadow. On Compare the build chips come
  first in the filters.
- **Numbers.** Tabular figures, right-aligned in tables, units dimmer than the
  number. Ratios, intervals and values are written by `format.ts` only
  (`0.32×`, `0.32× (0.31×–0.36×)`, `340 ms`), and "in words" too (`3.1× as
  fast`, `8% slower`, `1.4× as long`).
- **Answer first.** Compare opens with the billboard: the candidate with the
  lowest median ratio across the selection's machines, each machine counted
  once by its newest result (`src/data/verdict.ts`), so no single run decides
  it. Its big figure is plain words ("3.1× as fast") only when most machines
  make that call and none makes another; otherwise the median ratio, with
  "machines disagree" or "not settled" beside it. When no candidate's median
  beats the reference, it says so. The race shows one pip per machine; the
  chart's rows use the same order.
- **Words follow the call and the measure.** "faster"/"slower" for time,
  "lower"/"higher" for CPU time and memory; "about the same" for same; "~" on
  any estimate without a settled call.
- **Spotlight.** Hovering or focusing an implementation anywhere on Compare
  lights it everywhere and dims the rest: marks, bars and glows only, never
  text.
- **The tape.** A Result page's binaries sit on a dark cassette label in both
  schemes.
- **Tables** don't wrap their cells on a desktop; they scroll sideways inside
  `.table-wrap`. On a phone each row is a card of label and value pairs.
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
