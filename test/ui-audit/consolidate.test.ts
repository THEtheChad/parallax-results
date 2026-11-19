// The ui-audit skill's merge step: what it refuses from a reviewer, how it proposes root causes, and
// the report it renders from the triage.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { cluster, evidenceKind, type Finding, needsSkeptic, render, validate, vocabulary } from "../../.claude/skills/ui-audit/consolidate.ts";

const repo = join(import.meta.dirname, "../..");
const script = join(repo, ".claude/skills/ui-audit/consolidate.ts");

let n = 0;
const finding = (over: Partial<Finding> = {}): Finding => ({
  id: `astra-${++n}`,
  scenario_cells: ["compare.page@desktop"],
  component: "ComparisonTable",
  severity: "S3",
  kind: "layout",
  affected_users: "everyone",
  evidence: ["compare.page@desktop.png: row 2"],
  reference: "AUDIT.md § Layout conventions",
  finding: "Something renders wrong.",
  proposed_fix: "Render it right.",
  confidence: "high",
  ...over,
});

const cells = new Map([
  ["compare.page@desktop", "valid"],
  ["compare.page@phone", "valid"],
  ["results.page@desktop", "valid"],
  ["result.missing@desktop", "failed"],
]);
const names = new Set(["ComparisonTable", "Header", "Filters"]);

// Each problem matches its pattern, in order, and there are no others.
const matchesAll = (actual: string[], patterns: RegExp[]): void => {
  assert.equal(actual.length, patterns.length, `expected ${patterns.length} problems, got:\n${actual.join("\n")}`);
  patterns.forEach((p, i) => assert.match(actual[i] ?? "", p));
};
const someMatch = (actual: string[], pattern: RegExp): void =>
  assert.ok(
    actual.some((a) => pattern.test(a)),
    `no entry matches ${pattern}:\n${actual.join("\n")}`,
  );

describe("validate", () => {
  test("passes a well-formed finding", () => {
    const r = validate(new Map([["astra", [finding()]]]), cells, names);
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.warnings, []);
    assert.equal(r.findings.get("astra")?.length, 1);
  });

  test("checks the shape of what a reviewer sent before trusting any of it", () => {
    const { problems, findings } = validate(
      new Map<string, unknown[]>([
        [
          "astra",
          [
            "a string",
            { ...finding(), scenario_cells: [] },
            { ...finding(), affected_users: 3 },
            (({ component: _, ...rest }) => rest)(finding()),
            { ...finding(), severity: "S0" },
            { ...finding(), extra: true },
          ],
        ],
      ]),
      cells,
      names,
    );
    matchesAll(problems, [
      /astra\[0\]: not an object/,
      /astra\[1\]: scenario_cells must list/,
      /astra\[2\]: affected_users must be/,
      /astra\[3\]: component must be/,
      /astra\[4\]: severity "S0"/,
      /astra\[5\]: unknown keys extra/,
    ]);
    assert.deepEqual(findings.get("astra"), []);
  });

  test("refuses evidence the run or the repo doesn't have", () => {
    const run = mkdtempSync(join(tmpdir(), "ui-audit-run-"));
    writeFileSync(join(run, "compare.page@desktop.png"), "");
    const { problems } = validate(
      new Map([
        [
          "astra",
          [
            finding({ evidence: ["compare.page@desktop.png: row 2", "site/src/components/Layout/Layout.tsx:12"] }),
            finding({ evidence: ["compare.page@phone.png: the header"] }),
            finding({ evidence: ["site/src/components/Nope/Nope.tsx:3"] }),
            // A repo path is checked as one, never as a bare run file.
            finding({ evidence: ["docs/ui/nope.json: the token table"] }),
          ],
        ],
      ]),
      cells,
      names,
      { run, repo },
    );
    matchesAll(problems, [
      /cites compare\.page@phone\.png, which the run/,
      /cites site\/src\/components\/Nope\/Nope\.tsx, which doesn't exist/,
      /cites docs\/ui\/nope\.json, which doesn't exist/,
    ]);
  });

  test("refuses a finding without evidence, or citing a cell the camera never made", () => {
    const { problems } = validate(
      new Map([["astra", [finding({ evidence: [] }), finding({ scenario_cells: ["nowhere.page@desktop"] })]]]),
      cells,
      names,
    );
    someMatch(problems, /no evidence, no finding/);
    someMatch(problems, /unknown cell nowhere\.page@desktop/);
  });

  test("warns, not refuses, when a finding cites a failed cell", () => {
    const r = validate(new Map([["astra", [finding({ scenario_cells: ["result.missing@desktop"] })]]]), cells, names);
    assert.deepEqual(r.problems, []);
    matchesAll(r.warnings, [/cites failed cell result\.missing@desktop/]);
  });

  test("holds the caps: 15 findings, 5 taste, 3 per cold-read question; harness defects are outside them", () => {
    const many = Array.from({ length: 16 }, () => finding());
    const taste = Array.from({ length: 6 }, () => finding({ reference: "taste" }));
    const coldRead = Array.from({ length: 4 }, () => finding({ reference: "cold-read: Q2" }));
    const harness = Array.from({ length: 20 }, () => finding({ component: "ui-audit harness", kind: "flow" }));
    someMatch(validate(new Map([["astra", many]]), cells, names).problems, /16 findings, cap is 15/);
    someMatch(validate(new Map([["astra", taste]]), cells, names).problems, /6 taste findings, cap is 5/);
    someMatch(validate(new Map([["astra", coldRead]]), cells, names).problems, /4 findings on Q2, cap is 3/);
    assert.deepEqual(validate(new Map([["astra", harness]]), cells, names).problems, []);
  });

  test("holds components to AUDIT.md's vocabulary, allowing route: and the harness", () => {
    const { problems } = validate(
      new Map([
        [
          "astra",
          [
            finding({ component: "Comparison table (compare view)" }),
            finding({ component: "route:/result/$id" }),
            finding({ component: "ui-audit harness", kind: "flow" }),
          ],
        ],
      ]),
      cells,
      names,
    );
    matchesAll(problems, [/"Comparison table \(compare view\)" is not in/]);
  });

  test("flags high confidence that rests on no screenshot", () => {
    const f = finding({ evidence: ["compare.page@desktop.axe.json: label"] });
    assert.equal(evidenceKind(f), "tree");
    someMatch(validate(new Map([["astra", [f]]]), cells, names).warnings, /evidence is tree/);
  });

  test("makes a reviewer's ids carry its name, once each", () => {
    const { problems } = validate(new Map([["fable", [finding({ id: "astra-1" }), finding({ id: "fable-1" }), finding({ id: "fable-1" })]]]), cells, names);
    someMatch(problems, /id should start "fable-"/);
    someMatch(problems, /fable\/fable-1: duplicate id/);
  });
});

describe("vocabulary", () => {
  test("reads the fenced block under AUDIT.md's Component vocabulary heading", () => {
    const md = [
      "## Personas",
      "```text",
      "not-this",
      "```",
      "## Component vocabulary",
      "",
      "A finding's component is one of these.",
      "",
      "```text",
      "Header           # the site's header and nav",
      "",
      "ComparisonTable",
      "```",
      "## Layout conventions",
      "```text",
      "nor-this",
      "```",
    ].join("\n");
    assert.deepEqual(vocabulary(md), new Set(["Header", "ComparisonTable"]));
    assert.equal(vocabulary("## Personas\n"), undefined);
    // A block under a later heading is not the vocabulary.
    assert.equal(vocabulary("## Component vocabulary\n\nNone yet.\n\n## Layout conventions\n```text\nX\n```\n"), undefined);
  });
});

describe("cluster", () => {
  test("groups findings on one component and shared cells, and keeps a shared word from chaining", () => {
    const a = finding({ id: "astra-1", severity: "S1", component: "Header" });
    const b = finding({ id: "fable-1", severity: "S2", component: "Header" });
    const c = finding({ id: "wonderful-1", component: "Filters", scenario_cells: ["results.page@desktop"] });
    assert.deepEqual(
      cluster([c, b, a]).map((g) => g.map((f) => f.id)),
      [["astra-1", "fable-1"], ["wonderful-1"]],
    );
  });

  test("meets a defect cited on many cells with the same defect cited on few", () => {
    const wide = finding({
      id: "astra-1",
      severity: "S2",
      component: "ComparisonTable",
      scenario_cells: ["compare.page@desktop", "compare.page@phone", "results.page@desktop"],
    });
    const narrow = finding({ id: "fable-1", component: "ComparisonTable", scenario_cells: ["compare.page@phone"] });
    const routeA = finding({ id: "fable-2", component: "route:/results", scenario_cells: ["compare.page@desktop"] });
    const routeB = finding({ id: "fable-3", component: "route:/about", scenario_cells: ["compare.page@desktop"] });
    assert.deepEqual(
      cluster([wide, narrow, routeA, routeB]).map((g) => g.map((f) => f.id)),
      [["astra-1", "fable-1"], ["fable-2"], ["fable-3"]],
    );
  });

  test("marks every cold-read, taste, S1 and S2 finding for the skeptic pass", () => {
    assert.equal(needsSkeptic(finding({ severity: "S2" })), true);
    assert.equal(needsSkeptic(finding({ severity: "S1" })), true);
    assert.equal(needsSkeptic(finding({ reference: "taste" })), true);
    assert.equal(needsSkeptic(finding({ reference: "cold-read: Q1" })), true);
    assert.equal(needsSkeptic(finding({ severity: "S3" })), false);
  });
});

describe("render", () => {
  const raw = new Map([
    ["astra", [finding({ id: "astra-1" }), finding({ id: "astra-2", component: "ui-audit harness" })]],
    ["fable", [finding({ id: "fable-1" }), finding({ id: "fable-2" })]],
  ]);
  const rootCause = {
    id: "F1",
    severity: "S2" as const,
    title: "Ratios wrap mid-number",
    component: "ComparisonTable",
    findings: ["astra-1", "fable-1"],
    proposed: "fix",
  };

  test("accounts for every raw finding exactly once", () => {
    const { markdown, problems } = render(
      raw,
      { rootCauses: [rootCause], rejected: [{ id: "fable-2", cell: "compare.page@phone", reason: "the ratio fits on one line" }] },
      cells,
    );
    assert.deepEqual(problems, []);
    assert.match(markdown, /\| F1 \| S2 \| Ratios wrap mid-number .* astra, fable \| .* \| fix \| — \|/);
    assert.match(markdown, /1 of 1 root causes await the owner's decision/);
    assert.match(markdown, /\*\*fable-2\*\*.*Rejected: the ratio fits .*`compare\.page@phone`/);
    assert.match(markdown, /### Harness findings\n\n- \*\*astra-2\*\*/);
  });

  test("shows the owner's decision beside the proposal, and how often they agreed", () => {
    const { markdown } = render(
      raw,
      {
        rootCauses: [
          { ...rootCause, decision: "fix" },
          { ...rootCause, id: "F2", findings: ["fable-2"], proposed: "fix", decision: "defer" },
        ],
        rejected: [],
      },
      cells,
    );
    assert.match(markdown, /\| fix \| defer \|/);
    assert.match(markdown, /agreed with 1 of 2 S1\/S2 proposals/);
  });

  test("fails on a finding left out, placed twice or unknown, a bad decision, or a rejection without a valid cell", () => {
    const { problems } = render(
      raw,
      {
        rootCauses: [{ ...rootCause, findings: ["astra-1", "astra-9"], proposed: "maybe" }],
        rejected: [{ id: "astra-1", cell: "result.missing@desktop", reason: "r" }],
      },
      cells,
    );
    someMatch(problems, /unknown finding astra-9/);
    someMatch(problems, /astra-1 is in both F1 and rejected/);
    someMatch(problems, /fable-1 is in no root cause/);
    someMatch(problems, /F1: proposed "maybe" is not/);
    someMatch(problems, /rejection of astra-1 must cite a valid cell.*result\.missing@desktop \(failed\)/);
  });
});

describe("the command", () => {
  // A repo of its own: AUDIT.md with a vocabulary, an audit with two reviewers' answers, and a run.
  const root = mkdtempSync(join(tmpdir(), "ui-audit-repo-"));
  const audit = join(root, "docs/ui/audits/2026-11-18-compare");
  const run = join(root, "scripts/ui-audit/runs/2026-11-18T00-00-00");
  mkdirSync(join(audit, "findings"), { recursive: true });
  mkdirSync(run, { recursive: true });
  writeFileSync(join(root, "docs/ui/AUDIT.md"), "# UI audit\n\n## Component vocabulary\n\n```text\nComparisonTable  # the table\n```\n");
  writeFileSync(join(run, "manifest.json"), JSON.stringify({ cells: [{ scenario: "compare", step: "page", viewport: "desktop", status: "valid" }] }));
  writeFileSync(join(run, "compare.page@desktop.png"), "");
  writeFileSync(join(audit, "findings/astra.json"), JSON.stringify([finding({ id: "astra-1" })]));
  writeFileSync(join(audit, "findings/fable.json"), JSON.stringify([finding({ id: "fable-1" })]));
  const consolidate = (command: string) => spawnSync(process.execPath, [script, command, audit, run], { encoding: "utf8" });

  test("check writes the candidate clusters and keeps the manifest", () => {
    const r = consolidate("check");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(readFileSync(join(audit, "clusters.md"), "utf8"), /## C1 · S3 · raised by astra, fable/);
    assert.ok(existsSync(join(audit, "manifest.json")));
  });

  test("render writes findings.md from the triage, and fails until every finding is placed", () => {
    const triage = (findings: string[]): void =>
      writeFileSync(
        join(audit, "triage.json"),
        JSON.stringify({ rootCauses: [{ id: "F1", severity: "S3", title: "t", component: "ComparisonTable", findings, proposed: "fix" }], rejected: [] }),
      );
    triage(["astra-1"]);
    const partial = consolidate("render");
    assert.equal(partial.status, 1);
    assert.match(partial.stdout, /fable-1 is in no root cause/);
    triage(["astra-1", "fable-1"]);
    const r = consolidate("render");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(readFileSync(join(audit, "findings.md"), "utf8"), /\| F1 \| S3 \| t \|/);
  });

  test("fails closed without a vocabulary", () => {
    writeFileSync(join(root, "docs/ui/AUDIT.md"), "# UI audit\n");
    const r = consolidate("check");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no Component vocabulary block/);
  });
});
