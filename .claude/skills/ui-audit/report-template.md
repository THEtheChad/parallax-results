# UI audit {{date}}: {{scope}}

Process: the `ui-audit` skill, v{{skill version}}. Configuration:
[AUDIT.md](../AUDIT.md) at `{{commit}}`. Audit record:
[{{date}}-{{scope}}/](./{{date}}-{{scope}}/).

**Outcome: {{passed | passed with accepted deviations | blocked | budget exhausted}}.**
{{One sentence on why.}}

Cells ending `~stub` render synthetic fixture data. Every crop or quote of one
here is captioned "synthetic fixture data, not measurements", and none is
evidence of how a real implementation performs.

## Runs

| Revision | Run | What | Cells |
|---|---|---|---|
| r1 | `{{run-id}}` | Capture, {{build}} | {{valid}} valid / {{failed}} failed / {{blocked}} blocked; {{real}} real, {{stub}} stub |
| … | … | Re-capture after harness fixes (reviewed), after fixes, verification | … |

Reviewers: {{name: provider instance / model / effort, per lens}}.
Human observation: {{what was observed, by whom, or "none this run, because …"}}.

## Findings and triage

{{findings.md from `consolidate.ts render`: the root-cause table with "Raised
by", raw ids, the proposed and the owner's decision, the agreement line, the
rejected findings with the cell that refutes each, and the harness findings.
Re-render after triage; never edit the table by hand.}}

**Owner triage ({{date}}): {{"as proposed" / the exceptions}}.**

## Verification (run `{{run-id}}`)

| Root cause | How checked | Before | After | Verdict |
|---|---|---|---|---|
| F1 | {{probe / axe / lens re-check by <reviewer>}} | {{cell}} | {{cell}} | resolved / not resolved / regressed |

{{Cropped before/after evidence for every S1 and S2 fix, committed in
`{{date}}-{{scope}}/`. Caption each crop of a `~stub` cell "synthetic fixture
data, not measurements".}}

New regression tests, each shown to fail without its fix:

```text
{{test}}   {{what it holds}}   ✗ before → ✓ after
```

## Process notes

{{What this run taught about the process; what changed in AUDIT.md (new layout
conventions, deviations, deferrals, component names).}}
