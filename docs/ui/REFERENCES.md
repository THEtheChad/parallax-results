# Reference sites: the standard the site is measured against

The bar for parallax-results comes from two sets of sites. The **benchmark
sites** set what a page must convey and let a visitor do. The **look
references** set how it should feel: modern and sleek, colourful and playful,
with a retro thread taken from the owner's own visual identity. Where the two
pull apart, the function wins: a flashy page that hides the answer fails.

The site does not meet this standard yet. Closing the gap is a redesign, not an
audit's job: until the redesign lands, [AUDIT.md](./AUDIT.md) holds the site to
its current tokens and this file is the target the redesign is checked against.
[The scorecard](#scorecard) records where the site stands.

## The benchmark sites: what to convey

Each was looked at for what it does well for a reader, not for its look; most
of them look dated.

| Site | Take from it |
|---|---|
| [Artificial Analysis](https://artificialanalysis.ai/) | The headline charts first, before any controls. Every chart's subtitle says what it measures and whether higher or lower is better. Per-chart link, image and data-download buttons. A changelog of what was added when. The one benchmark site here that also looks modern |
| [Epoch AI benchmarks](https://epoch.ai/benchmarks) | "Updated" date at the top. Stat cards that each lead to a deeper page. A filter panel beside the chart, not above it. Search across everything |
| [js-framework-benchmark](https://krausest.github.io/js-framework-benchmark/current.html) | "Build your comparison": pick implementations and benchmarks as chips, then copy and paste the selection as a link. The confidence interval in every cell. A warning banner when results are preliminary. Methodology and test environment one disclosure away |
| [rustc-perf compare](https://perf.rust-lang.org/compare.html) | Summary cards (range and mean per category) above the detail table. Significance threshold and factor as columns, so "is this real?" sits next to the number |
| [TechEmpower Framework Benchmarks](https://www.techempower.com/benchmarks/) | Rounds: every published run is kept and can be returned to. The environment is a tab of its own. Relative bars with "% of best" next to the raw figure |
| [SWE-bench](https://www.swebench.com/) | A leaderboard whose rows can be ticked to compare. Badges for what kind of entry a row is. A short card explaining each variant of the benchmark |
| [Bun](https://bun.com/) | The benchmark *is* the hero: four bars, the winner highlighted, "lower is better", and the exact scenario and machine in a footnote. Tabs across scenarios |
| [Our World in Data grapher](https://ourworldindata.org/grapher/life-expectancy) | Chart, Table and Sources as tabs of one view. Download and share on every chart. The sources tab says where each number comes from in plain words |
| [CodSpeed](https://codspeed.io/), [Bencher](https://bencher.dev/), [LMArena](https://lmarena.ai/leaderboard) | Not photographed: each sits behind a bot check. From their public pages: CodSpeed and Bencher report each change as a regression or improvement against a threshold, with its history plot; LMArena shows a confidence interval beside every rank |

## The look references: how it should feel

| Reference | Take from it |
|---|---|
| [THEtheChad profile](https://github.com/THEtheChad/THEtheChad) | **The house style, which wins any conflict below.** Synthwave Kansas City at dusk: near-black plum ground, neon pink and cyan, sodium amber lights. Geist Mono for text. Neon script section headings on numbered rules (`01 — about`). Cassette liner notes (Side A, Side B, numbered tracks). Light variants of every colour for a light scheme |
| [Spaceship](https://chuanqisun.github.io/spaceship/) and its [style swatches](https://chuanqisun.github.io/spaceship/extra/style-1.html) | The instrument panel. Black ground, mono type, hairline rules, a few steps of white ink for hierarchy and one signal colour that means exactly one thing. Knobs and dials for continuous values. A telemetry status bar along the bottom. Designed by iterating on side-by-side style swatches |
| [Charm](https://charm.land/) | Playful neon colour on a sleek build: pink-to-violet gradients, a chunky retro wordmark, pill badges, a bright call to action |
| [Bun](https://bun.com/) | Flash with confidence: hot pink, heavy display type, a mascot, and a benchmark chart in the hero that still reads in one glance |
| [Ghostty](https://ghostty.org/) | Retro done in a modern way: animated terminal (ASCII) art inside restrained, sleek chrome |
| [Teenage Engineering](https://teenage.engineering/products/op-1) | Controls that feel like hardware: big, tactile, generously spaced buttons and knobs, each with one clear job |
| [Raycast](https://www.raycast.com/) | A flashy hero on a dark page (glow, depth, saturated colour) above calm, sleek content |
| [Material 3 buttons](https://m3.material.io/components/buttons/overview) and [MUI Slider](https://mui.com/material-ui/react-slider/) | Control metrics only, not their look: roomy padding, 40px buttons, 48px touch targets, a slider with a large thumb and a visible track, distinct hover, pressed and focus states |

Looked at and not adopted: Linear and Oxide (sleek but too restrained in
colour), Astro and PostHog (playful, but their idioms don't fit an instrument
panel), and the benchmark sites' own looks (rustc-perf, LLVM compile-time
tracker, Perfherder, the Benchmarks Game, web-frameworks-benchmark), which
carry their information well but look like the 2010s.

## The standard

Each criterion is checkable from a screenshot. `F` is function, `L` is look.

### Function

- **F1. The answer first.** The first screen of Compare says who is fastest on
  the selected project, by how much, and that lower is better, in words and in
  a hero chart, before the filters.
- **F2. Every chart says what it shows.** Its title names the metric and
  project; its subtitle names the reference, the direction (lower is faster)
  and what one mark is.
- **F3. Uncertainty is visible and explained.** Every ratio carries its
  interval and its call, and one click explains what the interval and "same
  ±r" mean.
- **F4. Sources one step from every number.** From any figure a visitor can
  reach the result it came from, the machine, the harness version and the raw
  file.
- **F5. Share and export.** A view is a link (already true), with a visible
  copy-link control, and each chart and table offers its data as CSV or JSON.
- **F6. Freshness.** "Updated" with a date on every page, and a list of what
  was published when.
- **F7. A comparison builder.** Implementations are chosen as chips, not hidden
  in a select, and the choice survives navigation.
- **F8. Reproduce it.** Each result shows the exact command and the machine it
  ran on.
- **F9. No default states.** Loading, empty, error and unknown-route screens
  are designed, in the site's voice.

### Look

- **L1. Dark first, in the house palette.** The dark scheme is the default
  and uses the profile's colours:

  | Role | Dark | Light |
  |---|---|---|
  | Ground | `#0d0b14` (deepest `#07060d`) | `#fff8fc` |
  | Ink | `#f3e9ff` (brightest `#fff0fa`) | `#0d0b14` |
  | Signal, pink | `#ff3ea5`, softer `#ff65b8` | `#c2186b` |
  | Signal, cyan | `#2de2e6` | `#0e7490` |
  | Lamp, amber | `#ffcf7a` | to be chosen |
  | Line, plum | `#3a1f5c` | to be chosen |

  Each text colour above meets 4.5:1 on its ground (pink 6.0, cyan 12.2,
  amber 13.5, ink 16.7; the light pink 5.5 and cyan 5.1). Plum is for rules and
  borders only (1.4:1). The light scheme stays supported.
- **L2. Mono type with a display moment.** Geist Mono (falling back to
  JetBrains Mono and the system mono) for text, labels and figures. Section
  headings get the display treatment, neon on a numbered rule, used once per
  section, never in tables or controls.
- **L3. Roomy controls.** Buttons and selects are at least 40px tall with at
  least 16px of horizontal padding. Every target is at least 48px on touch. Up
  to five options are a segmented control or chips, not a select. A continuous
  value is a slider with a thumb of at least 20px. Hover, pressed and focus
  states differ visibly; focus is a cyan glow ring.
- **L4. Flash with a purpose.** Each page has one hero moment (glow, gradient
  or motion), and it carries data, the way Bun's hero is its benchmark. Glows
  and gradients go on marks, headings and the hero, never behind body text.
  Motion shows something (bars grow out from 1×, intervals settle) and stops
  under reduced motion.
- **L5. Instrument detail.** A status bar of telemetry (results, machines,
  implementations, last updated). Figures read as instruments: tabular,
  their units dimmer than the number. Hairline rules instead of heavy boxes.
- **L6. Vivid series.** Implementation colours are saturated and distinct on
  both grounds, checked for colour-vision deficiency, and the same on every
  surface. A call is still a word plus a colour.
- **L7. Retro is seasoning.** One or two surfaces carry the retro motif:
  About as cassette liner notes, the unknown route as the end of the tape,
  loading as a reel turning, a faint scanline in the hero. Never on a chart's
  data or a table.

## Scorecard

Where the site stood on 2026-11-19, at commit 256237a.

| | Criterion | Status | Notes |
|---|---|---|---|
| F1 | The answer first | Partly | The chart comes early, but after the filters, with no headline sentence |
| F2 | Every chart says what it shows | Yes | Title, sub-line and axis say metric, reference and "lower is faster" |
| F3 | Uncertainty visible and explained | Partly | Intervals and calls everywhere; the explanation is on About, not one click from the number |
| F4 | Sources one step away | Mostly | Each table row links to its Result page (project, machine, harness, rounds, raw file); a chart dot does not |
| F5 | Share and export | Partly | A view is a link; no copy-link control, no download |
| F6 | Freshness | Partly | Dates in the table; no "updated" line, no history |
| F7 | Comparison builder | Partly | Build chips exist; project, metric and reference are selects |
| F8 | Reproduce it | Partly | Harness and machine on a Result page; no command |
| F9 | No default states | No | The loading message never shows; the unknown route is the router's bare "Not Found" |
| L1 | Dark first, house palette | No | Light first, in a neutral grey palette with a blue accent |
| L2 | Mono with a display moment | No | System UI face throughout, no heading face |
| L3 | Roomy controls | No | Native selects 32px tall, build chips 29px |
| L4 | Flash with a purpose | No | No hero; the chart is the only visual |
| L5 | Instrument detail | No | |
| L6 | Vivid series | Partly | Consistent everywhere, but muted |
| L7 | Retro as seasoning | No | |
