// The answer first, as a billboard: which candidate stands best against the reference across the
// machines in the selection, read top to bottom (the build, the figure, the reference it is measured
// against, the evidence, then any caveat on its own line), and a race of every candidate's median
// ratio with one pip per machine showing that machine's call.
//
// Honest by construction (src/data/verdict.ts): every machine gets one vote, its newest result, so
// no single run decides the answer; a new contributor's slower run is one pip among the others. The
// big figure speaks plainly ("3.1× as fast") only when most machines make that call and none makes
// another; otherwise it is the median ratio, marked as an estimate, with the tally beside it. When no
// candidate's median beats the reference, the billboard says so.

import { CopyButton } from "../../../CopyButton/CopyButton.tsx";
import { Shape } from "../../../Shape/Shape.tsx";
import { callText, fmtRatio, measureNoun, measureOf, platformName, plainSpeed, type Measure } from "../../../../data/format.ts";
import type { Build, Call, Comparison, MetricInfo, Mode, ResultSummary } from "../../../../data/model.ts";
import { standingOf, type Standing, type Tally } from "../../../../data/verdict.ts";

export interface BillboardProps {
  kind: string;
  project: string;
  metric: MetricInfo;
  reference: string | undefined;
  // Every comparison in the selection in one thread mode, with hidden builds left out.
  comparisons: Comparison[];
  mode: Mode;
  results: Map<string, ResultSummary>;
  builds: Map<string, Build>;
  slots: Map<string, number>;
  scope: { results: number; machines: number };
  // Both thread modes are on screen, and the billboard weighs only the default one.
  bothModes: boolean;
  // References the selection's other results were measured against, kept off screen.
  otherRefs: { key: string; label: string; results: number; machines: number }[];
  onReference: (key: string) => void;
  spot: string | null;
  onSpot: (implementation: string | null) => void;
}

const machines = (n: number): string => `${n} machine${n === 1 ? "" : "s"}`;
const over = (n: number): string => (n === 1 ? "on 1 machine" : `across ${n} machines`);
const CALLS = ["faster", "slower", "same", "unresolved", "too few rounds"] as const;
const PIP: Record<Call | "none", string> = { faster: "▼", slower: "▲", same: "=", unresolved: "?", "too few rounds": "…", none: "•" };

const callWord = (call: Call, measure: Measure): string => (call === "same" ? "the same" : call === "too few rounds" ? "short of rounds" : callText(call, null, measure));

// "faster on 3 and unresolved on 1"
function tallyWords(t: Tally, measure: Measure): string {
  const parts = CALLS.filter((c) => t[c] > 0).map((c) => `${callWord(c, measure)} on ${t[c]}`);
  return parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

// The badge beside the figure: what the machines say together.
function agreementText(s: Standing, measure: Measure): string {
  const n = s.votes.length;
  switch (s.agreement) {
    case "faster":
    case "slower":
    case "same": {
      const word = callWord(s.agreement, measure);
      const k = s.tally[s.agreement];
      return n === 1 ? `${word} · 1 machine` : k === n ? `${word} on all ${n}` : `${word} on ${k} of ${n}`;
    }
    case "mixed":
      return "machines disagree";
    case "unsettled":
      return "not settled";
    default:
      return "no call";
  }
}

// The figure in words: plain only when the machines agree, else the estimate marked "~".
function speedOf(s: Standing, measure: Measure): string {
  if (s.agreement === "faster" || s.agreement === "slower") return plainSpeed(s.median, measure);
  if (s.agreement === "same") return "about the same";
  return `~${plainSpeed(s.median, measure)}`;
}

function figureOf(s: Standing, measure: Measure): { number: string; word: string } {
  if (s.agreement === "faster" || s.agreement === "slower") {
    const words = plainSpeed(s.median, measure);
    const at = words.indexOf(" ");
    return { number: words.slice(0, at), word: words.slice(at + 1) };
  }
  if (s.agreement === "same") return { number: fmtRatio(s.median), word: "about the same" };
  return { number: fmtRatio(s.median), word: `the ${measureNoun(measure)}` };
}

// The word joining the figure to the reference: "as fast as", "8% faster than", "0.93× the time of".
const connectorOf = (word: string): string => (/^(as |about the same)/.test(word) ? "as" : /^the /.test(word) ? "of" : "than");

// What a reader must know before trusting the figure, one short line each.
function caveatsOf(s: Standing, here: number, measure: Measure): string[] {
  const n = s.votes.length;
  const out: string[] = [];
  if (n < here) out.push(`Measured on only ${n} of the ${here} machines here.`);
  if (s.agreement === "mixed") out.push(`The machines disagree (${tallyWords(s.tally, measure)}): the figure is the median, not a call.`);
  if (s.agreement === "unsettled") out.push(`Too few machines settle it (${tallyWords(s.tally, measure)}): the figure is the median, not a call.`);
  if (s.agreement === "uncalled") out.push("Shown for context: this metric gets no call.");
  return out;
}

interface Lane {
  key: string;
  label: string;
  implementation: string;
  slot: number;
  standing: Standing | null;
  ratio: number;
}

export function Billboard(p: BillboardProps) {
  const measure = measureOf(p.metric);
  const refBuild = p.reference ? p.builds.get(p.reference) : undefined;
  const refLabel = refBuild?.label ?? "the reference";

  const byCandidate = new Map<string, Comparison[]>();
  for (const c of p.comparisons) byCandidate.set(c.candidate, [...(byCandidate.get(c.candidate) ?? []), c]);
  const candidates: Lane[] = [...byCandidate.entries()].map(([key, list]) => {
    const b = p.builds.get(key)!;
    const standing = standingOf(list, p.results, p.metric.called);
    return { key, label: b.label, implementation: b.implementation, slot: p.slots.get(b.implementation) ?? 5, standing, ratio: standing.median };
  });
  const byRatio = (a: Lane, b: Lane): number => a.ratio - b.ratio || a.label.localeCompare(b.label);
  candidates.sort(byRatio);
  const leaderLane = candidates[0];
  const leader = leaderLane?.standing ?? null;
  const candidateLeads = leader !== null && leader.median < 1;
  // The reference races at 1×; on a tie it goes first, since no candidate beat it.
  const lanes: Lane[] = refBuild
    ? [...candidates.filter((l) => l.ratio < 1), { key: "reference", label: refBuild.label, implementation: refBuild.implementation, slot: 0, standing: null, ratio: 1 }, ...candidates.filter((l) => l.ratio >= 1)]
    : candidates;
  const max = Math.max(...lanes.map((l) => l.ratio), 1);
  const figure = leader ? figureOf(leader, measure) : null;
  const n = leader?.votes.length ?? 0;
  // Machines with any candidate in this thread mode: a leader measured on fewer says so.
  const here = new Set(p.comparisons.map((c) => p.results.get(c.result)?.machine.id)).size;
  const caveats = leader ? caveatsOf(leader, here, measure) : [];

  return (
    <section className="billboard" aria-labelledby="answer-h">
      <h1 id="answer-h">
        {p.kind} · {p.project} · {p.metric.label}
      </h1>
      {leader && leaderLane && figure ? (
        <div className="verdict">
          {/* Read top to bottom: who, by how much, against what, then the evidence and its caveats. */}
          <div className="headline">
            {candidateLeads ? (
              <>
                <p className="subject" style={{ ["--c" as string]: `var(--series-${leaderLane.slot})` }}>
                  <Shape slot={leaderLane.slot} size={20} />
                  <span className="label">{leaderLane.label}</span>
                </p>
                <p className="big">
                  <span className="figure" aria-hidden="true">
                    {figure.number}
                  </span>
                  <span className="word" aria-hidden="true">
                    {figure.word}
                  </span>
                  <span className="sr-only">
                    {leaderLane.label}: {speedOf(leader, measure)} {connectorOf(figure.word)} {refLabel}, the reference, {over(n)}.
                  </span>
                </p>
                <p className="versus" aria-hidden="true">
                  {connectorOf(figure.word)} <span className="who">{refLabel}</span>, the reference
                </p>
              </>
            ) : (
              <>
                <p className="subject" style={{ ["--c" as string]: "var(--reference)" }}>
                  <span className="label">{refLabel}</span>
                  <span className="tag">reference</span>
                </p>
                <p className="big">
                  <span className="figure wordy">unbeaten</span>
                </p>
                <p className="versus">
                  No candidate beat it on the median. Nearest: <span className="who">{leaderLane.label}</span>, {speedOf(leader, measure)}.
                </p>
              </>
            )}
            <div className="badges">
              <span className="call" data-call={["faster", "slower", "same"].includes(leader.agreement) ? leader.agreement : ""}>
                {agreementText(leader, measure)}
              </span>
              {n > 1 ? (
                <span className="badge">
                  median of {n}, range {fmtRatio(leader.low)}–{fmtRatio(leader.high)}
                </span>
              ) : null}
              <span className="badge">{p.mode === "single" ? "1 thread" : "default threads"}</span>
            </div>
            {caveats.length ? (
              <ul className="caveats">
                {caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <ol className="race" aria-label={`Every build, ${p.metric.label}, median ratio across machines, lowest first`}>
            {lanes.map((l, i) => {
              const reference = l.standing === null;
              const s = l.standing;
              return (
                <li
                  key={l.key}
                  className={[reference ? "reference" : "", i === 0 ? "lowest" : ""].join(" ").trim() || undefined}
                  style={{ ["--c" as string]: reference ? "var(--reference)" : `var(--series-${l.slot})` }}
                  data-dim={p.spot !== null && p.spot !== l.implementation}
                  onMouseEnter={() => p.onSpot(l.implementation)}
                  onMouseLeave={() => p.onSpot(null)}
                >
                  <span className="name">
                    {reference ? null : <Shape slot={l.slot} />}
                    <span title={l.label}>{l.label}</span>
                    {reference ? <span className="tag">reference</span> : null}
                    {i === 0 ? <span className="tag lowest-tag">leads</span> : null}
                  </span>
                  <span className="value">
                    {fmtRatio(l.ratio)}
                    <span className="unit">{reference ? "" : " median"}</span>
                  </span>
                  <span className="track" aria-hidden="true">
                    <span className="bar" style={{ width: `${Math.max(2, (l.ratio / max) * 100)}%`, animationDelay: `${i * 70}ms` }} />
                  </span>
                  {s ? (
                    <>
                      <span className="pips" aria-hidden="true">
                        {s.votes.map((v) => {
                          const call = p.metric.called ? (v.comparison.call ?? "none") : "none";
                          const words = call === "none" ? "no call" : callText(call, v.comparison.sameWithin, measure);
                          return (
                            <span
                              key={v.result.machine.id}
                              className="pip"
                              data-call={call}
                              title={`${platformName(v.result.machine.platform)} · ${v.result.machine.cpuModel} · ${v.result.date}: ${words}, ${fmtRatio(v.comparison.ratio.estimate)}`}
                            >
                              {PIP[call]}
                            </span>
                          );
                        })}
                      </span>
                      <span className="sr-only">
                        , across {machines(s.votes.length)}
                        {p.metric.called ? `: ${tallyWords(s.tally, measure)}` : ""}
                      </span>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <p className="sentence">Nothing to race in this selection: every build in it is hidden. Switch one back on below.</p>
      )}
      {p.otherRefs.length ? (
        <ul className="caveats other-refs" aria-label="Results against other references">
          {p.otherRefs.map((o) => (
            <li key={o.key}>
              <span>
                Also published against <span className="who">{o.label}</span>: {o.results} result{o.results === 1 ? "" : "s"} from {machines(o.machines)}, not
                counted here.
              </span>{" "}
              <button type="button" className="btn small" onClick={() => p.onReference(o.key)}>
                Show those
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="hero-foot">
        <span>
          {p.metric.called
            ? `${PIP.faster} ${callText("faster", null, measure)}  ${PIP.slower} ${callText("slower", null, measure)}  ${PIP.same} same  ${PIP.unresolved} unresolved: one pip per machine, its newest result. `
            : "Each machine counts once, by its newest result. "}
          {p.bothModes ? "Default threads here; 1-thread runs are in the spread. " : ""}
          {p.scope.results} result{p.scope.results === 1 ? "" : "s"} from {machines(p.scope.machines)} in the spread below.
        </span>
        <span className="spacer" />
        <CopyButton className="btn small primary" label="Copy link" text={() => window.location.href} />
      </div>
    </section>
  );
}
