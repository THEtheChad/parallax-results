// The verdict across machines: how a candidate stands against the reference when every machine in
// the selection gets one vote. A machine votes with its newest result, so no one result outranks the
// others: a new contributor's slower run, or a re-run on an odd day, is one voice among the machines,
// never the answer on its own. Machines are never averaged into one figure; the median only orders
// candidates and names a typical ratio, and the tally of calls carries the evidence.

import type { Call, Comparison, ResultSummary } from "./model.ts";

export interface Vote {
  comparison: Comparison;
  result: ResultSummary;
}

export type Tally = Record<Call | "none", number>;

// What the machines say together. A direction (or "same") needs a majority of machines making that
// call and none making another settled one; unresolved and too-few-rounds machines abstain.
// "mixed" means settled calls disagree; "unsettled" means too few machines settle it; "uncalled" is a
// metric shown for context only.
export type Agreement = "faster" | "slower" | "same" | "mixed" | "unsettled" | "uncalled";

export interface Standing {
  votes: Vote[];
  median: number;
  // The lowest and highest machine's estimate.
  low: number;
  high: number;
  tally: Tally;
  agreement: Agreement;
}

const newer = (a: ResultSummary, b: ResultSummary): boolean => a.date > b.date || (a.date === b.date && a.id > b.id);

// One comparison per machine: its newest result's. Newest machine first.
export function machineVotes(comparisons: Comparison[], results: Map<string, ResultSummary>): Vote[] {
  const byMachine = new Map<string, Vote>();
  for (const comparison of comparisons) {
    const result = results.get(comparison.result);
    if (!result) continue;
    const prev = byMachine.get(result.machine.id);
    if (!prev || newer(result, prev.result)) byMachine.set(result.machine.id, { comparison, result });
  }
  return [...byMachine.values()].sort((a, b) => (newer(a.result, b.result) ? -1 : newer(b.result, a.result) ? 1 : 0));
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? NaN : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

// The median ratio over machines, one vote each: the order of the chart's rows and the billboard's lanes.
export const machineMedian = (comparisons: Comparison[], results: Map<string, ResultSummary>): number =>
  median(machineVotes(comparisons, results).map((v) => v.comparison.ratio.estimate));

export function agreementOf(tally: Tally, called: boolean): Agreement {
  if (!called) return "uncalled";
  const n = Object.values(tally).reduce((a, b) => a + b, 0);
  const settled = (["faster", "slower", "same"] as const).filter((c) => tally[c] > 0);
  if (settled.length > 1) return "mixed";
  const only = settled[0];
  if (only && tally[only] > n / 2) return only;
  return "unsettled";
}

// How one candidate (all its comparisons in the selection, one thread mode) stands across machines.
export function standingOf(comparisons: Comparison[], results: Map<string, ResultSummary>, called: boolean): Standing {
  const votes = machineVotes(comparisons, results);
  const estimates = votes.map((v) => v.comparison.ratio.estimate);
  const tally: Tally = { faster: 0, slower: 0, same: 0, unresolved: 0, "too few rounds": 0, none: 0 };
  for (const v of votes) tally[called ? (v.comparison.call ?? "none") : "none"] += 1;
  return {
    votes,
    median: median(estimates),
    low: Math.min(...estimates),
    high: Math.max(...estimates),
    tally,
    agreement: agreementOf(tally, called),
  };
}
