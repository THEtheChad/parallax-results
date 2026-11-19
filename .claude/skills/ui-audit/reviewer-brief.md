# Reviewer brief template

Copy this into the capture run as `REVIEWER-BRIEF.md`, and into the audit
directory for the record. Replace every `{{…}}` from `docs/ui/AUDIT.md` and the
run's `manifest.json`, then delete this header. List **valid cells only**: a
reviewer never sees a failed or blocked cell as evidence of a page's look.

---

# Reviewer brief: {{repo}} UI audit, run {{run-id}}

You are one of three independent reviewers. You will not see the others'
findings.

The run directory is this file's directory. Each step of each scenario is one
**cell**, named `<scenario>.<step>@<viewport>`. Cells ending `~stub` render
recorded fixture data: they prove what the page draws, not what the real data
holds, and their numbers are synthetic fixture data, never measurements. The
files are described in `CAMERA.md`, a copy of the camera contract; its "Known
blind spots" (motion, hover where no step captures it) are not findings.

**The valid cells** (the only evidence you may cite):

{{valid cells, one per line, grouped by scenario}}

**Viewports:** {{from AUDIT.md "Supported viewports", with the owner's decision, and the colour schemes if captured}}.
{{Every cell with an `unasserted` entry, and what the camera couldn't check
there, e.g. "active nav item not on screen below 600px: checked against the URL".
An `unasserted` entry is a check the camera owed the cell and couldn't make
from the pixels; the orchestrator has already filed each as a finding. List
none of the contract's known blind spots here: they are in `CAMERA.md`.}}

**Data:** {{what the data held, in a sentence per fixture: extremes, empties}}.

**Personas:** {{persona → what they may do; "one anonymous visitor" where there is no sign-in}}.

## Rules

- **No evidence, no finding.** Cite the cell files and the region ("row 11,
  Ratio column"), or `file:line` for source.
- **Cap: 15 findings**: at most 5 with reference `taste`, and at most 3 per
  cold-read question. Rank by severity. Harness defects don't count toward the
  cap.
- **Severity is user impact only.**
  - **S1**: the task is impossible, or the user acts on or reads the wrong
    record. *E.g. the filters can't be changed at a supported width.* Unclear
    is not S1.
  - **S2**: likely to misread or err. *E.g. "faster" and "slower" are drawn in
    colours that can't be told apart.*
  - **S3**: friction. *E.g. a control is disabled with no reason given.*
  - **S4**: cosmetic. *E.g. one label 1px off its baseline.*
- **kind**: `a11y | consistency | copy | state | layout | flow`.
- **confidence**: `high` means visible in a screenshot you cite; `medium` means
  inferred from the a11y tree, DOM or probes; `low` means opinion.
- **component**: exactly one name from this list, or `route:<path>` for a
  page-specific defect, or `ui-audit harness` for a capture defect:
  {{AUDIT.md "Component vocabulary", comma-separated}}
- **One root cause, one finding.** A defect visible on 12 cells is one finding
  that lists all 12.
- **Out of scope**, so don't report: {{AUDIT.md accepted deviations, deferred
  findings and non-built surfaces, one per bullet}}.

## Output

Write a JSON array to `{{audit-dir}}/findings/{{reviewer}}.json` if you can
write files; otherwise return it as your whole answer, with no prose before or
after. Each object has exactly these keys:

`id` (`"{{reviewer}}-1"`…), `scenario_cells` (cell names), `component`,
`severity`, `kind`, `affected_users`, `evidence` (strings: file plus region,
or `file:line` with the path from the repo root, e.g.
`site/src/components/Layout/Layout.tsx:12`), `reference` (spec section,
precedent, `taste`, or `cold-read: Qn`), `finding` (one or two sentences),
`proposed_fix`, `confidence`.
