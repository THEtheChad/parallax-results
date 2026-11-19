// The answer first, as a billboard: the selection's lowest observed figure in one result, how the
// nearest candidate relates to the reference in words a visitor uses, and a race of every side in
// that result. Only sides measured in the same rounds on the same machine race each other; the
// spread across machines is the chart below.
//
// Honest by construction: "lowest observed" is the lowest absolute figure among every side shown,
// the reference included, never "fastest". The big figure speaks plainly ("3.1× as fast") only when
// the call is settled; otherwise it is the estimated ratio, with the call beside it.

import { Link } from "@tanstack/react-router";
import { callText, fmtPercent, fmtRatio, fmtValue, measureNoun, measureOf, platformName, plainSpeed, speedText, type Measure } from "../../../../data/format.ts";
import type { Build, Comparison, MetricInfo, Mode, ResultSummary } from "../../../../data/model.ts";
import { CopyButton } from "../../../CopyButton/CopyButton.tsx";
import { Shape } from "../../../Shape/Shape.tsx";

export interface BillboardProps {
  kind: string;
  project: string;
  metric: MetricInfo;
  reference: string | undefined;
  // The comparisons of the raced result, in one thread mode, with hidden builds left out.
  comparisons: Comparison[];
  mode: Mode;
  run: ResultSummary;
  runs: ResultSummary[];
  onRun: (id: string) => void;
  builds: Map<string, Build>;
  slots: Map<string, number>;
  scope: { results: number; machines: number };
  // Both thread modes are on screen, and the billboard races only the default one.
  bothModes: boolean;
  spot: string | null;
  onSpot: (implementation: string | null) => void;
}

// "109 ms" with its unit dimmer than the number.
function Figure({ text }: { text: string }) {
  const at = text.lastIndexOf(" ");
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="unit">{text.slice(at)}</span>
    </>
  );
}

// The call in a sentence, as Parallax decides it (docs/measurement.md).
function callSentence(c: Comparison, measure: Measure, called: boolean): string {
  const conf = `${fmtPercent(c.ratio.confidence)} interval over ${c.ratio.n} rounds`;
  if (!called) return `This metric is shown for context and gets no call (${conf}).`;
  const word = callText(c.call, c.sameWithin, measure);
  switch (c.call) {
    case "faster":
      return `${word[0]!.toUpperCase()}${word.slice(1)} than the reference: the ${conf} lies wholly below 1×, and the estimate is at least 1% under it.`;
    case "slower":
      return `${word[0]!.toUpperCase()}${word.slice(1)} than the reference: the ${conf} lies wholly above 1×, and the estimate is at least 1% over it.`;
    case "same":
      return `The same as the reference, ${word}: the ${conf} lies wholly within that band around 1×.`;
    case "unresolved":
      return `Unresolved: the ${conf} neither clears 1× nor fits within the resolution. More rounds would tell.`;
    case "too few rounds":
      return "Too few rounds: the interval cannot reach the confidence a call needs.";
    default:
      return `No call (${conf}).`;
  }
}

// The big figure: plain words for a settled call, else the estimated ratio.
function figureOf(c: Comparison, measure: Measure, called: boolean): { number: string; word: string } {
  const r = c.ratio.estimate;
  if (called && (c.call === "faster" || c.call === "slower")) {
    const words = plainSpeed(r, measure);
    const at = words.indexOf(" ");
    return { number: words.slice(0, at), word: words.slice(at + 1) };
  }
  return { number: fmtRatio(r), word: `the ${measureNoun(measure)}` };
}

export function Billboard(p: BillboardProps) {
  const unit = p.metric.unit;
  const measure = measureOf(p.metric);
  const refBuild = p.reference ? p.builds.get(p.reference) : undefined;
  const refValue = p.comparisons.find((c) => c.referenceValue !== null)?.referenceValue ?? null;
  const machine = `${platformName(p.run.machine.platform)} · ${p.run.machine.cpuModel.replace(/\s+\d+-Core Processor$/, "")}`;

  // Every side of the run, reference included, as a race: lower is better, by each side's own figure.
  const lanes = [
    ...p.comparisons.map((c) => {
      const b = p.builds.get(c.candidate)!;
      return { key: c.id, label: b.label, implementation: b.implementation, slot: p.slots.get(b.implementation) ?? 5, value: c.candidateValue, ratio: c.ratio.estimate, comparison: c as Comparison | null };
    }),
    ...(refBuild ? [{ key: "reference", label: refBuild.label, implementation: refBuild.implementation, slot: 0, value: refValue, ratio: 1, comparison: null as Comparison | null }] : []),
  ].sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));
  const max = Math.max(...lanes.map((l) => l.value ?? 0), 1);
  const lowestLane = lanes[0];
  // The candidate the headline is about: the lowest candidate figure (the reference may beat it).
  const nearest = lanes.find((l) => l.comparison)?.comparison ?? null;
  const referenceWins = lowestLane !== undefined && lowestLane.comparison === null;
  const figure = nearest ? figureOf(nearest, measure, p.metric.called) : null;
  const callWord = nearest ? (p.metric.called ? callText(nearest.call, nearest.sameWithin, measure) : "no call") : "";

  return (
    <section className="billboard" aria-labelledby="answer-h">
      <h1 id="answer-h">
        {p.kind} · {p.project} · {p.metric.label}
      </h1>
      {nearest && figure ? (
        <div className="verdict">
          <div className="headline">
            <p className="big">
              <span className="figure" aria-hidden="true">
                {figure.number}
              </span>
              <span className="word" aria-hidden="true">
                {figure.word}
              </span>
              <span className="call" data-call={p.metric.called ? (nearest.call ?? "") : ""}>
                {callWord}
              </span>
            </p>
            <p className="sentence">
              {referenceWins ? (
                <>
                  The reference, <span className="who">{refBuild?.label}</span>, had the lowest observed {p.metric.label} in this run:{" "}
                  <strong>
                    <Figure text={fmtValue(refValue, unit)} />
                  </strong>
                  . The nearest candidate, <span className="who">{p.builds.get(nearest.candidate)!.label}</span>, took{" "}
                  <strong>
                    <Figure text={fmtValue(nearest.candidateValue, unit)} />
                  </strong>
                  : {speedText(nearest.ratio.estimate, measure, p.metric.called ? nearest.call : null)}.{" "}
                </>
              ) : (
                <>
                  <span className="who">{p.builds.get(nearest.candidate)!.label}</span> had the lowest observed {p.metric.label} in this run:{" "}
                  <strong>
                    <Figure text={fmtValue(nearest.candidateValue, unit)} />
                  </strong>{" "}
                  against {refBuild?.label ?? "the reference"}'s{" "}
                  <strong>
                    <Figure text={fmtValue(refValue, unit)} />
                  </strong>
                  , {speedText(nearest.ratio.estimate, measure, p.metric.called ? nearest.call : null)}.{" "}
                </>
              )}
              {callSentence(nearest, measure, p.metric.called)}
            </p>
            <div className="badges">
              <span className="badge">
                ratio {fmtRatio(nearest.ratio.estimate)}, interval {fmtRatio(nearest.ratio.low)}–{fmtRatio(nearest.ratio.high)}
              </span>
              <span className="badge">{p.mode === "single" ? "1 thread" : "default threads"}</span>
              <span className="badge">{machine}</span>
              <span className="badge">{p.run.date}</span>
            </div>
          </div>
          <ol className="race" aria-label={`Every side of this run, ${p.metric.label}, lowest first`}>
            {lanes.map((l, i) => {
              const isLowest = i === 0 && l.value !== null;
              const reference = l.comparison === null;
              return (
                <li
                  key={l.key}
                  className={[reference ? "reference" : "", isLowest ? "lowest" : ""].join(" ").trim() || undefined}
                  style={{ ["--c" as string]: reference ? "var(--reference)" : `var(--series-${l.slot})` }}
                  data-dim={p.spot !== null && p.spot !== l.implementation}
                  onMouseEnter={() => p.onSpot(l.implementation)}
                  onMouseLeave={() => p.onSpot(null)}
                >
                  <span className="name">
                    {reference ? null : <Shape slot={l.slot} />}
                    <span title={l.label}>{l.label}</span>
                    {reference ? <span className="tag">reference</span> : null}
                    {isLowest ? <span className="tag lowest-tag">lowest</span> : null}
                  </span>
                  <span className="value">
                    <Figure text={fmtValue(l.value, unit)} />
                    {reference ? null : <span className="unit"> · {fmtRatio(l.ratio)}</span>}
                  </span>
                  <span className="track" aria-hidden="true">
                    <span className="bar" style={{ width: `${Math.max(2, ((l.value ?? 0) / max) * 100)}%`, animationDelay: `${i * 70}ms` }} />
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <p className="sentence">Nothing to race in this selection: every build in it is hidden. Switch one back on below.</p>
      )}
      {p.runs.length > 1 ? (
        <div className="run-picker" role="group" aria-label="Run raced above">
          <span className="field-label">Race from</span>
          {p.runs.map((r) => (
            <button key={r.id} type="button" className="btn small" aria-pressed={r.id === p.run.id} onClick={() => p.onRun(r.id)}>
              {platformName(r.machine.platform)} · {r.date}
            </button>
          ))}
        </div>
      ) : null}
      <div className="hero-foot">
        <span>
          One run, every side in the same rounds on the same machine{p.bothModes ? ", default threads (the 1-thread runs are in the spread below)" : ""}.
          Across the selection: {p.scope.results} result{p.scope.results === 1 ? "" : "s"} from {p.scope.machines} machine
          {p.scope.machines === 1 ? "" : "s"}, below.
        </span>
        <span className="spacer" />
        {nearest ? (
          <Link className="btn small" to="/result/$id" params={{ id: p.run.id }}>
            Open this result →
          </Link>
        ) : null}
        <CopyButton className="btn small primary" label="Copy link" text={() => window.location.href} />
      </div>
    </section>
  );
}
