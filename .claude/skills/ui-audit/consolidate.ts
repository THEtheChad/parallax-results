// The merge step of the ui-audit skill (SKILL.md step 5), as code. An audit directory holds the
// reviewers' raw answers (findings/<reviewer>.json) and the orchestrator's triage.json; the capture
// run they reviewed holds the manifest and the cells. Run it from anywhere inside the repo:
//
//   node .claude/skills/ui-audit/consolidate.ts check <audit-dir> <run-dir>
//     Validates every finding's shape, the caps, the cited cells and files, and the component
//     vocabulary. Exits 1 on any problem. Copies the run's manifest into the audit, and proposes
//     root-cause clusters in clusters.md: candidates for the orchestrator, never a verdict.
//
//   node .claude/skills/ui-audit/consolidate.ts render <audit-dir> <run-dir>
//     Validates again, then writes findings.md from triage.json: the root-cause table with proposed
//     and owner decisions, the rejected findings with the cell that refutes each, and the harness
//     findings. Exits 1 unless every raw finding is placed exactly once.
//
// What it reads, besides the audit directory:
//
//   docs/ui/AUDIT.md, found by walking up from the audit (or run) directory. Only one part of it is
//   parsed: the component vocabulary. That is the first fenced block after a line that is exactly
//   `## Component vocabulary` (trailing spaces allowed), before the next `## ` heading:
//
//     ## Component vocabulary
//
//     Any prose.
//
//     ```text
//     theme             # a comment: everything from `#` to the end of the line is dropped
//     ComparisonTable
//     ```
//
//   One name per line, trimmed, case-sensitive; blank lines are ignored; a name cannot contain `#`.
//   The fence opens with three backticks and an optional lowercase language tag. `route:<path>` and
//   `ui-audit harness` are always allowed and are not listed. No block, no check: the run fails.
//
//   <run-dir>/manifest.json, as camera-contract.md defines it. Only `cells[].scenario`, `.step`,
//   `.viewport` and `.status` are read, to name cells `<scenario>.<step>@<viewport>` (and
//   `<scenario>@<viewport>` for a keyboard walk) and to know which are `valid`.

import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const SEVERITIES = ["S1", "S2", "S3", "S4"] as const;
const DECISIONS = ["fix", "defer", "accept", "reject"];
const KINDS = ["a11y", "consistency", "copy", "state", "layout", "flow"];
const CONFIDENCES = ["high", "medium", "low"];
const KEYS = [
  "id",
  "scenario_cells",
  "component",
  "severity",
  "kind",
  "affected_users",
  "evidence",
  "reference",
  "finding",
  "proposed_fix",
  "confidence",
] as const;
const CAP = 15;
const TASTE_CAP = 5;
const COLD_READ_CAP = 3;
const HARNESS = "ui-audit harness";

type Severity = (typeof SEVERITIES)[number];

export interface Finding {
  id: string;
  scenario_cells: string[];
  component: string;
  severity: Severity;
  kind: string;
  affected_users: string;
  evidence: string[];
  reference: string;
  finding: string;
  proposed_fix: string;
  confidence: string;
}

interface Cell {
  scenario: string;
  step: string;
  viewport: string;
  status: string;
}

export interface Triage {
  /** One per root cause, in report order. */
  rootCauses: {
    id: string;
    severity: Severity;
    title: string;
    component: string;
    findings: string[];
    /** The orchestrator's proposal: fix | defer | accept | reject. */
    proposed: string;
    /** The owner's answer, once given; same values. */
    decision?: string;
    note?: string;
  }[];
  /** Raw findings the skeptic pass refuted. */
  rejected: {
    id: string;
    /** A valid cell the affected user can reach that shows the claim false. */
    cell: string;
    reason: string;
  }[];
}

const isTaste = (f: Finding): boolean => /^taste\b/i.test(f.reference.trim());
const isHarness = (f: Finding): boolean => f.component.trim().toLowerCase() === HARNESS;
/** The question a cold-read finding answers: `cold-read: Q2` → "Q2". */
const coldRead = (f: Finding): string | undefined => /^cold-read:\s*(Q\d+|\([a-z]\))/i.exec(f.reference.trim())?.[1]?.toUpperCase();

/** What a finding's evidence can show, strongest first. */
export function evidenceKind(f: Finding): "screenshot" | "tree" | "source" {
  const ev = f.evidence.join("\n");
  if (/\.png\b/.test(ev)) return "screenshot";
  if (/\.(aria\.yml|axe\.json|probes\.json|keyboard\.json)\b/.test(ev)) return "tree";
  return "source";
}

/** The names a finding may give as its component; the format is in the header comment. */
export function vocabulary(auditMd: string): Set<string> | undefined {
  const section = auditMd.split(/^## Component vocabulary[ \t]*$/m)[1];
  const block = section?.split(/^## /m)[0]?.match(/```[a-z]*\n([\s\S]*?)```/);
  if (!block?.[1]) return undefined;
  return new Set(
    block[1]
      .split("\n")
      .map((l) => l.replace(/#.*/, "").trim())
      .filter(Boolean),
  );
}
const inVocabulary = (f: Finding, names: Set<string>): boolean => isHarness(f) || f.component.startsWith("route:") || names.has(f.component);

/** Cell names as the camera writes them: `<scenario>.<step>@<viewport>`, mapped to their status. */
function cellNames(run: string): Map<string, string> | undefined {
  const path = join(run, "manifest.json");
  if (!existsSync(path)) return undefined;
  const { cells } = JSON.parse(readFileSync(path, "utf8")) as { cells: Cell[] };
  const names = new Map<string, string>();
  for (const c of cells) {
    names.set(`${c.scenario}.${c.step}@${c.viewport}`, c.status);
    // A keyboard walk is filed per scenario and viewport.
    names.set(`${c.scenario}@${c.viewport}`, c.status);
  }
  return names;
}

/** Each reviewer's raw answer, from <audit>/findings/<reviewer>.json. */
export function load(audit: string): Map<string, unknown[]> {
  const dir = join(audit, "findings");
  const byReviewer = new Map<string, unknown[]>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"));
    if (!Array.isArray(parsed)) throw new Error(`${file}: expected a JSON array of findings`);
    byReviewer.set(basename(file, ".json"), parsed);
  }
  if (byReviewer.size === 0) throw new Error(`no findings in ${dir}`);
  return byReviewer;
}

const isString = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(isString);

/** A reviewer's raw item, checked field by field before anything trusts it. */
function shape(raw: unknown, at: string, problems: string[]): Finding | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    problems.push(`${at}: not an object`);
    return null;
  }
  const f = raw as Record<string, unknown>;
  const before = problems.length;
  const extra = Object.keys(f).filter((k) => !(KEYS as readonly string[]).includes(k));
  if (extra.length) problems.push(`${at}: unknown keys ${extra.join(", ")}`);
  for (const k of ["id", "component", "affected_users", "reference", "finding", "proposed_fix"] as const)
    if (!isString(f[k])) problems.push(`${at}: ${k} must be a non-empty string`);
  if (!isStrings(f.scenario_cells)) problems.push(`${at}: scenario_cells must list at least one cell`);
  if (!isStrings(f.evidence)) problems.push(`${at}: no evidence, no finding`);
  if (!SEVERITIES.includes(f.severity as Severity)) problems.push(`${at}: severity ${JSON.stringify(f.severity)}`);
  if (!KINDS.includes(f.kind as string)) problems.push(`${at}: kind ${JSON.stringify(f.kind)}`);
  if (!CONFIDENCES.includes(f.confidence as string)) problems.push(`${at}: confidence ${JSON.stringify(f.confidence)}`);
  return problems.length === before ? (f as unknown as Finding) : null;
}

// Files a finding's evidence names. A bare file name (`compare.page@desktop.png`) is a run file; a
// path from one of the repo's top-level directories (`site/src/components/Layout/Layout.tsx:12`) is
// a repo file. Neither matches in the middle of a longer path. A repo path ends at a line number, a
// space, punctuation, a closing backtick or bracket (`docs/ui/AUDIT.md`, [site/src/x.tsx]), or a
// full stop that ends the sentence; a path may still hold brackets (site/src/routes/[id].tsx).
const RUN_FILE = /(?<![\w.~@/-])[\w.~@-]+\.(?:png|json|yml|txt)\b(?!\/)/g;
const REPO_FILE = /(?<![\w.~@/-])((?:site|docs|scripts|test|results|\.claude)\/[\w./[\]()@~$-]*?\.[a-z]+)(?=[:\s,;)`\]]|\.(?:\s|$)|$)/g;

export function validate(
  byReviewer: Map<string, unknown[]>,
  cells: Map<string, string> | undefined,
  names: Set<string> | undefined,
  /** Where cited files must exist; omitted, files are unchecked. */
  files?: { run: string; repo: string },
): { problems: string[]; warnings: string[]; findings: Map<string, Finding[]> } {
  const problems: string[] = [];
  const warnings: string[] = [];
  const valid = new Map<string, Finding[]>();
  const seen = new Set<string>();
  for (const [reviewer, raw] of byReviewer) {
    const findings: Finding[] = [];
    raw.forEach((item, i) => {
      const f = shape(item, `${reviewer}[${i}]`, problems);
      if (f) findings.push(f);
    });
    valid.set(reviewer, findings);
    const product = findings.filter((f) => !isHarness(f));
    if (product.length > CAP) problems.push(`${reviewer}: ${product.length} findings, cap is ${CAP}`);
    const taste = product.filter(isTaste).length;
    if (taste > TASTE_CAP) problems.push(`${reviewer}: ${taste} taste findings, cap is ${TASTE_CAP}`);
    const perQuestion = new Map<string, number>();
    for (const f of product) {
      const q = coldRead(f);
      if (q) perQuestion.set(q, (perQuestion.get(q) ?? 0) + 1);
    }
    for (const [q, n] of perQuestion) if (n > COLD_READ_CAP) problems.push(`${reviewer}: ${n} findings on ${q}, cap is ${COLD_READ_CAP}`);
    for (const f of findings) {
      const at = `${reviewer}/${f.id}`;
      if (!f.id.startsWith(`${reviewer}-`)) problems.push(`${at}: id should start "${reviewer}-"`);
      if (seen.has(f.id)) problems.push(`${at}: duplicate id`);
      seen.add(f.id);
      if (f.confidence === "high" && evidenceKind(f) !== "screenshot")
        warnings.push(`${at}: confidence high, but its evidence is ${evidenceKind(f)}, not a screenshot`);
      if (names && !inVocabulary(f, names)) problems.push(`${at}: component "${f.component}" is not in AUDIT.md's vocabulary`);
      if (cells)
        for (const c of f.scenario_cells) {
          const status = cells.get(c);
          if (!status) problems.push(`${at}: cites unknown cell ${c}`);
          // A failed cell shows the wrong page: it is evidence of the failure, never of the page's
          // look. The skeptic pass decides.
          else if (status !== "valid" && !isHarness(f)) warnings.push(`${at}: cites ${status} cell ${c}`);
        }
      if (files)
        for (const e of f.evidence) {
          for (const name of e.match(RUN_FILE) ?? [])
            if (!existsSync(join(files.run, name)) && !existsSync(join(files.repo, name)))
              problems.push(`${at}: cites ${name}, which the run doesn't have`);
          for (const [, path] of e.matchAll(REPO_FILE))
            if (path && !existsSync(join(files.repo, path))) problems.push(`${at}: cites ${path}, which doesn't exist`);
        }
    }
  }
  return { problems, warnings, findings: valid };
}

/** A component's words, so "Comparison table (compare view)" meets "ComparisonTable". */
const STOP = new Set(["the", "and", "of", "in", "on", "for", "used", "inside"]);
function words(component: string): Set<string> {
  return new Set(
    component
      .replace(/^route:/, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

const overlap = <T>(a: Set<T>, b: Set<T>): T[] => [...a].filter((x) => b.has(x));

/**
 * Candidate root causes. Findings are taken most severe first; each joins the first group whose
 * seed (its most severe finding) shares a component word and half the cells of whichever of the two
 * cites fewer, or seeds a new group. Overlap over the smaller set lets a defect one reviewer saw on
 * 12 cells meet the same defect another cited on 2. Comparing with the seed rather than any member
 * keeps one shared word from chaining unrelated findings together. The orchestrator still splits or
 * joins in triage.json.
 */
export function cluster(findings: Finding[]): Finding[][] {
  const rank = (f: Finding): number => SEVERITIES.indexOf(f.severity);
  const groups: { seed: Finding; members: Finding[] }[] = [];
  for (const f of [...findings].sort((a, b) => rank(a) - rank(b))) {
    const cells = new Set(f.scenario_cells);
    const home = groups.find(({ seed }) => {
      const seedCells = new Set(seed.scenario_cells);
      const smaller = Math.min(cells.size, seedCells.size) || 1;
      return overlap(words(f.component), words(seed.component)).length > 0 && overlap(cells, seedCells).length / smaller >= 1 / 2;
    });
    if (home) home.members.push(f);
    else groups.push({ seed: f, members: [f] });
  }
  return groups.sort((a, b) => rank(a.seed) - rank(b.seed) || b.members.length - a.members.length).map((g) => g.members);
}

const cellText = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

const reviewerOf = (id: string): string => id.split("-")[0] ?? "";

/**
 * Findings the skeptic pass must check (process.md): every cold-read, taste, S1 and S2 finding. A
 * candidate cluster is not corroboration, so a second reviewer nearby clears nothing.
 */
export function needsSkeptic(f: Finding): boolean {
  return Boolean(coldRead(f)) || isTaste(f) || f.severity === "S1" || f.severity === "S2";
}

function clustersMarkdown(groups: Finding[][]): string {
  const out = [
    "# Candidate root causes",
    "",
    "Proposed by `consolidate.ts check`: findings sharing a component word and half",
    "the cells (of whichever cites fewer) with the group's first finding. Confirm, split",
    "or join each group in `triage.json`. `skeptic` marks what the skeptic pass must check.",
    "",
  ];
  groups.forEach((g, i) => {
    const reviewers = new Set(g.map((f) => reviewerOf(f.id)));
    out.push(
      `## C${i + 1} · ${g.map((f) => f.severity).sort()[0]} · raised by ${[...reviewers].join(", ")}`,
      "",
      "| id | sev | kind | conf | evidence | check | component | finding |",
      "|---|---|---|---|---|---|---|---|",
      ...g.map(
        (f) =>
          `| ${f.id} | ${f.severity} | ${f.kind} | ${f.confidence} | ${evidenceKind(f)} | ${needsSkeptic(f) ? "skeptic" : ""} | ${cellText(f.component)} | ${cellText(f.finding)} |`,
      ),
      "",
    );
  });
  return out.join("\n");
}

export function render(
  byReviewer: Map<string, Finding[]>,
  triage: Triage,
  cells: Map<string, string>,
): { markdown: string; problems: string[] } {
  const all = [...byReviewer.values()].flat();
  const byId = new Map(all.map((f) => [f.id, f]));
  const placed = new Map<string, string>();
  const problems: string[] = [];
  const place = (id: string, where: string): void => {
    if (!byId.has(id)) problems.push(`${where} names unknown finding ${id}`);
    const before = placed.get(id);
    if (before) problems.push(`${id} is in both ${before} and ${where}`);
    placed.set(id, where);
  };
  for (const rc of triage.rootCauses) {
    for (const id of rc.findings) place(id, rc.id);
    if (!DECISIONS.includes(rc.proposed)) problems.push(`${rc.id}: proposed "${rc.proposed}" is not ${DECISIONS.join(" | ")}`);
    if (rc.decision !== undefined && !DECISIONS.includes(rc.decision))
      problems.push(`${rc.id}: decision "${rc.decision}" is not ${DECISIONS.join(" | ")}`);
  }
  for (const r of triage.rejected) {
    place(r.id, "rejected");
    // A rejection shows what renders, not what the code intends (process.md).
    const status = cells.get(r.cell);
    if (status !== "valid")
      problems.push(`rejection of ${r.id} must cite a valid cell that refutes it, not ${r.cell ? `${r.cell} (${status ?? "unknown"})` : "none"}`);
  }
  for (const f of all) if (isHarness(f) && !placed.has(f.id)) placed.set(f.id, "harness");
  for (const f of all) if (!placed.has(f.id)) problems.push(`${f.id} is in no root cause and not rejected`);

  const reviewersOf = (ids: string[]): string => [...new Set(ids.map(reviewerOf))].join(", ");
  const harness = all.filter((f) => placed.get(f.id) === "harness");
  const decided = triage.rootCauses.filter((rc) => rc.decision);
  // process.md: the owner should agree with at least 70% of S1/S2 proposals.
  const serious = decided.filter((rc) => rc.severity === "S1" || rc.severity === "S2");
  const agreed = serious.filter((rc) => rc.decision === rc.proposed).length;
  const markdown = [
    "## Findings and triage",
    "",
    "| # | Sev | Root cause | Component | Raised by | Raw findings | Proposed | Decision |",
    "|---|---|---|---|---|---|---|---|",
    ...triage.rootCauses.map(
      (rc) =>
        `| ${rc.id} | ${rc.severity} | ${cellText(rc.title)} | ${cellText(rc.component)} | ${reviewersOf(rc.findings)} | ${rc.findings.join(", ")} | ${rc.proposed} | ${rc.decision ?? "—"}${rc.note ? `: ${cellText(rc.note)}` : ""} |`,
    ),
    "",
    decided.length === triage.rootCauses.length
      ? `Owner decided every root cause, and agreed with ${agreed} of ${serious.length} S1/S2 proposals.`
      : `${triage.rootCauses.length - decided.length} of ${triage.rootCauses.length} root causes await the owner's decision.`,
    "",
    "### Rejected after the skeptic pass",
    "",
    ...(triage.rejected.length
      ? triage.rejected.map((r) => `- **${r.id}**: ${byId.get(r.id)?.finding ?? "?"} Rejected: ${r.reason} (\`${r.cell}\`)`)
      : ["None."]),
    "",
    "### Harness findings",
    "",
    ...(harness.length ? harness.map((f) => `- **${f.id}** (${f.severity}): ${f.finding}`) : ["None."]),
    "",
  ].join("\n");
  return { markdown, problems };
}

/** The repo a directory sits in: the nearest parent with docs/ui/AUDIT.md. */
function repoOf(dir: string): string | undefined {
  let at = resolve(dir);
  while (at !== dirname(at)) {
    if (existsSync(join(at, "docs/ui/AUDIT.md"))) return at;
    at = dirname(at);
  }
  return undefined;
}

function main(): void {
  const [command, audit, run] = process.argv.slice(2);
  if (!audit || !run || !["check", "render"].includes(command ?? "")) {
    process.stderr.write("usage: consolidate.ts check|render <audit-dir> <capture-run-dir>\n");
    process.exit(2);
  }
  let raw: Map<string, unknown[]>;
  try {
    raw = load(audit);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\nSave each reviewer's answer as <audit>/findings/<name>.json first (SKILL.md step 4).\n`);
    process.exit(1);
  }
  // Fail closed: an unchecked cell or component is not a checked one.
  const cells = cellNames(run);
  const repo = repoOf(audit) ?? repoOf(run);
  const names = repo ? vocabulary(readFileSync(join(repo, "docs/ui/AUDIT.md"), "utf8")) : undefined;
  if (!cells || !repo || !names) {
    if (!cells) process.stderr.write(`no manifest.json in ${run}\n`);
    if (!repo) process.stderr.write(`no docs/ui/AUDIT.md above ${audit}\n`);
    else if (!names) process.stderr.write("docs/ui/AUDIT.md has no Component vocabulary block\n");
    process.exit(1);
  }
  const { problems, warnings, findings } = validate(raw, cells, names, { run, repo });
  for (const w of warnings) process.stdout.write(`! ${w}\n`);
  for (const p of problems) process.stdout.write(`✗ ${p}\n`);
  if (command === "check") {
    // The audit keeps the manifest its reviewers saw; the run is gitignored.
    copyFileSync(join(run, "manifest.json"), join(audit, "manifest.json"));
    const all = [...findings.values()].flat();
    const groups = cluster(all.filter((f) => !isHarness(f)));
    writeFileSync(join(audit, "clusters.md"), clustersMarkdown(groups));
    for (const [r, fs] of raw) process.stdout.write(`${r}: ${fs.length} findings\n`);
    process.stdout.write(`${all.length} well-formed findings, ${groups.length} candidate root causes → ${join(audit, "clusters.md")}\n`);
    process.exit(problems.length ? 1 : 0);
  }
  if (problems.length) {
    process.stdout.write("render refuses findings that don't validate\n");
    process.exit(1);
  }
  const triage = JSON.parse(readFileSync(join(audit, "triage.json"), "utf8")) as Triage;
  const rendered = render(findings, triage, cells);
  writeFileSync(join(audit, "findings.md"), rendered.markdown);
  for (const p of rendered.problems) process.stdout.write(`✗ ${p}\n`);
  process.stdout.write(`→ ${join(audit, "findings.md")}\n`);
  process.exit(rendered.problems.length ? 1 : 0);
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) main();
