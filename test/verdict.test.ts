// The verdict across machines: one vote per machine (its newest result), and a call only when most
// machines agree and none disagree.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Call, Comparison, ResultSummary } from "../site/src/data/model.ts";
import { agreementOf, machineMedian, machineVotes, standingOf, type Tally } from "../site/src/data/verdict.ts";

const result = (id: string, machine: string, date: string): ResultSummary => ({
  id,
  file: `results/${id}.json`,
  kind: "cli-bench",
  project: "app",
  suite: true,
  projectCommit: null,
  date,
  machine: { id: machine, platform: "linux", arch: "x64", cpuModel: "CPU", cpus: 8 },
  harnessCommit: null,
  roundsAccepted: 6,
  confidence: 0.95,
  settled: true,
  notes: [],
  builds: ["ref", "cand"],
});

const comparison = (r: ResultSummary, estimate: number, call: Call | null): Comparison => ({
  id: `${r.id}:cand`,
  result: r.id,
  kind: "cli-bench",
  project: "app",
  metric: "cli.wallMs",
  mode: "default",
  candidate: "cand",
  reference: "ref",
  ratio: { estimate, low: estimate * 0.95, high: estimate * 1.05, confidence: 0.95, n: 6 },
  call,
  sameWithin: 0.05,
  candidateValue: 100 * estimate,
  referenceValue: 100,
});

const tally = (t: Partial<Tally>): Tally => ({ faster: 0, slower: 0, same: 0, unresolved: 0, "too few rounds": 0, none: 0, ...t });

test("a newer result on a new machine does not override the others", () => {
  const rs = [result("a", "m1", "2026-01-01"), result("b", "m2", "2026-01-02"), result("c", "m3", "2026-01-03"), result("d", "m4", "2026-01-09")];
  const cs = [comparison(rs[0]!, 0.3, "faster"), comparison(rs[1]!, 0.32, "faster"), comparison(rs[2]!, 0.35, "faster"), comparison(rs[3]!, 1.1, "slower")];
  const s = standingOf(cs, new Map(rs.map((r) => [r.id, r])), true);
  assert.equal(s.votes.length, 4);
  assert.equal(s.votes[0]!.result.id, "d");
  assert.equal(s.median, (0.32 + 0.35) / 2);
  assert.deepEqual([s.low, s.high], [0.3, 1.1]);
  assert.equal(s.tally.faster, 3);
  assert.equal(s.tally.slower, 1);
  // Settled calls disagree: no plain claim, whichever result is newest.
  assert.equal(s.agreement, "mixed");
});

test("a machine votes once, with its newest result", () => {
  const rs = [result("a", "m1", "2026-01-01"), result("b", "m1", "2026-01-05"), result("c", "m1", "2026-01-03"), result("d", "m2", "2026-01-02")];
  const cs = [comparison(rs[0]!, 0.9, "unresolved"), comparison(rs[1]!, 0.5, "faster"), comparison(rs[2]!, 0.7, "faster"), comparison(rs[3]!, 0.6, "faster")];
  const results = new Map(rs.map((r) => [r.id, r]));
  assert.deepEqual(
    machineVotes(cs, results).map((v) => v.result.id),
    ["b", "d"],
  );
  // Repeat runs on one machine do not outweigh another machine.
  assert.equal(machineMedian(cs, results), 0.55);
});

test("a call needs a majority of machines and no settled disagreement", () => {
  assert.equal(agreementOf(tally({ faster: 3 }), true), "faster");
  assert.equal(agreementOf(tally({ faster: 2, unresolved: 1 }), true), "faster");
  assert.equal(agreementOf(tally({ faster: 1, unresolved: 1 }), true), "unsettled");
  assert.equal(agreementOf(tally({ faster: 1, "too few rounds": 2 }), true), "unsettled");
  assert.equal(agreementOf(tally({ slower: 2 }), true), "slower");
  assert.equal(agreementOf(tally({ same: 2, unresolved: 1 }), true), "same");
  assert.equal(agreementOf(tally({ faster: 4, same: 1 }), true), "mixed");
  assert.equal(agreementOf(tally({ faster: 4, slower: 1 }), true), "mixed");
  assert.equal(agreementOf(tally({ none: 3 }), false), "uncalled");
});
