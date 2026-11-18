// Verifies every result in results/ with the Parallax commit that made it: each distinct harness
// commit is fetched once (a shallow clone of THEtheChad/parallax at exactly that commit), and its
// `parallax verify-result` checks that the result is unedited and that its summary is what its
// records give. Also checks what the site relies on: the file's place (<kind>/<project>/), its
// schema, and that every result has a harness commit.
//
//   node scripts/verify-results.ts [results-dir]
//
// PARALLAX_REPO overrides the harness repository (a local path or URL).

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const resultsDir = resolve(process.argv[2] ?? join(root, "results"));
const repo = process.env.PARALLAX_REPO ?? "https://github.com/THEtheChad/parallax.git";
const cache = join(root, ".verify");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : n.endsWith(".json") ? [p] : [];
  });
}

const problems: string[] = [];
const byCommit = new Map<string, string[]>();
const files = walk(resultsDir).sort();
for (const f of files) {
  const rel = relative(resultsDir, f).split(sep);
  let r: { schema?: string; kind?: string; project?: { name?: string }; harness?: { gitCommit?: string | null } };
  try {
    r = JSON.parse(readFileSync(f, "utf8"));
  } catch (e) {
    problems.push(`${relative(root, f)}: not JSON (${(e as Error).message})`);
    continue;
  }
  if (r.schema !== "parallax.result/1") problems.push(`${relative(root, f)}: schema ${JSON.stringify(r.schema)}, want "parallax.result/1"`);
  if (rel.length !== 3 || rel[0] !== r.kind || rel[1] !== r.project?.name) problems.push(`${relative(root, f)}: belongs in results/${r.kind}/${r.project?.name}/`);
  const commit = r.harness?.gitCommit;
  if (!commit || !/^[0-9a-f]{40}$/.test(commit)) {
    problems.push(`${relative(root, f)}: no harness commit, so no one can recompute its summary`);
    continue;
  }
  byCommit.set(commit, [...(byCommit.get(commit) ?? []), f]);
}

for (const [commit, list] of byCommit) {
  const dir = join(cache, commit);
  if (!existsSync(join(dir, "src/cli.ts"))) {
    mkdirSync(dir, { recursive: true });
    const git = (args: string[]): void => void execFileSync("git", args, { cwd: dir, stdio: "inherit" });
    git(["init", "-q"]);
    git(["fetch", "-q", "--depth", "1", repo, commit]);
    git(["-c", "advice.detachedHead=false", "checkout", "-q", "FETCH_HEAD"]);
  }
  const r = spawnSync(process.execPath, ["src/cli.ts", "verify-result", ...list], { cwd: dir, encoding: "utf8" });
  process.stdout.write(r.stdout);
  if (r.status !== 0) problems.push(`harness ${commit.slice(0, 12)}: ${r.status === 1 ? "results failed verification (above)" : `verify-result exited ${r.status}: ${r.stderr.slice(0, 500)}`}`);
}

console.log(`${files.length} results, ${byCommit.size} harness commits`);
if (problems.length) {
  console.error(`\n${problems.length} problems:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
