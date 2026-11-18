export function About() {
  return (
    <section className="card prose">
      <h2>What this is</h2>
      <p>
        Benchmark results for implementations of the TypeScript compiler and language server (tsc 7, the tsc-rs fork, tsrs and others),
        measured with <a href="https://github.com/THEtheChad/parallax">Parallax</a> and published by anyone who runs it.
      </p>
      <h2>How to read it</h2>
      <p>
        Every number is a ratio: a candidate's time divided by the reference's, measured in the same rounds on the same machine, so the
        machine's own speed cancels. A ratio below 1 is faster. Each comes with a distribution-free interval and a call: <em>faster</em>,{" "}
        <em>slower</em>, <em>same ±r</em> (within the resolution), <em>unresolved</em> or <em>too few rounds</em>. Results from different
        machines are shown side by side, never averaged into one number.
      </p>
      <p>
        "Default" runs each implementation as it chooses to use the machine's cores; "single" runs it single-threaded, which separates
        the algorithm's cost from its use of parallelism.
      </p>
      <p>
        The method, including what disturbs a measurement and how each disturbance is handled, is{" "}
        <a href="https://github.com/THEtheChad/parallax/blob/main/docs/measurement.md">docs/measurement.md</a>.
      </p>
      <h2>Contributing results</h2>
      <p>
        Run the suite with <code>parallax suite run … --publish results/</code> and open a pull request against{" "}
        <a href="https://github.com/THEtheChad/parallax-results">THEtheChad/parallax-results</a>. CI recomputes every result's summary from
        its records with the Parallax commit that made it before anything is published. See{" "}
        <a href="https://github.com/THEtheChad/parallax-results/blob/main/CONTRIBUTING.md">CONTRIBUTING.md</a>.
      </p>
    </section>
  );
}
