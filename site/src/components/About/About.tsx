// About, as the liner notes of a tape: side A is how to read the site, side B how to add to it.

import { CopyButton } from "../CopyButton/CopyButton.tsx";

const COMMAND =
  "pnpm parallax suite run --ref tsc7=<path to tsc 7> --cand tsrs=<path to tsrs> --cand tsc-rs-fork=<path to the fork> --out ~/parallax-bundles --publish ~/parallax-results-new";

export function About() {
  return (
    <>
      <h1 className="kicker">About · liner notes</h1>
      <div className="liner" style={{ marginTop: 20 }}>
        <div className="jcard">
          <section aria-labelledby="side-a">
            <h2 className="side" id="side-a">
              Side A · how to read it
            </h2>
            <ol className="tracks">
              <li>
                <h3>What this is</h3>
                <p>
                  Benchmark results for implementations of the TypeScript compiler and language server (tsc 7, the tsc-rs fork, tsrs and
                  others), measured with <a href="https://github.com/THEtheChad/parallax">Parallax</a> and published by anyone who runs it.
                </p>
              </li>
              <li>
                <h3>Every number is a ratio</h3>
                <p>
                  A candidate's time divided by the reference's, measured in the same rounds on the same machine, so the machine's own
                  speed cancels. Below 1× is faster: 0.5× takes half the time, which is 2× as fast.
                </p>
              </li>
              <li>
                <h3>Every ratio has an interval and a call</h3>
                <p>
                  A distribution-free interval, and a call: <em>faster</em>, <em>slower</em>, <em>same ±r</em> (within the resolution),{" "}
                  <em>unresolved</em> or <em>too few rounds</em>.
                </p>
              </li>
              <li>
                <h3>Machines are never averaged</h3>
                <p>Results from different machines sit side by side. Their spread is the evidence.</p>
              </li>
              <li>
                <h3>Default and single-threaded</h3>
                <p>
                  "Default" lets each implementation use the machine's cores as it chooses; "1 thread" runs it single-threaded, which
                  separates the algorithm's cost from its use of parallelism.
                </p>
              </li>
              <li>
                <h3>The method</h3>
                <p>
                  What disturbs a measurement and how each disturbance is handled:{" "}
                  <a href="https://github.com/THEtheChad/parallax/blob/main/docs/measurement.md">docs/measurement.md</a>.
                </p>
              </li>
            </ol>
          </section>
          <section aria-labelledby="contribute">
            <h2 className="side" id="contribute">
              Side B · run it on your machine
            </h2>
            <ol className="tracks">
              <li>
                <h3>Run the suite</h3>
                <p>
                  From a clone of <a href="https://github.com/THEtheChad/parallax">Parallax</a> at a commit on its main, with the
                  compiler binaries you want to compare (a tsc 7 build as the reference; builds.json in this repository lists the known
                  ones). <code>--only bench</code> runs the command-line benches alone, which take minutes; the language-server benches
                  take much longer.
                </p>
                <div className="command" style={{ gridColumn: 2, marginTop: 8 }}>
                  <code>{COMMAND}</code>
                  <CopyButton text={() => COMMAND} />
                </div>
              </li>
              <li>
                <h3>Open a pull request</h3>
                <p>
                  Copy the new results into <code>results/</code> of{" "}
                  <a href="https://github.com/THEtheChad/parallax-results">THEtheChad/parallax-results</a>. CI recomputes every result's
                  summary from its records with the Parallax commit that made it before anything is published.
                </p>
              </li>
              <li>
                <h3>What leaves your machine</h3>
                <p>
                  The OS, CPU model, core count, memory, power state and a random machine id. Not your hostname, user name, paths or any
                  compiler output. Each result is plain JSON: read it before you open the pull request.
                </p>
              </li>
              <li>
                <h3>The full guide</h3>
                <p>
                  <a href="https://github.com/THEtheChad/parallax-results/blob/main/CONTRIBUTING.md">CONTRIBUTING.md</a>
                </p>
              </li>
            </ol>
            <p className="caption" style={{ textAlign: "right", margin: "8px 0 0" }} aria-hidden="true">
              more machines, more truth
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
