import { Link } from "@tanstack/react-router";
import { platformName } from "../../data/format.ts";
import { KIND_LABEL } from "../../data/model.ts";
import { useIndex } from "../../data/useIndex.ts";

export function ResultsList() {
  const index = useIndex();
  const builds = new Map(index.builds.map((b) => [b.key, b]));
  if (!index.results.length) return <p className="empty">No results have been published yet.</p>;
  return (
    <section className="card">
      <h2>All results</h2>
      <p className="sub">
        {index.results.length} published result{index.results.length === 1 ? "" : "s"}, newest first. Each was verified with Parallax before it
        was merged: its summary is what its records give.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
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
            {index.results.map((r) => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td>{KIND_LABEL[r.kind]}</td>
                <td>
                  {r.project}
                  {r.suite ? "" : " (not in the suite)"}
                </td>
                <td>{r.builds.map((b) => builds.get(b)?.label ?? b).join(", ")}</td>
                <td>
                  {platformName(r.machine.platform)}, {r.machine.cpuModel}
                </td>
                <td className="num">{r.roundsAccepted}</td>
                <td>{r.settled === null ? "–" : r.settled ? "yes" : "no"}</td>
                <td>
                  <Link to="/result/$id" params={{ id: r.id }}>
                    {r.id.slice(0, 8)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
