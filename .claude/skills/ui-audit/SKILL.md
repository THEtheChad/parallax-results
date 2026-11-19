---
name: ui-audit
description: Run this repo's UI audit end to end: capture, three blind reviewers, owner triage, fix, verify. It spends a production build and capture per fix batch plus verification captures, a preflight reviewer run and three high-effort review runs, a correction run per invalid answer and a re-check per judgement fix, and up to an hour of the owner's time.
disable-model-invocation: true
version: 3.1.0
---

# UI audit

The audit has two halves:
- **Evidence:** a deterministic camera photographs the built UI.
- **Judgement:** three reviewers on different model families, each blind to the others, judge the photographs.

The owner decides what gets fixed, and every fix is checked against new photographs.

Three things to know before you start:
- [process.md](./process.md) holds the principles and the finding rubric.
- `docs/ui/AUDIT.md` is this repo's configuration. Read it first on every run.
- `scripts/ui-audit/` is this repo's camera. [camera-contract.md](./camera-contract.md) is its interface.

## Before you start

**Invocation:**
- `/ui-audit <surfaces>` runs everything.
- `/ui-audit capture <surfaces>` stops after step 3.
- `/ui-audit resume <audit>` continues an audit. Find where it stopped with the table at the end of this file.

`<surfaces>` names rows of AUDIT.md's Surfaces table, e.g. `/ui-audit Compare and Result`. Each row gives the scenario-id substring that selects it, which is what capture's `--only` takes; several surfaces are one comma-separated `--only` (`/ui-audit Compare and Result` is `--only compare,result-,journey`), and the whole site is no `--only` at all.

**Cost.** Before step 1, tell the owner what the run will spend:
- **captures:** a production build and capture for r1, another per harness-fix re-capture, one per fix batch, and the verification captures;
- **reviewer runs:** one preflight run (the robustness lens), three high-effort review runs, a `fix-<name>` round for each answer that fails validation, and a `verify` re-check for each judgement fix;
- **the owner's time:** scope decisions still pending in AUDIT.md, then up to an hour of triage.

AUDIT.md declares the budgets, reviewer runs included. "Budget exhausted" is a legitimate outcome.

**Where things live:**
- **The audit:** `docs/ui/audits/<date>-<scope>/`, committed as it grows. It holds `NOTES.md`, the brief, the reviewers' raw answers, the triage and the verification.
- **Each capture:** its own run, `scripts/ui-audit/runs/<run-id>/`, which is gitignored and dies with the worktree.
- **The capture log:** `NOTES.md` lists each capture as a revision (r1, r2, …), with its run id and why it was taken.

**This repo:** pnpm and Node 24, which runs the TypeScript scripts directly (no build step). The skill's own code, `consolidate.ts`, is typechecked and tested with the rest of the repo (`test/ui-audit/`).

## 1. Scope

1. Read `AUDIT.md`.
2. Match `<surfaces>` against its Surfaces table. Only `built` surfaces are audited.
3. Check that AUDIT.md declares the supported viewports, the cold-read questions and the component vocabulary.
   - If one is missing, or marked as pending the owner's decision, ask the owner now.
   - Record their answer in AUDIT.md before going on.
4. Run AUDIT.md's gates on a clean tree, and record the commit.
5. Create the audit directory. Write its `NOTES.md` with the surfaces, viewports, personas and budgets for this run.

**Done when** the audit directory exists, and AUDIT.md answers every scope question without "pending".

## 2. Scenarios

For each in-scope surface, make sure `scripts/ui-audit/scenarios.ts` covers, following process.md's Scenarios rules:
- the data states the surface shows;
- the personas whose role it reads (a site without sign-in has one: the anonymous visitor);
- one journey through it;
- a keyboard walk;
- every supported viewport, at least once.

Every step asserts:
- the exact route it lands on (for a hash-routed site, the path and search in the hash);
- the `h1`;
- the shell: the identity it shows, where the app has sign-in; otherwise the site's own shell, its header or brand and the active nav item;
- the fixture text that proves the data loaded.

New scenarios pass AUDIT.md's gates like any other code.

**Done when** each in-scope surface has a scenario for every data state and persona it renders, and the planned cells fit the capture budget.

## 3. Capture

1. Follow AUDIT.md's "Running it" section. In this repo, `pnpm ui-audit:capture` (add `--only <substring>` per surface, see "Before you start") does it all:
   - it makes **a production build** (dev servers inject overlays and devtools), writes the fixture data sets, serves the site itself and stops the server when done;
   - `AUDIT_BUILD` only overrides the build line recorded in the manifest; leave it unset unless something else serves what was captured;
   - it refuses a dirty tree unless given `--allow-dirty`. An audit's captures come from committed trees: commit first, and keep `--allow-dirty` for a look while a fix is in progress, never for a logged revision.
2. Log the capture as revision r1 in `NOTES.md`, with its run id and commit.
3. Read the run's `manifest.json`. Check each cell that isn't `valid`, and each `unasserted` entry:
   - **A harness defect:** fix the scenario and re-capture as a new revision.
   - **A product defect:** record it in `NOTES.md` as a finding of your own.
   - **An `unasserted` entry** is a check the camera owed this cell (one of the assertions in step 2: the route, the `h1`, the shell or identity, the fixture text) and could not make from the pixels, e.g. the active nav item is not on screen at this viewport. It is always a product finding: the user can't see it either.
   - **The camera contract's known blind spots** (default motion, hover where it isn't captured, a still's single moment) are declared once, in [camera-contract.md](./camera-contract.md). They are never written to `unasserted` and never filed as findings.

**Done when** `capture.ts` exits 0, or every cell that isn't valid has a reason in `NOTES.md`.

If the run was `/ui-audit capture`, stop here and report the counts.

## 4. Brief and dispatch

**Pre-flight**, to find camera defects before anyone else spends a review on them:
1. Copy [camera-contract.md](./camera-contract.md) into the run as `CAMERA.md`.
2. Fill [reviewer-brief.md](./reviewer-brief.md) into the run as `REVIEWER-BRIEF.md`. It lists **valid cells only**.
3. Dispatch only the robustness lens (round `preflight`), to find harness defects.
4. Fix every harness defect it reports, and re-capture as a new revision.
5. Discard the pre-flight round's product findings: they judged the old capture.

**Review:**
1. On the final revision, write the brief again.
2. Dispatch all three lenses (round `review`). The lens prompts are in [lenses/](./lenses/), and how to dispatch them is in [reviewers.md](./reviewers.md).
3. Save each answer the moment it arrives, exactly as received, to `<audit>/findings/<name>.json`.
4. Record the revision and task id of each answer in `<audit>/reviewers.json`.

**Done when** all three files are saved, and every one of them judged the same revision.

## 5. Consolidate

1. Run `node .claude/skills/ui-audit/consolidate.ts check <audit> <run>`, where `<run>` is the revision the reviewers judged.
   - It validates shape, caps, cells, cited files and component names. It reads the component names from AUDIT.md's "Component vocabulary" block; the format is in the comment at the top of `consolidate.ts`.
   - It copies the manifest into the audit.
   - It writes candidate root causes to `clusters.md`.
   - If a reviewer's file fails validation, send it back to that reviewer once, as round `fix-<name>`, with the error list. Never repair their JSON yourself.
2. **Skeptic pass.** Check every finding `clusters.md` marks `skeptic`, against the rule in process.md.
3. Write `<audit>/triage.json`:
   - each root cause, in report order, with the raw ids it holds and its `proposed` decision;
   - each rejection, with the valid `cell` that refutes it.
4. Run `consolidate.ts render <audit> <run>`.
5. Write `docs/ui/audits/<date>-<scope>.md` from [report-template.md](./report-template.md), and put `findings.md` inside it.

**Done when** `render` exits 0 and every root cause has a `proposed` decision.

## 6. Triage

Ask the owner one question that points at the report. The answers:
- **As proposed**;
- **S1 + S2 only**;
- **As proposed, except…**, with a free-text field for the exceptions.

Give these their own questions:
- every S1 or S2 you propose to defer or reject;
- every design choice a fix needs, for example how a narrow layout should behave;
- **the human observation**: what one real person did with this UI. If there was none, the owner says why.

Record what the owner decided:
1. Write each answer as that root cause's `decision` in `triage.json`.
2. Re-run `render`.
3. Add each deferral and deviation to AUDIT.md, with an owner and a revisit trigger.
4. Put the human observation in the report.

**Done when** every root cause in `triage.json` has a `decision`, and the human observation, or the reason there isn't one, is in the report.

## 7. Fix

Follow process.md's Fixing rules: fix at the root, make one commit per root cause, and turn every rule-shaped finding into a test.
- Re-capture the cells each touched component renders in, and look at them.
- Run AUDIT.md's gates once per batch.

**Done when** every fix has its commit, its tests and green gates, and its after-cells are captured.

## 8. Verify

1. Run a full capture, and log it in `NOTES.md` as a revision.
2. **Deterministic findings** (axe, probes, overflow, assertions): read that revision's `.axe.json` and `.probes.json` for the cells each finding cited, and compare them with the before revision.
3. **Judgement findings** (copy, hierarchy, cold-read answers, notices): send each one back to the lens that raised it, as round `verify`. Send only the before and after cells, and ask: resolved, not resolved, or regressed?
4. A root cause that comes back not resolved or regressed goes back to step 7, or to the owner, who can defer or accept it.

**Done when** every fixed root cause is either resolved, with its verdict in the report's Verification table, or has a new owner decision. Commit cropped before/after evidence and a regression test for each S1 and S2 fix.

**Synthetic evidence.** Caption every committed crop or quote of a `~stub` cell "synthetic fixture data, not measurements". A stub cell shows how the page draws a state, never how a real implementation performs: it is never evidence of that in the report, and its numbers are never quoted as results.

## 9. Record

1. Make sure the audit directory holds everything it should:
   - `NOTES.md`;
   - `REVIEWER-BRIEF.md`;
   - `manifest.json`;
   - `findings/`;
   - `reviewers.json`;
   - `clusters.md`;
   - `triage.json`;
   - `findings.md`;
   - `static-report.txt`, if the repo has `static.ts`;
   - the cropped evidence, every `~stub` crop captioned "synthetic fixture data, not measurements".

   Screenshots stay out, apart from the cropped evidence.
2. Write the outcome into the report:
   - **passed**, only if every fixed root cause was resolved and there is a human observation;
   - **passed with accepted deviations**;
   - **blocked**;
   - **budget exhausted**.

**Done when** the report states its outcome and links its audit directory.

## 10. Retro

1. Update AUDIT.md with the layout conventions this run settled and any new component names.
2. Add the run's process notes to the report.
3. If you changed this skill, bump `version` above (major for a change to the method or to what `consolidate.ts` accepts, minor for a new check, step or rule, patch for wording), and keep `consolidate.ts` and its test green under the repo's gates. A check that newly catches what was always invalid (a cited path it used to miss) is minor, not major.

**Done when** AUDIT.md carries what the run settled, and any change to the skill has its version bump.

## Resuming: which step an audit is at

Find the first row whose file is missing or incomplete, and continue from that step.

| Missing from `<audit>/` | Resume at |
|---|---|
| `NOTES.md` | 1 |
| A capture revision in `NOTES.md` | 3 |
| `findings/<name>.json` for any lens | 4 |
| `triage.json`, or `findings.md` | 5 |
| A `decision` on any root cause | 6 |
| A fix commit for any `fix` decision | 7 |
| A verdict in the report's Verification table | 8 |
| An outcome in the report | 9 |
