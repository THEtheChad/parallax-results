# Reference sites: the standard the site is measured against

The bar for parallax-results comes from two sets of sites. The **benchmark
sites** set what a page must convey and let a visitor do. The **look
references** set how it should feel: modern and sleek, colourful and playful,
with a retro thread taken from the owner's own visual identity. Where the two
pull apart, the function wins: a flashy page that hides the answer fails.

The redesign of 2026-11-19 built the site to this standard. [AUDIT.md](./AUDIT.md)
lists it in its spec, and [the scorecard](#scorecard) records which criteria the
site meets: an unmet criterion is known work, not an audit finding.

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
| [THEtheChad profile](https://github.com/THEtheChad/THEtheChad) | **The house style.** Synthwave Kansas City at dusk: the sky gradient (`#0b0620` → `#1b1240` → `#4b1d6b` → `#b0306a` → `#ff8a6b`), neon pink and cyan, sodium amber lights. Geist Mono for text, Yellowtail neon script for section words on numbered rules (`01 — about`), Cedarville Cursive for captions. Cassette liner notes: Side A, Side B, numbered tracks. Its hero art is retro done in a modern way |
| [Charm](https://charm.land/) | Playful neon colour on a sleek build: pink-to-violet gradients, a chunky retro wordmark, pill badges, a bright call to action |
| [Bun](https://bun.com/) | Flash with confidence: hot pink, heavy display type, and a benchmark race in the hero that reads in one glance |
| [Poolsuite](https://poolsuite.net/) | A retro interface that is actually fun to use: chunky controls, tape-deck idioms, a status readout |
| [Gumroad](https://gumroad.com/) | Roomy and playful controls: chunky, saturated, hard-shadowed buttons |
| [Teenage Engineering](https://teenage.engineering/products/op-1) | Controls that feel like hardware, each with one clear job; oscilloscope-style readouts |
| [Spaceship](https://chuanqisun.github.io/spaceship/) | **Its method and its status strip only.** Design by iterating on side-by-side [style swatches](https://chuanqisun.github.io/spaceship/extra/style-1.html) on real content, with every control state drawn out; a telemetry strip. Not its monochrome, not its one-signal rule, not its density |
| [Material 3 buttons](https://m3.material.io/components/buttons/overview) and [MUI Slider](https://mui.com/material-ui/react-slider/) | **Sizes only, in the house's skin:** 40px buttons, 48px touch targets, a slider with a large thumb and a visible track, distinct hover, pressed and focus states |

Looked at and not adopted: Raycast and Linear (sleek, but calm product pages
on black), Ghostty (its chrome is a plain product page; the owner's own hero
art does retro better), Oxide, Astro and PostHog, and the benchmark sites' own
looks (rustc-perf, LLVM compile-time tracker, Perfherder, the Benchmarks Game,
web-frameworks-benchmark), which carry their information well but look like
the 2010s.

## Precedence

Measurement integrity first, then accessibility, then the house style. A
flourish that overstates a result, or that someone can't read or operate, loses
to the plain version.

## The standard

Each criterion names its evidence: appearance needs screenshots, behaviour
needs interaction (keyboard, touch, reduced motion), and provenance needs the
source. The first screen means 1280×800 on a desktop and 390×844 on a phone.
In the scorecard, *Yes* means every clause passes, *Partly* means some do, *No*
means none do, and *Unverified* means the evidence is missing.

`F` is function, `L` is look.

### Function

- **F1. The answer first.** Before the filters, the first screen of Compare
  states the project, metric, reference and machine scope, and shows, in words
  and in a hero, which candidate stands best against the reference and by how
  much ("N× as fast"). Every machine gets one vote, its newest result, so no
  single run (a new contributor's, or a re-run on an odd day) decides the
  answer. It speaks plainly only when most machines make the same call and none
  makes another; otherwise it shows an estimate and the tally. It says when no
  candidate beats the reference, reports unresolved results as unresolved,
  never averages machines into one figure, and ranks its rows by speed. Its
  reference is the owner's choice where one is named, else the one measured on
  the most machines; results against another reference are named, not mixed in.
- **F2. Every chart says what it shows.** Next to each chart: the metric and
  project, the reference, the direction for that metric ("lower is faster";
  for memory, "lower uses less memory") and what one mark is.
- **F3. Uncertainty is visible and explained.** Every ratio carries its
  interval, its confidence, its rounds and its call, in the table as well as
  the tooltip. Equivalence, unresolved, too few rounds and an uncalled metric
  read differently. A "same" band is drawn only when every comparison on screen
  shares its resolution. One activation explains what the interval and "same
  ±r" mean.
- **F4. Sources one step from every number.** From any figure, one activation
  reaches the result it came from: machine, harness version, rounds and the raw
  file.
- **F5. Share and export.** A fresh load of a view's link reproduces it, with a
  visible copy-link control. Each chart and table offers its data as CSV or
  JSON, matching the filters on screen. Later: a share image per view, and a
  README badge per project and implementation.
- **F6. Freshness.** Every page shows the latest measurement date. The Results
  list is the changelog: newest first, with the date measured.
- **F7. A comparison builder.** Implementations are chosen as chips; the choice
  survives a reload and a trip through a Result page. Hovering, tapping or
  focusing an implementation (chip, legend entry, dot, table row or hero bar)
  spotlights it everywhere on the page and dims the rest; keyboard and touch
  work as well as hover.
- **F8. Reproduce it.** Each result shows a copyable command, the pinned inputs
  (project commit, binaries' hashes) and the machine.
- **F9. No default states.** Loading, empty, error and unknown-route screens
  are designed, in the site's voice, each with a way on (a link or a retry).
- **F10. Projects like mine.** *(Needs project size in the suite metadata.)*
  Each project is a card with its size, its lowest observed time and margin,
  and it leads into Compare.
- **F11. A contributor path.** Every page offers "run it on your machine":
  the machines and systems with no results yet, one copyable command with its
  expected duration, and what a published result contains.
- **F12. History.** *(Once an implementation has three or more builds on a
  project.)* Its row gains a sparkline over versions, with a call against the
  previous build.

### Look

- **L1. The house palette, designed dark first.** The site still follows the
  OS and the theme menu; both schemes are fully designed. Text colours are
  opaque and meet 4.5:1 on their ground (on `#0d0b14`: pink `#ff3ea5` 6.0,
  cyan `#2de2e6` 12.2, amber `#ffcf7a` 13.5, ink `#f3e9ff` 16.7; on the light
  ground, pink `#c2186b` 5.5 and cyan `#0e7490` 5.1). These ratios hold for
  opaque colour only, not glows, gradients or transparency. Marks and control
  boundaries meet 3:1. Plum `#3a1f5c` (1.4:1) is decoration only: it never
  marks a control's edge or encodes data.
- **L2. Mono with neon script.** Geist Mono for text, labels and figures.
  Every section has a numbered rule with a neon script word (`01 — compare`).
  Script is never used in tables, controls or numbers.
- **L3. Roomy controls.** Buttons, selects and segmented controls are at least
  44px tall, with at least 16px of side padding, and targets are at least 48px
  on touch. Up to five options are a segmented control or chips, not a select.
  A continuous value is a slider with a thumb of at least 20px that also takes
  the keyboard. Hover, pressed and focus differ visibly. Focus is a solid
  contrasting outline, with glow on top if wanted.
- **L4. Flash wherever it carries data.** The hero, the lowest bar, call
  badges, spotlight and hover states, and intervals settling on load. Glow goes
  on headings, chrome and marks, never behind body text and never on an
  interval's endpoints. No dial or gauge encodes a ratio. No flashing and no
  continuous decorative animation. Blur is never animated. Under reduced motion,
  charts render their final state at once.
- **L5. Instrument detail.** A status strip of telemetry: results, machines,
  implementations and the latest measurement date. Figures are tabular, with
  their units dimmer than the number.
- **L6. Vivid series, told apart twice.** Each implementation has a saturated
  colour and a shape (circle, square, triangle, diamond, cross), the same on
  every surface and in every export. Each colour meets 3:1 as a mark on both
  grounds, and the set is checked under protanopia, deuteranopia and
  tritanopia simulation. Where hues converge, the shapes and direct labels carry
  identity. The reference is always the amber lamp at 1×. A call is a word plus
  a colour.
- **L7. Retro is the frame.** The synthwave motif owns the chrome on every page:
  the dusk sky and grid across the top, neon script section words, liner-notes
  boxes, Side A and Side B, a tape counter for rounds on a Result page, the
  end of the tape for an unknown route, a turning reel for loading (static under
  reduced motion). Never on a chart's data or a table's figures.
- **L8. It has a voice.** Each page has at least one line of non-generic copy
  in the liner-notes register ("recorded on …", "Side A", "track 03"). Empty
  states make a point as well as a joke.
- **L9. Phone first-class.** At 390×844:
  - The F1 sentence is on the first screen.
  - The chart re-encodes rather than shrinks: labels sit above their dots,
    ticks never overlap, and the plot is at least 260px wide.
  - The table becomes cards with build, ratio, call and both figures, and no
    sideways scroll.
  - The filters fold behind one 48px button that names the current
    selection.
  - A first tap on a dot shows its numbers; only a second tap (or its link)
    leaves the page.
  - Nothing fixed covers content.
  - The page survives 200% text and reflows at 320 CSS px.

## Scorecard

Before is commit 256237a (the site before the redesign); after is the redesign,
judged from the camera's 56 cells (desktop, phone, tablet, 200% zoom, light and
dark) and the source.

| | Criterion | Before | After | Notes on after |
|---|---|---|---|---|
| F1 | The answer first | Partly | Yes | The billboard: the candidate with the lowest median across machines (one vote each, the newest result), in words and as a race with one pip per machine's call, the reference and scope; a plain claim only when the machines agree; rows in the same order; on a phone's first screen |
| F2 | Every chart says what it shows | Partly | Yes | The sub line names metric, project, reference, direction and the mark; memory reads "lower uses less memory" (it used to inherit "lower is faster") |
| F3 | Uncertainty visible and explained | Partly | Mostly | Interval, confidence, rounds and call in the table as well as the tooltip; the band only when resolutions agree; one disclosure explains. The explanation is beside the chart, not beside every number |
| F4 | Sources one step away | Mostly | Yes | A chart mark (a second tap on a phone) and a table row's link each reach the result |
| F5 | Share and export | Partly | Mostly | Copy link (it says "Copied ✓"), and CSV and JSON of the table: the rows on screen, in the order on screen. The table's sort is not in the link. Not yet: share images, README badges |
| F6 | Freshness | Partly | Yes | "Latest run" in the telemetry on every page; the Results list, newest first, is the changelog |
| F7 | A comparison builder | Partly | Mostly | Chips, kept in the link (reload, Back) and by the Pages nav's Compare. The spotlight follows hover on chips, race lanes, marks and table rows, and focus on chips and table rows; it has no tap of its own |
| F8 | Reproduce it | Partly | Yes | "Record it again": the suite command with the result's sides, kind and project; project commit and binaries' hashes beside it |
| F9 | No default states | No | Yes | Reels while loading, "blank tape", "the tape snapped" with Try again, "end of side A" with the way back |
| F10 | Projects like mine | No | No | Needs project size in the suite metadata |
| F11 | A contributor path | Partly | Partly | "Run it on your machine" on every page leads to About's Side B: the command, the pull request, what leaves the machine. Not yet: the machines and systems with no results |
| F12 | History | n/a | n/a | No implementation has three builds on a project yet |
| L1 | House palette, dark first | No | Yes | Every text colour 4.5:1 and every mark and edge 3:1 on its ground, in both schemes |
| L2 | Mono with neon script | No | Yes | Geist Mono throughout; Yellowtail section words on numbered rules |
| L3 | Roomy controls | No | Yes | Buttons, selects, segments and chips 44px or more; under a finger, 48px (sort headers and segments 44px); a cyan focus outline |
| L4 | Flash wherever it carries data | No | Yes | The billboard's figure and race, the lowest bar's gradient, glowing chips and spotlight; bars grow once on load and not at all under reduced motion; intervals stay crisp |
| L5 | Instrument detail | Partly | Mostly | The telemetry strip; tabular figures; units dimmer in the billboard and race, not yet in tables |
| L6 | Vivid series, told apart twice | Partly | Yes | Colour and shape per implementation everywhere; simulated under protanopia, deuteranopia and tritanopia (slots 4 and 5 converge under deuteranopia and lean on their shapes) |
| L7 | Retro is the frame | No | Yes | The dusk sky, sun and grid; script words; liner boxes; Side A and B; the tape counter; the end of the tape; the reels |
| L8 | It has a voice | No | Yes | "tune in", "the spread", "liner notes", "the sessions", "studio notes", "pressed in Kansas City" |
| L9 | Phone first-class | No | Mostly | Verdict on the first screen, labels above marks, cards, the Filters button, tap then tap again, nothing fixed. 200% text and 320px reflow are not yet checked |
