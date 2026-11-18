// One published result: where it came from (machine, harness, project, binaries), how the bench went
// (rounds, confidence, notes), and every comparison in it.

import { getRouteApi, Link } from "@tanstack/react-router";
import { callText, fmtInterval, fmtPercent, fmtValue, platformName } from "../../data/format.ts";
import { KIND_LABEL, metricInfo } from "../../data/model.ts";
import { useIndex, useResult } from "../../data/useIndex.ts";

const route = getRouteApi("/result/$id");
const REPO = "https://github.com/THEtheChad/parallax-results";

interface Published {
  harness: { gitCommit: string | null; gitDirty: boolean | null; version: string; node: string };
  host: {
    platform: string;
    arch: string;
    kernel: string;
    cpuModel: string;
    cpus: number;
    memTotalBytes: number;
    load?: { priority: number | null };
    state?: { governors: string[] | null; boost: boolean | null; smt: string | null; power: string | null; lowPowerMode: boolean | null; powerPlan: string | null };
    accounting?: string;
    usage?: string;
    counters?: string;
  };
  project: { name: string; suite: boolean; repository: string | null; commit: string | null; clean: boolean };
  settings: { threads?: string[]; runs: number; maxRuns?: number; resolution?: number; resolutionMs?: number };
  sides: { label: string; role: string; profile: string; binSha256: string; version: string | null; mode?: string }[];
  summary: { rounds: { planned: number; max?: number; accepted: number; attempts: number; rejected: number; failed: number }; rejections: Record<string, number> };
}

export function ResultView() {
  const { id } = route.useParams();
  const index = useIndex();
  const summary = index.results.find((r) => r.id === id);
  const result = useResult(id) as Published;
  if (!summary) return <p className="empty">No result {id}.</p>;
  const builds = new Map(index.builds.map((b) => [b.key, b]));
  const buildOfSha = (sha: string) => index.builds.find((b) => b.shas.includes(sha.slice(0, 16)));
  const comparisons = index.comparisons.filter((c) => c.result === id);
  const h = result.host;
  const r = result.summary.rounds;
  const state = h.state;
  const stateText = state
    ? [
        state.power && `power: ${state.power}`,
        state.lowPowerMode !== null && `Low Power Mode ${state.lowPowerMode ? "on" : "off"}`,
        state.powerPlan && `plan: ${state.powerPlan}`,
        state.governors && `governor: ${state.governors.join(", ")}`,
        state.boost !== null && `boost ${state.boost ? "on" : "off"}`,
        state.smt && `SMT ${state.smt}`,
      ]
        .filter(Boolean)
        .join(" · ") || "not reported"
    : "not recorded";

  return (
    <>
      <p className="lede">
        <Link to="/results">All results</Link> / {summary.id}
      </p>
      <section className="card">
        <h2>
          {KIND_LABEL[summary.kind]} · {summary.project} · {summary.date}
        </h2>
        <dl className="facts">
          <dt>Project</dt>
          <dd>
            {result.project.repository ? <a href={`${result.project.repository.replace(/\.git$/, "")}/tree/${result.project.commit}`}>{result.project.name}</a> : result.project.name}{" "}
            at <code>{result.project.commit?.slice(0, 12) ?? "?"}</code>
            {result.project.suite ? " (suite project)" : " (not in the suite)"}
            {result.project.clean ? "" : " · had local changes"}
          </dd>
          <dt>Machine</dt>
          <dd>
            {platformName(h.platform)} {h.arch} · {h.cpuModel} · {h.cpus} threads · {Math.round(h.memTotalBytes / 2 ** 30)} GB · machine {summary.machine.id}
          </dd>
          <dt>Machine state</dt>
          <dd>
            {stateText}
            {h.load?.priority ? ` · priority lowered (${h.load.priority})` : ""}
          </dd>
          <dt>Harness</dt>
          <dd>
            Parallax{" "}
            {result.harness.gitCommit ? (
              <a href={`https://github.com/THEtheChad/parallax/commit/${result.harness.gitCommit}`}>
                <code>{result.harness.gitCommit.slice(0, 12)}</code>
              </a>
            ) : (
              "(unknown commit)"
            )}{" "}
            · Node {result.harness.node} · accounting {h.accounting ?? h.usage ?? "–"}
            {h.counters && h.counters !== "none" ? ` · counters ${h.counters}` : ""}
          </dd>
          <dt>Rounds</dt>
          <dd>
            {r.accepted} accepted of {r.planned}
            {r.max && r.max > r.planned ? `..${r.max}` : ""} planned ({r.attempts} attempts, {r.rejected} rejected, {r.failed} failed)
            {summary.confidence !== null ? ` · calls at ${fmtPercent(summary.confidence)}` : ""}
            {summary.settled === false ? " · not every call settled" : ""}
          </dd>
          <dt>Raw</dt>
          <dd>
            <a href={`data/results/${summary.id}.json`}>result JSON</a> · <a href={`${REPO}/blob/main/${summary.file}`}>{summary.file}</a>
          </dd>
        </dl>
      </section>
      <section className="card">
        <h2>Binaries</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Side</th>
                <th>Role</th>
                <th>Build</th>
                <th>Version</th>
                <th>sha256</th>
              </tr>
            </thead>
            <tbody>
              {result.sides.map((s) => (
                <tr key={s.label}>
                  <td>{s.label}</td>
                  <td>{s.role === "ref" ? "reference" : "candidate"}</td>
                  <td>{buildOfSha(s.binSha256)?.label ?? "unregistered"}</td>
                  <td>{s.version ?? "–"}</td>
                  <td>
                    <code>{s.binSha256.slice(0, 16)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2>Comparisons</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Candidate</th>
                <th>Threads</th>
                <th className="num">Ratio (interval)</th>
                <th>Call</th>
                <th className="num">Candidate</th>
                <th className="num">Reference</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((c) => {
                const m = metricInfo(c.kind, c.metric);
                return (
                  <tr key={c.id}>
                    <td>{m?.label ?? c.metric}</td>
                    <td>{builds.get(c.candidate)?.label}</td>
                    <td>{c.mode}</td>
                    <td className="num">{fmtInterval(c.ratio)}</td>
                    <td>
                      <span className="call" data-call={c.call ?? ""}>
                        {callText(c.call, c.sameWithin)}
                      </span>
                    </td>
                    <td className="num">{fmtValue(c.candidateValue, m?.unit ?? "ms")}</td>
                    <td className="num">{fmtValue(c.referenceValue, m?.unit ?? "ms")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {summary.notes.length > 0 && (
        <section className="card">
          <h2>Notes from the bench</h2>
          <ul className="notes">
            {summary.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
      {Object.keys(result.summary.rejections).length > 0 && (
        <section className="card">
          <h2>Rejected rounds</h2>
          <ul className="notes">
            {Object.entries(result.summary.rejections).map(([why, n]) => (
              <li key={why}>
                {n}× {why}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
