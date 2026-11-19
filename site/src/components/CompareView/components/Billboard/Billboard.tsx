// The answer first, as a billboard: the selection's lowest observed figure in one result, how it
// relates to the reference in words a visitor uses, and a race of every side in that result. Only
// sides measured in the same rounds on the same machine race each other; the spread across machines
// is the chart below. It says "lowest observed", not "fastest": racing one result against a shared
// reference does not establish that one candidate beats another.

import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { fmtPercent, fmtRatio, fmtValue, platformName, speedText } from "../../../../data/format.ts";
import type { Build, Comparison, MetricInfo, Mode, ResultSummary } from "../../../../data/model.ts";
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

function callSentence(c: Comparison): string {
  const conf = `${fmtPercent(c.ratio.confidence)} interval over ${c.ratio.n} rounds`;
  switch (c.call) {
    case "faster":
      return `Faster than the reference: the ${conf} clears its resolution.`;
    case "slower":
      return `Slower than the reference: the ${conf} clears its resolution.`;
    case "same":
      return `The same as the reference within ±${Math.round((c.sameWithin ?? 0) * 100)}% (${conf}).`;
    case "unresolved":
      return `Unresolved: the ${conf} straddles the edge of the resolution, so this run can't call it.`;
    case "too few rounds":
      return "Too few rounds to call it.";
    default:
      return `This metric gets no call; ${conf}.`;
  }
}

export function Billboard(p: BillboardProps) {
  const [copied, setCopied] = useState(false);
  const unit = p.metric.unit;
  const sorted = [...p.comparisons].sort((a, b) => a.ratio.estimate - b.ratio.estimate);
  const lowest = sorted[0];
  const refBuild = p.reference ? p.builds.get(p.reference) : undefined;
  const refValue = p.comparisons.find((c) => c.referenceValue !== null)?.referenceValue ?? null;
  const machine = `${platformName(p.run.machine.platform)} · ${p.run.machine.cpuModel.replace(/\s+\d+-Core Processor$/, "")}`;

  // Every side of the run, reference included, as a race: lower is better.
  const lanes = [
    ...p.comparisons.map((c) => {
      const b = p.builds.get(c.candidate)!;
      return { key: c.id, label: b.label, implementation: b.implementation, slot: p.slots.get(b.implementation) ?? 5, value: c.candidateValue, ratio: c.ratio.estimate, reference: false };
    }),
    ...(refBuild ? [{ key: "reference", label: refBuild.label, implementation: refBuild.implementation, slot: 0, value: refValue, ratio: 1, reference: true }] : []),
  ].sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));
  const max = Math.max(...lanes.map((l) => l.value ?? 0), 1);

  const figure = !lowest
    ? null
    : unit === "bytes" || lowest.ratio.estimate >= 1
      ? { number: fmtRatio(lowest.ratio.estimate), word: unit === "bytes" ? "the memory" : "the time" }
      : { number: `${(1 / lowest.ratio.estimate).toFixed(1)}×`, word: "as fast" };

  return (
    <section className="billboard" aria-labelledby="answer-h">
      <h1 id="answer-h">
        {p.kind} · {p.project} · {p.metric.label}
      </h1>
      {lowest && figure ? (
        <div className="verdict">
          <div className="headline">
            <p className="big" aria-hidden="true">
              <span className="figure">{figure.number}</span>
              <span className="word">{figure.word}</span>
            </p>
            <p className="sentence">
              <span className="who">{p.builds.get(lowest.candidate)!.label}</span> had the lowest observed {p.metric.label} in this run:{" "}
              <strong>
                <Figure text={fmtValue(lowest.candidateValue, unit)} />
              </strong>{" "}
              against {refBuild?.label ?? "the reference"}'s{" "}
              <strong>
                <Figure text={fmtValue(refValue, unit)} />
              </strong>
              , {speedText(lowest.ratio.estimate, unit)}. {callSentence(lowest)}
            </p>
            <div className="badges">
              <span className="badge">
                interval {fmtRatio(lowest.ratio.low)}–{fmtRatio(lowest.ratio.high)}
              </span>
              <span className="badge">{p.mode === "single" ? "1 thread" : "default threads"}</span>
              <span className="badge">{machine}</span>
              <span className="badge">{p.run.date}</span>
            </div>
          </div>
          <ol className="race" aria-label={`Every side of this run, ${p.metric.label}, lowest first`}>
            {lanes.map((l, i) => {
              const isLowest = !l.reference && i === lanes.findIndex((x) => !x.reference);
              return (
                <li
                  key={l.key}
                  className={l.reference ? "reference" : isLowest ? "lowest" : undefined}
                  style={{ ["--c" as string]: l.reference ? "var(--reference)" : `var(--series-${l.slot})` }}
                  tabIndex={0}
                  data-dim={p.spot !== null && p.spot !== l.implementation}
                  onMouseEnter={() => p.onSpot(l.implementation)}
                  onMouseLeave={() => p.onSpot(null)}
                  onFocus={() => p.onSpot(l.implementation)}
                  onBlur={() => p.onSpot(null)}
                >
                  <span className="name">
                    {l.reference ? null : <Shape slot={l.slot} />}
                    <span>{l.label}</span>
                    {l.reference ? <span className="tag">reference</span> : isLowest ? <span className="tag">lowest</span> : null}
                  </span>
                  <span className="value">
                    <Figure text={fmtValue(l.value, unit)} />
                    {l.reference ? null : <span className="unit"> · {fmtRatio(l.ratio)}</span>}
                  </span>
                  <span className="track" aria-hidden="true">
                    <span className="bar" style={{ width: `${Math.max(2, ((l.value ?? 0) / max) * 100)}%`, animationDelay: `${i * 90}ms` }} />
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
          One run, every side in the same rounds on the same machine. Across the selection: {p.scope.results} result
          {p.scope.results === 1 ? "" : "s"} from {p.scope.machines} machine{p.scope.machines === 1 ? "" : "s"}, below.
        </span>
        <span className="spacer" />
        <Link className="btn small" to="/result/$id" params={{ id: p.run.id }}>
          Open this result →
        </Link>
        <button
          type="button"
          className="btn small primary"
          onClick={() => {
            void navigator.clipboard?.writeText(window.location.href).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            });
          }}
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? "Link copied" : ""}
        </span>
      </div>
    </section>
  );
}
