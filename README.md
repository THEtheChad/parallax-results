# parallax-results

Published benchmark results for implementations of the TypeScript compiler and language server
(tsc 7, the tsc-rs fork, tsrs, ...), measured with [Parallax](https://github.com/THEtheChad/parallax),
and the site that compares them: **https://thethechad.github.io/parallax-results/**

The site filters by project, benchmark, metric, thread mode, OS, reference and build, and animates
to each new selection. Every number is a ratio: a candidate's time over the reference's, measured
in the same rounds on the same machine. Results from different machines sit side by side and are
never averaged into one number. The method is
[docs/measurement.md](https://github.com/THEtheChad/parallax/blob/main/docs/measurement.md) in
Parallax.

## What is here

- `results/<kind>/<project>/*.json`: one file per published result (`parallax publish`): the
  per-round records, the summary, and provenance (Parallax commit, each binary's sha256 and version,
  the project's repository and commit, the machine's OS, CPU, power state and priority). No
  hostnames, paths or outputs.
- `builds.json`: known builds, matched to results by each binary's sha256, so the site can name
  them ("tsrs 0.25.0") and group one build's binaries across platforms. A binary that is not listed
  still counts, under its hash.
- `site/`: the site (Vite, React, TanStack Router and Table; Apache ECharts from cdnjs, pinned and
  integrity-checked). `scripts/build-index.ts` turns `results/` into the data it loads.

## Trust

CI (`.github/workflows/verify.yml`) checks every result with the Parallax commit that made it:
the result must be unedited since publishing, and its summary must be exactly what its records give.
That cannot prove a bench was run as claimed, but every published number is internally consistent,
reproducible from its records, attributed to the pull request that added it, and comes with what is
needed to run it again.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Developing the site

```sh
pnpm install
pnpm dev          # builds the index from results/ and serves the site
pnpm check        # type-check and tests
node scripts/verify-results.ts
```

Node 24 (`.node-version`), pnpm (pinned in `package.json`).

## UI audit

The site's UI is audited with the `ui-audit` Claude Code skill (`.claude/skills/ui-audit/`): run
`/ui-audit <surfaces>` in Claude Code. A deterministic camera (`scripts/ui-audit/`) photographs a
production build; three reviewers on different model families, blind to each other, judge the
photographs; the owner triages; every fix is checked against new photographs.
[docs/ui/AUDIT.md](docs/ui/AUDIT.md) is the audit's configuration (surfaces, viewports, the visual
spec, the component vocabulary) and links the reports.
