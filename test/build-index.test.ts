// The index the site reads: builds named from builds.json (or by hash), one comparison per candidate,
// metric and result, each against the reference in its own thread mode.

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIndex } from "../scripts/build-index.ts";

const interval = (estimate: number) => ({ estimate, low: estimate * 0.95, high: estimate * 1.05, confidence: 0.96875, n: 6 });
const SHA = { ref: "a".repeat(64), cand: "b".repeat(64), unknown: "c".repeat(64) };

const cli = {
  schema: "parallax.result/1",
  kind: "cli-bench" as const,
  id: "1111111111111111",
  publishedAt: "2026-11-17T00:00:00Z",
  finishedAt: "2026-11-17T00:00:00Z",
  machine: { id: "abcdef12-0000" },
  project: { name: "hono", suite: true, commit: "x" },
  harness: { gitCommit: "y" },
  host: { platform: "linux", arch: "x64", cpuModel: "CPU", cpus: 8 },
  notes: [],
  sides: [
    { label: "ref", role: "ref" as const, profile: "tsc7", binSha256: SHA.ref, version: "Version 7.0.2", mode: "default" as const },
    { label: "cand", role: "cand" as const, profile: "tsrs", binSha256: SHA.cand, version: "v", mode: "default" as const },
    { label: "ref@1t", role: "ref" as const, profile: "tsc7", binSha256: SHA.ref, version: "Version 7.0.2", mode: "single" as const },
    { label: "cand@1t", role: "cand" as const, profile: "tsrs", binSha256: SHA.cand, version: "v", mode: "single" as const },
    { label: "other", role: "cand" as const, profile: "tsc-rs-fork", binSha256: SHA.unknown, version: "v", mode: "default" as const },
  ],
  summary: {
    rounds: { accepted: 6 },
    confidence: 0.95,
    settled: true,
    sides: [
      { label: "ref", wallMs: interval(300), cpuMs: interval(1200) },
      { label: "cand", wallMs: interval(100), cpuMs: interval(400) },
      { label: "ref@1t", wallMs: interval(500) },
      { label: "cand@1t", wallMs: interval(150) },
      { label: "other", wallMs: interval(120) },
    ],
    candidates: [
      { label: "cand", ref: "ref", mode: "default" as const, wallRatio: interval(0.33), cpuRatio: interval(0.33), call: "faster" as const, sameWithin: 0.05 },
      { label: "cand@1t", ref: "ref@1t", mode: "single" as const, wallRatio: interval(0.3), cpuRatio: null, call: "faster" as const, sameWithin: 0.05 },
      { label: "other", ref: "ref", mode: "default" as const, wallRatio: interval(1.0), cpuRatio: null, call: "same" as const, sameWithin: 0.05 },
    ],
  },
};

const registry = {
  schema: "parallax.builds/1" as const,
  builds: [
    { implementation: "tsc 7", version: "7.0.2", source: "npm", binaries: { [SHA.ref]: "linux-x64" } },
    { implementation: "tsrs", version: "0.25.0", source: "npm", binaries: { [SHA.cand]: "linux-x64" } },
  ],
};

test("builds: registered ones by name, others by hash and implementation", () => {
  const index = buildIndex([{ file: "results/cli-bench/hono/x.json", result: cli }], registry);
  const labels = index.builds.map((b) => b.label).sort();
  assert.deepEqual(labels, ["tsc 7 7.0.2", "tsc-rs fork (cccccccc)", "tsrs 0.25.0"]);
  assert.equal(index.builds.find((b) => b.key === "sha:cccccccccccc")?.known, false);
});

test("comparisons: per candidate and metric, against the same-mode reference, with both sides' figures", () => {
  const index = buildIndex([{ file: "results/cli-bench/hono/x.json", result: cli }], registry);
  const wall = index.comparisons.filter((c) => c.metric === "cli.wallMs");
  assert.equal(wall.length, 3);
  const single = wall.find((c) => c.mode === "single")!;
  assert.equal(single.reference, "tsc 7@7.0.2");
  assert.equal(single.referenceValue, 500, "the single-threaded reference's figure");
  assert.equal(single.candidateValue, 150);
  assert.equal(index.comparisons.filter((c) => c.metric === "cli.cpuMs").length, 1, "CPU only where measured");
  assert.equal(index.comparisons.find((c) => c.metric === "cli.cpuMs")!.call, null, "CPU gets no call");
  assert.equal(new Set(index.comparisons.map((c) => c.id)).size, index.comparisons.length, "ids are unique");
  assert.equal(index.results[0]!.machine.id, "abcdef12");
});

test("builds: builds.json can name references, in its own order", () => {
  const named = {
    ...registry,
    builds: [
      { ...registry.builds[1]!, reference: true },
      { ...registry.builds[0]!, reference: true },
    ],
  };
  const index = buildIndex([{ file: "results/cli-bench/hono/x.json", result: cli }], named);
  const rank = (key: string) => index.builds.find((b) => b.key === key)?.referenceRank;
  assert.equal(rank("tsrs@0.25.0"), 0);
  assert.equal(rank("tsc 7@7.0.2"), 1);
  assert.equal(rank("sha:cccccccccccc"), null, "an unregistered build is never named");
  assert.equal(buildIndex([{ file: "x.json", result: cli }], registry).builds.every((b) => b.referenceRank === null), true, "none named by default");
});
