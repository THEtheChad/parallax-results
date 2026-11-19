// The verdict across machines: how a candidate stands against the reference when every machine in
// the selection gets one vote. A machine votes with its newest result, so no one result outranks the
// others: a new contributor's slower run, or a re-run on an odd day, is one voice among the machines,
// never the answer on its own. Machines are never averaged into one figure; the median only orders
// candidates and names a typical ratio, and the tally of calls carries the evidence.

import type { Build, Call, Comparison, ResultSummary } from "./model.ts";

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

// How widely a reference was measured against in a selection: its results and their machines.
export function referenceCoverage(comparisons: Comparison[], results: Map<string, ResultSummary>, reference: string): { results: number; machines: number; newest: string } {
  const rs = [...new Set(comparisons.filter((c) => c.reference === reference).map((c) => c.result))].flatMap((id) => results.get(id) ?? []);
  return { results: rs.length, machines: new Set(rs.map((r) => r.machine.id)).size, newest: rs.reduce((d, r) => (r.date > d ? r.date : d), "") };
}

// The reference a selection opens on. The first build builds.json names a reference, when the
// selection has one: the owner's choice. Otherwise the reference measured on the most machines (then
// the most results, then the newest), so one contributor's repeat runs against another build cannot
// take the page over.
export function defaultReference(comparisons: Comparison[], builds: Map<string, Build>, results: Map<string, ResultSummary>): string | undefined {
  const refs = [...new Set(comparisons.map((c) => c.reference))];
  const rank = (r: string): number | null => builds.get(r)?.referenceRank ?? null;
  const named = refs.filter((r) => rank(r) !== null).sort((a, b) => rank(a)! - rank(b)!);
  if (named[0] !== undefined) return named[0];
  return refs
    .map((r) => ({ r, ...referenceCoverage(comparisons, results, r) }))
    .sort((a, b) => b.machines - a.machines || b.results - a.results || b.newest.localeCompare(a.newest) || a.r.localeCompare(b.r))[0]?.r;
}
