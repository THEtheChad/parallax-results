# Contributing results

Results from many machines are what make this useful: a ratio that holds on Apple silicon, AMD and
Intel alike says more than any one machine can.

## 1. Run the suite

With [Parallax](https://github.com/THEtheChad/parallax) at a commit on its `main` (a harness with
uncommitted changes cannot be verified):

```sh
git clone https://github.com/THEtheChad/parallax && cd parallax
pnpm install
pnpm parallax suite run \
  --ref tsc7=<path to tsc 7> --cand tsrs=<path to tsrs> --cand tsc-rs-fork=<path to the fork> \
  --out ~/parallax-bundles --publish ~/parallax-results-new
```

The suite (`suite.json` in Parallax) pins each project to a commit and installs it the same way
everywhere, so results compare. Fetching needs git and each project's package manager (bun for hono,
pnpm through corepack for the others). `--only bench` runs only the command-line benches, which take
minutes; the language-server benches take much longer.

Before you run: plug a laptop in, turn Low Power Mode off, close what you can, and run at normal
priority. Parallax waits for an idle machine and rejects disturbed rounds, but it cannot make a busy
machine quiet. It records what it sees, and its warnings end up in the result.

## 2. Add the results

```sh
git clone https://github.com/THEtheChad/parallax-results && cd parallax-results
git switch -c results/<your-name>-<date>
cp -r ~/parallax-results-new/* results/
node scripts/verify-results.ts     # the same check CI runs
```

Open a pull request. CI verifies each result with the Parallax commit that made it and builds the
site; once merged, the site updates.

If you used a build that `builds.json` does not list, add it in the same pull request: its
implementation, version, where it came from, and the sha256 of each binary (`sha256sum <binary>`).
Leave its `reference` field out: which reference Compare opens on is the maintainer's call.

## What a result contains

Your machine's OS, CPU model, core count, memory, power state and a random machine id (kept in
Parallax's config directory, so your results group). Not your hostname, user name, paths, or any
output of the compilers. Each result file is plain JSON: read it before you open the pull request.
