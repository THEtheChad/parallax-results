# Camera contract

What `scripts/ui-audit/capture.ts` must produce, so the reviewer brief and
`consolidate.ts` can rely on it. The camera itself is app code (how the app is
served, where its data comes from, and sign-in where it has any) and sits under
the repo's gates. This file is the interface.

## Run

`AUDIT_BUILD="<what serves it>" node scripts/ui-audit/capture.ts [--only <id-substring>]` writes
`scripts/ui-audit/runs/<run-id>/` (gitignored), where `<run-id>` is the UTC
start time, `YYYY-MM-DDTHH-MM-SS`. It **exits 1 if any expected cell is not
`valid`**, so a smoke run is a real check.

## Cells

A cell is one step of one scenario at one viewport, named
`<scenario>.<step>@<viewport>`. A keyboard walk is a cell too, with step name
`keyboard`. Every expected cell is accounted for at the end of the run: one it
never reached is recorded `blocked`. Where the UI has more than one colour
scheme, the scheme is part of the viewport's name (`desktop`, `desktop-dark`),
so cell names keep this shape.

Every step asserts the exact route it ends on (for a hash-routed app, the path
and search in the hash), and the shell:
- **where the app has sign-in**, the identity the shell shows: the account or
  person in the sidebar or header, never anywhere on the page;
- **otherwise**, the site's own shell: its header or brand, and the nav item
  marked active for the route (`aria-current`), never a matching word anywhere
  on the page.

A check the camera can't make from the pixels is listed in the cell's
`unasserted`, and the orchestrator turns each into a finding of its own.

A step that acts (a click, a Back) states where it must land; a step that
doesn't is held to the scenario's own path. Console errors and page errors are
listened for from before the first navigation: each cell answers for every
error since the previous cell, so errors raised while a page loads or is
photographed are never dropped.

| Status | Meaning |
|---|---|
| `valid` | Every assertion held: exact route, `h1`, shell (identity, or header and active nav item), fixture text, no unexpected console error or page error. Only valid cells reach reviewers. |
| `failed` | Reached, but an assertion failed. The screenshot shows the wrong page; it is evidence of the failure only. |
| `blocked` | Never reached: an earlier step (or the sign-in, where there is one) threw. |

Each cell has a `mode`: `real` (the app on its real data) or `stub` (data
served from recorded fixtures, for states the real data cannot produce on
demand). Stub cell names end in `~stub`, e.g. `results-empty~stub.page@desktop`.
A stub cell proves rendering, not the data behind it.

## Files per cell

| File | Contents |
|---|---|
| `<cell>.png` | Full page. The viewport is grown to fit the scrolling main region. |
| `<cell>.viewport.png` | Exactly what the supported viewport shows, before growing. |
| `<cell>.aria.yml` | Playwright's ARIA snapshot of `body`. |
| `<cell>.axe.json` | axe violations, WCAG 2.2 AA tags. Valid cells only. |
| `<cell>.probes.json` | The probes below. Valid cells only. |
| `<scenario>@<viewport>.keyboard.json` + `.tabNN.png` + `.keyboard.png` | A keyboard walk: `terminatedBy` (`wrapped`: focus came back to the first stop, so the walk is complete; `cap`: it ran out of presses), then each Tab stop's role, name and region with a crop of its focus ring, and the page it crossed. |

### Probes

| Key | What it records |
|---|---|
| `pageOverflowX` | The page scrolls sideways at this viewport. |
| `clipped` | Leaf text cut off by `overflow: hidden` or an ellipsis. |
| `spills` | Text taller than its fixed-height box (badges, table cells): it overprints its neighbours. |
| `smallTargets` | Interactive elements under 24×24 CSS px. |
| `headingFontOutsideTitles` | The heading face used outside headings. Empty where headings share the body face. |
| `outline` | Visible headings in order, with level. |
| `landmarks` | Visible landmarks, with names. |

A repo may add probes; it never renames these.

## manifest.json

```jsonc
{
  "runId": "…",
  "capturedAt": "ISO time the run started (the clock is recorded, not frozen)",
  "base": "the URL captured",
  "build": "what served it, e.g. `vite preview (production build)`",
  "commit": "git sha", "dirty": false,
  "browser": "…", "playwright": "…", "axe": "…",
  "fixtures": { /* what the data held, as the scenarios read it */ },
  "hidden": "CSS that hid non-product chrome, if any",
  "cells": [{
    "scenario": "…", "step": "…", "viewport": "…", "persona": "…",
    "mode": "real | stub", "url": "path + query (+ hash)", "status": "valid | failed | blocked",
    "unasserted": ["checks the camera could not make, e.g. active nav item not on screen"],
    "problems": ["…"], "consoleErrors": ["…"], "files": { "screenshot": "…" }
  }]
}
```

`consolidate.ts` reads `cells[].scenario`, `.step`, `.viewport` and `.status`;
the rest is for the brief and the reviewers.

## Known blind spots

- Captures run with `reducedMotion: "reduce"`. Default motion (spinners,
  chart animations, timing) is never photographed.
- A still shows one moment. Announcements (`aria-live`) and transitions need a
  journey with an assertion per step.
- Hover is not captured, and neither is anything only hover shows (a chart's
  tooltip).
- A zoom viewport (e.g. `zoom200`: 640×400 CSS px at device scale 2) emulates
  browser zoom; it isn't the browser's own zoom control.
