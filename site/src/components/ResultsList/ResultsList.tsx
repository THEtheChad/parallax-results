// Every published result, newest first: the site's changelog. On a phone each row is a card.

import { Link } from "@tanstack/react-router";
import { platformName } from "../../data/format.ts";
import { KIND_LABEL } from "../../data/model.ts";
import { useIndex } from "../../data/useIndex.ts";
import { Section } from "../Section/Section.tsx";

export function ResultsList() {
  const index = useIndex();
  const builds = new Map(index.builds.map((b) => [b.key, b]));
  if (!index.results.length) {
    return (
      <>
        <h1 className="kicker">All results · newest first</h1>
        <div className="state">
          <h2>blank tape</h2>
          <p>No results have been published yet. Be the first to record one.</p>
          <div className="actions">
            <Link className="btn primary" to="/about" hash="contribute">
              Run it on your machine
            </Link>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <h1 className="kicker">All results · newest first</h1>
      <Section
        n="01"
        word="the sessions"
        id="results"
        sub={`${index.results.length} published result${index.results.length === 1 ? "" : "s"}. Each was verified with Parallax before it was merged: its summary is what its records give. Open one for the machine, the rounds and the raw file.`}
      >
          <div className="liner">
            <div className="liner-label">
              <span>Side A · every result</span>
            </div>
            <div className="table-wrap">
              <table className="cards">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Benchmark</th>
                    <th>Project</th>
                    <th>Builds</th>
                    <th>Machine</th>
                    <th className="num">Rounds</th>
                    <th>Settled</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {index.results.map((r, i) => (
                    <tr key={r.id}>
                      <td className="track" data-label="#">
                        {String(i + 1).padStart(2, "0")}
                      </td>
                      <td data-label="Date">{r.date}</td>
                      <td data-label="Benchmark">{KIND_LABEL[r.kind]}</td>
                      <td data-label="Project" className="build">
                        {r.project}
                        {r.suite ? "" : " (not in the suite)"}
                      </td>
                      <td data-label="Builds" style={{ whiteSpace: "normal", minWidth: 260 }}>
                        {r.builds.map((b) => builds.get(b)?.label ?? b).join(", ")}
                      </td>
                      <td data-label="Machine">
                        {platformName(r.machine.platform)}, {r.machine.cpuModel}
                      </td>
                      <td data-label="Rounds" className="num">
                        {r.roundsAccepted}
                      </td>
                      <td data-label="Settled">{r.settled === null ? "–" : r.settled ? "yes" : "no"}</td>
                      <td data-label="Result">
                        <Link to="/result/$id" params={{ id: r.id }}>
                          {r.id.slice(0, 8)} →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
      </Section>
    </>
  );
}
