# UI audit: principles and rubric

The steps live in [SKILL.md](./SKILL.md), whose frontmatter carries the
skill's version; this file is what they rest on. The repo's configuration is
`docs/ui/AUDIT.md`.

## Principles

1. **Camera before critic.** Capture is deterministic and has no opinions.
2. **Rules decide what rules can.** A reviewer judges only what code cannot.
3. **No evidence, no finding.** No captured cell, no finding; no after-cell, no
   fix claim.
4. **Audit only what is built.** Planned features and known bugs are not
   findings.
5. **Budgets are declared up front**: cells, findings, reviewer runs and owner
   time. A run that runs out reports "budget exhausted"; it never reports
   "clean".
6. **Evidence outlives the worktree.** Raw reviewer output, the brief, the
   manifest, the triage and the verification are committed with the report.

## Scope (owner, kept in `AUDIT.md`)

- **Spec index**, in order of precedence, each with its status.
- **Surfaces**, each `built`, `hidden-404` or `planned`. Only `built` ones are
  audited.
- **Supported viewports and zoom** (and colour schemes, where the UI has more
  than one). An owner decision. Without it, narrow findings are noise.
- **Personas**, and the data each sees. A site without sign-in has one: the
  anonymous visitor.
- **Cold-read questions**: what a first-time user must be able to answer from
  the pixels alone.
- **Component vocabulary**: the names a finding may give as its `component`.
- **Layout conventions**: the dominant patterns, cited as precedent. Grown per
  run.
- **Accepted deviations** and **deferred findings**, each with an owner and a
  revisit trigger.
- **Budgets** and **gates**.

## Scenarios

Sparse by construction. A role varies only where the UI reads it, a data state
only where that data appears, an interaction state once per shared component.
Every step asserts what a healthy page shows, including its shell (the
signed-in identity where there is one, otherwise the site's header and active
nav item), so the camera can refuse to photograph the wrong page.
**Journeys** cover what no still can: Back, a change of selection mid-task,
navigation without a progress signal. **Keyboard walks** record each Tab stop
and the focus ring.

## Reviewers: three lenses, three model families, blind to each other

| Lens | Judges | Sees |
|---|---|---|
| Robustness & keyboard | Data extremes, viewports, keyboard, focus, announcements, error and empty states; and harness defects | Everything: cells, axe, probes, a11y trees, keyboard walks, source, spec |
| Craft & consistency | Hierarchy, rhythm, density, type, sameness across surfaces, fidelity to the site's visual language as AUDIT.md's spec describes it | Screenshots and spec. **No code, no stylesheets.** |
| Cold read | The cold-read questions, then the journeys as sequences | Screenshots and the manifest. **No spec, no code.** |

Information hiding is the lever: the cold read finds what the spec has trained
everyone else not to see.

## Finding rubric

- **severity** is user impact only.
  - **S1**: the task is impossible, or the user acts on or reads the wrong
    record (the wrong account where there are accounts; here, the wrong result,
    build or comparison). Not "unclear": a user who can still finish is S2.
  - **S2**: likely to misread or make an error.
  - **S3**: friction.
  - **S4**: cosmetic.
- **kind**: a11y, consistency, copy, state, layout or flow.
- **confidence**: high means visible in a screenshot; medium means inferred
  from the a11y tree, DOM or probes; low means opinion. `consolidate.ts` checks
  the claim against the evidence cited.
- **reference**, strongest first: a spec section; precedent ("sibling surface
  does X", citing its cell or `file:line`); "taste". For the cold read,
  `cold-read: Qn`. A finding against a plain browser or library default (a
  native control, a chart library's own tooltip) is not a finding unless it
  contradicts the site's visual language.
- **Caps** per reviewer: 15 findings, at most 5 taste and at most 3 per
  cold-read question. Harness defects are outside the cap.

## Merging and triage

The merge is bookkeeping, not diagnosis. Code validates, enforces caps and
proposes clusters; the orchestrator decides root causes and records which raw
findings each holds. Agreement between reviewers is corroboration, not proof.

**The skeptic pass** checks every cold-read, taste, S1 and S2 finding against
the evidence. Reviewers landing near each other is not corroboration. A
rejection must cite a valid cell the affected user can reach that shows the
claim is false. Source shows intent, not what renders.
An answer the user could only find elsewhere lowers severity; it doesn't refute
the finding.

The owner decides each root cause: **fix, accept as deviation, defer or
reject**. Their decision is recorded beside the orchestrator's proposal, so
agreement can be measured. Deferrals and deviations get an owner and a revisit
trigger in `AUDIT.md`.

## Fixing

Fix at the root: a theme token, a shared component or a layout convention.
**Never patch one page's look around a shared token or component**; change the
token or the component. One commit per root cause. A rule-shaped finding
becomes a test, which counts only once it is shown to fail on the original
defect. Re-capture every cell that renders a touched component: follow
importers, not routes.

## Outcomes

**passed**, **passed with accepted deviations**, **blocked** or **budget
exhausted**. "Passed" needs every fixed root cause verified resolved and a
human observation.

## Measuring the process

- The owner agrees with at least 70% of S1/S2 root causes as proposed.
  Otherwise the rubric is wrong.
- The run finds at least one real problem a screenshot-only pass would miss.
- Triage fits its time box.
- Each run records **one human observation** (a hallway task test, a user's
  report), or says why there was none. An all-model council converges on
  polish that pleases the spec.
- A later round stops when it yields fewer than 3 new non-taste findings.

## Not yet

Lighthouse, 1920px, hover cells, a diff audit on every PR, and a browser CI job
that fails the build.
