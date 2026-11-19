// Builds the site's data from results/ and builds.json:
//
//   site/public/data/index.json          every build, result and comparison (site/src/data/model.ts)
//   site/public/data/results/<id>.json   each result as published, for the result pages
//
// A comparison is one candidate against the reference in the same thread mode, on one metric, in one
// result. Results are trusted here: CI has verified each one with Parallax before it was merged.
//
//   node scripts/build-index.ts [results-dir] [out-dir]

import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { METRICS, type Build, type Comparison, type Index, type Interval, type Kind, type Mode, type ResultSummary } from "../site/src/data/model.ts";

const root = resolve(import.meta.dirname, "..");
const resultsDir = resolve(process.argv[2] ?? join(root, "results"));
const outDir = resolve(process.argv[3] ?? join(root, "site/public/data"));

interface Registry {
  schema: "parallax.builds/1";
  // "reference": true names a build the reference Compare opens on; with several, the first wins.
  builds: { implementation: string; version: string; source: string; binaries: Record<string, string>; reference?: boolean }[];
}

// What a published result holds that the index reads (parallax src/commands/publish.ts).
interface Side {
  label: string;
  role: "ref" | "cand";
  profile: string;
  binSha256: string;
  version: string | null;
  mode?: Mode;
}
interface Published {
  schema: string;
  kind: Kind;
  id: string;
  publishedAt: string;
  finishedAt: string | null;
  machine: { id: string };
  project: { name: string; suite: boolean; commit: string | null };
  harness: { gitCommit: string | null };
  host: { platform: string; arch: string; cpuModel: string; cpus: number };
  sides: Side[];
  notes: string[];
  summary: {
    rounds: { accepted: number };
    confidence?: number;
    settled?: boolean;
    sides: { label: string; wallMs?: Interval | null; cpuMs?: Interval | null; metrics?: Record<string, Interval | null> }[];
    candidates: {
      label: string;
      ref?: string;
      mode?: Mode;
      wallRatio?: Interval | null;
      cpuRatio?: Interval | null;
      call?: Comparison["call"];
      sameWithin?: number;
      metrics?: Record<string, { ratio: Interval | null; call: Comparison["call"]; sameWithin?: number }>;
    }[];
  };
}

// Implementation names by profile, for builds builds.json does not know.
const IMPLEMENTATION: Record<string, string> = { tsc7: "tsc 7", tsrs: "tsrs", "tsc-rs-fork": "tsc-rs fork" };

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

export function buildIndex(results: { file: string; result: Published }[], registry: Registry): Index {
  const named = registry.builds.filter((b) => b.reference === true);
  const known = new Map<string, Registry["builds"][number]>();
  for (const b of registry.builds) for (const sha of Object.keys(b.binaries)) known.set(sha, b);
  const builds = new Map<string, Build>();
  const buildOf = (side: Side): string => {
    const reg = known.get(side.binSha256);
    const key = reg ? `${reg.implementation}@${reg.version}` : `sha:${side.binSha256.slice(0, 12)}`;
    const sha = side.binSha256.slice(0, 16);
    const b = builds.get(key);
    if (b) {
      if (!b.shas.includes(sha)) b.shas.push(sha);
    } else {
      const implementation = reg?.implementation ?? IMPLEMENTATION[side.profile] ?? side.profile;
      builds.set(key, {
        key,
        label: reg ? `${reg.implementation} ${reg.version}` : `${implementation} (${side.binSha256.slice(0, 8)})`,
        implementation,
        version: reg?.version ?? null,
        shas: [sha],
        known: Boolean(reg),
        source: reg?.source ?? null,
        referenceRank: reg && named.includes(reg) ? named.indexOf(reg) : null,
      });
    }
    return key;
  };

  const summaries: ResultSummary[] = [];
  const comparisons: Comparison[] = [];
  for (const { file, result: r } of results) {
    const sideBuild = new Map(r.sides.map((s) => [s.label, buildOf(s)]));
    const refLabel = (c: { ref?: string; mode?: Mode }): string =>
      c.ref ?? r.sides.find((s) => s.role === "ref" && (s.mode ?? "default") === (c.mode ?? "default"))?.label ?? r.sides.find((s) => s.role === "ref")!.label;
    summaries.push({
      id: r.id,
      file,
      kind: r.kind,
      project: r.project.name,
      suite: r.project.suite,
      projectCommit: r.project.commit,
      date: (r.finishedAt ?? r.publishedAt).slice(0, 10),
      machine: { id: r.machine.id.slice(0, 8), platform: r.host.platform, arch: r.host.arch, cpuModel: r.host.cpuModel, cpus: r.host.cpus },
      harnessCommit: r.harness.gitCommit,
      roundsAccepted: r.summary.rounds.accepted,
      confidence: r.summary.confidence ?? null,
      settled: r.summary.settled ?? null,
      notes: r.notes,
      builds: [...new Set(sideBuild.values())],
    });
    const sideSummary = new Map(r.summary.sides.map((s) => [s.label, s]));
    for (const c of r.summary.candidates) {
      const ref = refLabel(c);
      const base = { result: r.id, kind: r.kind, project: r.project.name, mode: c.mode ?? "default", candidate: sideBuild.get(c.label)!, reference: sideBuild.get(ref)! } as const;
      const push = (metric: string, ratio: Interval | null | undefined, call: Comparison["call"], sameWithin: number | undefined, value: (label: string) => number | null): void => {
        if (!ratio) return;
        comparisons.push({ id: `${r.id}:${c.label}:${metric}`, ...base, metric, ratio, call, sameWithin: sameWithin ?? null, candidateValue: value(c.label), referenceValue: value(ref) });
      };
      if (r.kind === "cli-bench") {
        push("cli.wallMs", c.wallRatio, c.call ?? null, c.sameWithin, (l) => sideSummary.get(l)?.wallMs?.estimate ?? null);
        push("cli.cpuMs", c.cpuRatio, null, undefined, (l) => sideSummary.get(l)?.cpuMs?.estimate ?? null);
      } else {
        for (const { key } of METRICS["lsp-bench"]) {
          const m = c.metrics?.[key];
          if (m) push(key, m.ratio, m.call, m.sameWithin, (l) => sideSummary.get(l)?.metrics?.[key]?.estimate ?? null);
        }
      }
    }
  }
  summaries.sort((a, b) => b.date.localeCompare(a.date) || a.project.localeCompare(b.project));
  return {
    schema: "parallax.results-index/1",
    generatedAt: new Date().toISOString(),
    builds: [...builds.values()].sort((a, b) => a.label.localeCompare(b.label)),
    results: summaries,
    comparisons,
  };
}

if (import.meta.main) {
  const registry = JSON.parse(readFileSync(join(root, "builds.json"), "utf8")) as Registry;
  const files = walk(resultsDir).sort();
  const results = files.map((f) => ({ file: relative(root, f).split("\\").join("/"), result: JSON.parse(readFileSync(f, "utf8")) as Published }));
  const index = buildIndex(results, registry);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "results"), { recursive: true });
  writeFileSync(join(outDir, "index.json"), JSON.stringify(index));
  for (const [i, f] of files.entries()) copyFileSync(f, join(outDir, "results", `${results[i]!.result.id}.json`));
  console.log(`index: ${index.results.length} results, ${index.comparisons.length} comparisons, ${index.builds.length} builds -> ${relative(root, outDir)}`);
}
