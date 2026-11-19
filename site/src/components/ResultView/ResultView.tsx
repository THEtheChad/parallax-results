// One published result: where it came from (machine, harness, project, binaries), how the bench went
// (rounds, confidence, notes), and every comparison in it. Its rounds read as a tape counter, and it
// says how to reproduce it.

import { getRouteApi, Link } from "@tanstack/react-router";
import { callText, fmtInterval, fmtPercent, fmtValue, platformName, speedText } from "../../data/format.ts";
import { KIND_LABEL, metricInfo } from "../../data/model.ts";
import { useIndex, useResult } from "../../data/useIndex.ts";
import { NotFound } from "../NotFound/NotFound.tsx";
import { Section } from "../Section/Section.tsx";

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
  if (!summary) return <NotFound />;
  return <Result id={id} />;
}

function Result({ id }: { id: string }) {
  const index = useIndex();
  const summary = index.results.find((r) => r.id === id)!;
  const result = useResult(id) as Published;
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

  const counter = String(r.accepted).padStart(3, "0").split("");
  // How to record the same session: the suite command with this result's sides (label:profile, as
  // Parallax names them), its kind and its project. Binary paths are the reader's own.
  const side = (sd: Published["sides"][number]) => (sd.label === sd.profile ? sd.profile : `${sd.label}:${sd.profile}`);
  const main = result.sides.filter((sd) => !sd.label.includes("@"));
  const command = [
    "pnpm parallax suite run",
    `--only ${summary.kind === "cli-bench" ? "bench" : "lsp-bench"}`,
    ...main.filter((sd) => sd.role === "ref").map((sd) => `--ref ${sd.profile}=<path to ${sd.label}>`),
    ...main.filter((sd) => sd.role !== "ref").map((sd) => `--cand ${side(sd)}=<path to ${sd.label}>`),
    "--out ~/parallax-bundles --publish ~/parallax-results-new",
    result.project.name,
  ].join(" ");

  return (
    <>
      <h1 className="kicker">
        <Link to="/results">All results</Link> / {KIND_LABEL[summary.kind]} · {summary.project} · {summary.date}
      </h1>
      <Section n="01" word="the session" id="session" aside={`result ${summary.id.slice(0, 8)}`}>
        <div className="panel">
          <div className="counter-row">
            <div className="counter">
              <span className="digits" aria-hidden="true">
                {counter.map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </span>
              <span className="label">rounds accepted</span>
            </div>
            <div className="counter">
              <span className="splices" aria-hidden="true">
                {Array.from({ length: r.accepted }, (_, i) => (
                  <i key={`a${i}`} />
                ))}
                {Array.from({ length: r.rejected }, (_, i) => (
                  <i key={`r${i}`} className="rejected" />
                ))}
                {Array.from({ length: r.failed }, (_, i) => (
                  <i key={`f${i}`} className="failed" />
                ))}
              </span>
              <span className="label">
                {r.attempts} attempts · {r.rejected} rejected · {r.failed} failed
              </span>
            </div>
          </div>
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
              {r.max && r.max > r.planned ? `..${r.max}` : ""} planned
              {summary.confidence !== null ? ` · calls at ${fmtPercent(summary.confidence)}` : ""}
              {summary.settled === false ? " · not every call settled" : ""}
            </dd>
            <dt>Raw</dt>
            <dd>
              <a href={`data/results/${summary.id}.json`}>result JSON</a> · <a href={`${REPO}/blob/main/${summary.file}`}>{summary.file}</a>
            </dd>
          </dl>
        </div>
      </Section>
      <Section n="02" word="the comparisons" id="comparisons">
        <div className="liner">
          <div className="liner-label">
            <span>Side A · every metric</span>
          </div>
          <div className="table-wrap">
            <table className="cards">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Candidate</th>
                  <th>Threads</th>
                  <th className="num">Ratio (interval)</th>
                  <th>In words</th>
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
                      <td data-label="Metric">{m?.label ?? c.metric}</td>
                      <td data-label="Candidate" className="build">
                        {builds.get(c.candidate)?.label}
                      </td>
                      <td data-label="Threads">{c.mode === "single" ? "1 thread" : "default"}</td>
                      <td data-label="Ratio (interval)" className="num">
                        {fmtInterval(c.ratio)}
                      </td>
                      <td data-label="In words">{speedText(c.ratio.estimate, m?.unit ?? "ms")}</td>
                      <td data-label="Call">
                        <span className="call" data-call={m?.called === false ? "" : (c.call ?? "")}>
                          {m?.called === false ? "no call" : callText(c.call, c.sameWithin)}
                        </span>
                      </td>
                      <td data-label="Candidate value" className="num">
                        {fmtValue(c.candidateValue, m?.unit ?? "ms")}
                      </td>
                      <td data-label="Reference value" className="num">
                        {fmtValue(c.referenceValue, m?.unit ?? "ms")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
      <Section n="03" word="the tape" id="binaries" sub="The exact binaries, by hash, and how to record the same session on your machine.">
        <div className="liner">
          <div className="liner-label">
            <span>Side B · binaries</span>
          </div>
          <div className="table-wrap">
            <table className="cards">
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
                    <td data-label="Side" className="build">
                      {s.label}
                    </td>
                    <td data-label="Role">{s.role === "ref" ? "reference" : "candidate"}</td>
                    <td data-label="Build">{buildOfSha(s.binSha256)?.label ?? "unregistered"}</td>
                    <td data-label="Version" style={{ whiteSpace: "normal" }}>
                      {s.version ?? "–"}
                    </td>
                    <td data-label="sha256">
                      <code>{s.binSha256.slice(0, 16)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-label" style={{ margin: "18px 0 8px" }}>
            Record it again
          </p>
          <div className="command">
            <code>{command}</code>
            <button type="button" className="btn small" onClick={() => void navigator.clipboard?.writeText(command)}>
              Copy
            </button>
          </div>
        </div>
      </Section>
      {summary.notes.length > 0 || Object.keys(result.summary.rejections).length > 0 ? (
        <Section n="04" word="studio notes" id="notes">
          <div className="panel">
            {summary.notes.length > 0 && (
              <>
                <p className="field-label">From the bench</p>
                <ul className="notes">
                  {summary.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </>
            )}
            {Object.keys(result.summary.rejections).length > 0 && (
              <>
                <p className="field-label" style={{ marginTop: 14 }}>
                  Rejected rounds
                </p>
                <ul className="notes">
                  {Object.entries(result.summary.rejections).map(([why, n]) => (
                    <li key={why}>
                      {n}× {why}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Section>
      ) : null}
    </>
  );
}
