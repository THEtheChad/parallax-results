// The audit's synthetic data sets (docs/ui/AUDIT.md, "Personas" and "Running it"): the states the
// real results/ cannot show on demand. Each set is a list of result files in the published schema
// (parallax.result/1, as parallax's src/commands/publish.ts writes it, with the fields the site and
// scripts/build-index.ts read), indexed by build-index's own buildIndex() against a fixture builds
// registry, so a set's data/ is what the site would load if those files were in results/.
//
// Nothing here is a measurement, and nothing here may look like one. Every implementation, build,
// version, machine, CPU and project is self-evidently synthetic (`alpha 1.0.0-fixture`, `Fixture
// CPU A`, `fixture-app`), every hash starts with zeros, and no ratio mirrors a published result. A
// screenshot of a `~stub` cell is captioned "synthetic fixture data, not measurements" wherever it is
// committed (docs/ui/audits/README.md).
//
// The numbers are internally consistent the way Parallax makes them: each figure is the median of
// deterministic synthetic rounds, its interval is the distribution-free median interval at that
// round count (so its confidence follows from n, and it is rarely symmetric), each call is derived
// from the interval exactly as Parallax's callOf() does, and `settled` and `clean` follow from the
// calls. A spec names the call it means to show (`expect`); the numbers have to produce it, or
// writing the sets throws.
//
// Everything is deterministic: no clock, no randomness. Ids and sha256s are hashes of fixed strings,
// so a scenario can name a result and get the same page every run. The files carry no records:
// nothing in the site reads them, and they could not be verified anyway (these results were never
// run).
//
//   node scripts/ui-audit/fixtures.ts [out-dir]     writes every set, as capture.ts does

import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildIndex } from "../build-index.ts";
import { METRICS, type Call, type Index, type Interval, type Kind, type Mode } from "../../site/src/data/model.ts";

/** The stub sets. `real` is not here: it is results/ as `pnpm build` indexes it. */
export type StubSet = "empty" | "one" | "many" | "refs";
export const STUB_SETS: readonly StubSet[] = ["empty", "one", "many", "refs"];

export const FIXTURES_OUT = resolve(import.meta.dirname, "fixtures/out");

const digest = (s: string): string => createHash("sha256").update(`ui-audit fixture: ${s}`).digest("hex");
/** A hash of a fixed string, led by zeros so it reads as synthetic wherever it is shown. */
const hex = (s: string, n = 64): string => `000000${digest(s)}`.slice(0, n);

// ── Statistics, as Parallax computes them (parallax src/timing/stats.ts) ─────────────────────────

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) / 2;
  return (s[Math.floor(pos)]! + s[Math.ceil(pos)]!) / 2;
};

/**
 * Distribution-free interval for the median: [x(k), x(n+1-k)] with the largest k whose coverage,
 * 1 - 2·P(Binomial(n, 1/2) < k), reaches `target`. Below that (fewer than 6 rounds at 95%), the
 * whole range, with the confidence it really has: 75% at 3 rounds.
 */
function medianInterval(values: readonly number[], target: number): Interval {
  const n = values.length;
  const s = [...values].sort((a, b) => a - b);
  const below: number[] = [];
  let term = 0.5 ** n;
  let sum = 0;
  for (let j = 0; j <= n; j++) {
    sum += term;
    below.push(sum);
    term = (term * (n - j)) / (j + 1);
  }
  const coverage = (k: number): number => Math.max(0, 1 - 2 * below[k - 1]!);
  let k = 1;
  while (k + 1 <= Math.ceil(n / 2) && coverage(k + 1) >= target) k++;
  return { estimate: median(s), low: s[k - 1]!, high: s[n - k]!, confidence: coverage(k), n };
}

/** The confidence a call needs after n accepted rounds: the false-call budget split over the looks. */
function lookConfidence(n: number, plan: { runs: number; maxRuns: number }): number {
  const looks = [plan.runs];
  for (let x = plan.runs + 3; x < plan.maxRuns; x += 3) looks.push(x);
  if (plan.maxRuns > plan.runs) looks.push(plan.maxRuns);
  if (looks.length === 1) return 0.9;
  return n <= plan.runs ? 0.95 : 1 - 0.05 / (looks.length - 1);
}

const SETTLED: readonly Call[] = ["faster", "slower", "same"];
const RESOLUTION = 0.05;
const RESOLUTION_MS = 1;

/** The half-width of "same": the resolution, widened where the floor is larger than it. */
const sameWithin = (unit: "ms" | "bytes", refEstimate: number): number => Math.max(RESOLUTION, unit === "ms" ? RESOLUTION_MS / refEstimate : 0);

function callOf(ratio: Interval, confidence: number, same: number): Call {
  if (ratio.confidence < confidence - 1e-12) return "too few rounds";
  const sameFirst = same > RESOLUTION + 1e-12;
  const inSame = ratio.low >= 1 - same && ratio.high <= 1 + same;
  if (sameFirst && inSame) return "same";
  if (ratio.high < 1 && ratio.estimate <= 0.99) return "faster";
  if (ratio.low > 1 && ratio.estimate >= 1.01) return "slower";
  if (inSame) return "same";
  return "unresolved";
}

/**
 * n synthetic rounds around `center`: log-normal-ish scatter of relative width `spread`, from a
 * hash of `seed`, shifted so their median is `center`. Never symmetric about it.
 */
function rounds(seed: string, n: number, center: number, spread: number): number[] {
  const u = Array.from({ length: n }, (_, i) => Number.parseInt(digest(`${seed} round ${i}`).slice(0, 8), 16) / 2 ** 31 - 1);
  const m = median(u);
  return u.map((x) => center * Math.exp(spread * (x - m)));
}

// ── Builds: what the fixture registry knows, and one binary it does not ─────────────────────────

type Platform = "linux" | "darwin" | "win32";

interface BuildSpec {
  implementation: string;
  version: string;
  source: string;
  profile: string;
  // The label a side gets in a result (parallax names sides after the --ref/--cand flag).
  side: string;
  registered: boolean;
}

const SOURCE = "synthetic fixture build: never built, never run";
const BUILDS = {
  // The reference, and a newer build of the same implementation.
  base: { implementation: "alpha", version: "1.0.0-fixture", source: SOURCE, profile: "alpha", side: "alpha-1.0", registered: true },
  alphaNext: { implementation: "alpha", version: "1.1.0-fixture.rc (fixture00000)", source: SOURCE, profile: "alpha", side: "alpha-1.1-rc", registered: true },
  beta: { implementation: "beta", version: "0.9.0-fixture", source: SOURCE, profile: "beta", side: "beta", registered: true },
  gamma: { implementation: "gamma", version: "main fixture0", source: SOURCE, profile: "gamma", side: "gamma", registered: true },
  // A long version string: the label the chart, its chips and every table must make room for.
  betaLong: {
    implementation: "beta",
    version: "0.10.0-fixture.nightly+a-deliberately-long-version-label-for-width-testing (synthetic)",
    source: SOURCE,
    profile: "beta",
    side: "beta-long-label",
    registered: true,
  },
  // A binary builds.json does not list: the site names it by hash (build-index takes the
  // implementation from its profile).
  gammaLocal: { implementation: "gamma", version: "", source: "", profile: "gamma", side: "gamma-local", registered: false },
} satisfies Record<string, BuildSpec>;
type BuildKey = keyof typeof BUILDS;

// A registered build has a binary per platform; the unregistered one is a single local binary.
const binSha = (b: BuildKey, p: Platform): string => (BUILDS[b].registered ? hex(`${b} ${p}`) : hex(b));

/** The fixture builds.json: every registered build, with a binary per platform. */
export const REGISTRY = {
  schema: "parallax.builds/1" as const,
  builds: (Object.keys(BUILDS) as BuildKey[])
    .filter((k) => BUILDS[k].registered)
    .map((k) => ({
      implementation: BUILDS[k].implementation,
      version: BUILDS[k].version,
      source: BUILDS[k].source,
      binaries: Object.fromEntries((["linux", "darwin", "win32"] as const).map((p) => [binSha(k, p), p])),
    })),
};

/** A build's label in the index, as build-index makes it. */
export const buildLabel = (b: BuildKey): string =>
  BUILDS[b].registered ? `${BUILDS[b].implementation} ${BUILDS[b].version}` : `${BUILDS[b].implementation} (${binSha(b, "linux").slice(0, 8)})`;

// ── Machines and projects ────────────────────────────────────────────────────────────────────────

interface MachineSpec {
  id: string;
  platform: Platform;
  arch: string;
  kernel: string;
  cpuModel: string;
  cpus: number;
  memGb: number;
  state: { governors: string[] | null; boost: boolean | null; smt: string | null; power: string | null; lowPowerMode: boolean | null; powerPlan: string | null };
  accounting: string;
  counters: string;
}

const MACHINES = {
  linux: {
    id: `${hex("machine linux", 8)}-0000-4000-8000-000000000001`,
    platform: "linux",
    arch: "x64",
    kernel: "6.0.0-fixture",
    cpuModel: "Fixture CPU A (16 cores)",
    cpus: 32,
    memGb: 64,
    state: { governors: ["performance"], boost: true, smt: "on", power: null, lowPowerMode: null, powerPlan: null },
    accounting: "gnu-time+proc",
    counters: "perf",
  },
  mac: {
    id: `${hex("machine mac", 8)}-0000-4000-8000-000000000002`,
    platform: "darwin",
    arch: "arm64",
    kernel: "25.0.0-fixture",
    cpuModel: "Fixture SoC B",
    cpus: 12,
    memGb: 32,
    state: { governors: null, boost: null, smt: null, power: "AC", lowPowerMode: false, powerPlan: null },
    accounting: "rusage",
    counters: "none",
  },
  windows: {
    id: `${hex("machine windows", 8)}-0000-4000-8000-000000000003`,
    platform: "win32",
    arch: "x64",
    kernel: "10.0.0-fixture",
    cpuModel: "Fixture CPU C (24 cores)",
    cpus: 24,
    memGb: 32,
    state: { governors: null, boost: null, smt: null, power: "AC", lowPowerMode: null, powerPlan: "Balanced" },
    accounting: "job-object",
    counters: "none",
  },
  // A laptop on battery in Low Power Mode with a long CPU model string: every warning the result
  // page can show about the machine, and a label that must wrap.
  laptop: {
    id: `${hex("machine laptop", 8)}-0000-4000-8000-000000000004`,
    platform: "darwin",
    arch: "arm64",
    kernel: "25.0.0-fixture",
    cpuModel: "Fixture SoC D (16-core CPU, 40-core GPU, an unusually long model string for label-width testing)",
    cpus: 16,
    memGb: 128,
    state: { governors: null, boost: null, smt: null, power: "battery", lowPowerMode: true, powerPlan: null },
    accounting: "rusage",
    counters: "none",
  },
} satisfies Record<string, MachineSpec>;
type MachineKey = keyof typeof MACHINES;

const PROJECTS = {
  app: { name: "fixture-app", suite: true, repository: "https://example.com/fixtures/fixture-app" },
  lib: { name: "fixture-lib", suite: true, repository: "https://example.com/fixtures/fixture-lib" },
  // Sorts last, so the compare page's default project stays fixture-app; not in the suite, and dirty.
  long: { name: "zz-a-deliberately-long-project-name-that-is-not-in-the-suite", suite: false, repository: null },
} satisfies Record<string, { name: string; suite: boolean; repository: string | null }>;
type ProjectKey = keyof typeof PROJECTS;

/** The default project the stub compare views open on (the first, sorted). */
export const DEFAULT_PROJECT = PROJECTS.app.name;

// ── Results ──────────────────────────────────────────────────────────────────────────────────────

type LspKey = (typeof METRICS)["lsp-bench"][number]["key"];

interface Measure {
  // The median ratio of the synthetic rounds, and how widely they scatter (relative).
  ratio: number;
  spread?: number;
  // The call this is meant to show. It is not written: the call is derived from the interval, and
  // a mismatch throws, so the numbers and the call can never disagree.
  expect: Call | null;
}

interface CandidateSpec {
  build: BuildKey;
  // cli-bench: the wall-time ratio per thread mode (`single` only when the result ran it).
  default?: Measure;
  single?: Measure;
  // lsp-bench: per metric (default threads only).
  metrics?: Partial<Record<LspKey, Measure>>;
  // The candidate failed every round: it is in the result, with no ratio.
  failed?: boolean;
}

interface ResultSpec {
  kind: Kind;
  project: ProjectKey;
  machine: MachineKey;
  // When it finished: the date the site shows.
  finishedAt: string;
  ref: BuildKey;
  // cli-bench: the reference's wall time (ms) per mode; lsp-bench: its figure per metric.
  refMs?: { default: number; single?: number };
  refMetrics?: Partial<Record<LspKey, number>>;
  candidates: CandidateSpec[];
  // Accepted + rejected + failed = attempts.
  rounds?: { planned?: number; accepted?: number; attempts?: number; rejected?: number; failed?: number };
  notes?: string[];
  rejections?: Record<string, number>;
  projectClean?: boolean;
  priority?: number;
}

type CandidateState = "measured" | "failed" | "noisy";

/** A published result as the fixtures write it: the fields parallax publishes, minus records. */
export interface FixtureResult {
  schema: "parallax.result/1";
  kind: Kind;
  id: string;
  publishedAt: string;
  machine: { id: string };
  project: { name: string; suite: boolean; repository: string | null; commit: string | null; clean: boolean };
  harness: { name: string; version: string; gitCommit: string | null; gitDirty: boolean; node: string };
  host: {
    platform: string;
    kernel: string;
    arch: string;
    cpuModel: string;
    cpus: number;
    memTotalBytes: number;
    state: MachineSpec["state"];
    load: { priority: number | null };
    accounting: string;
    counters: string;
  };
  settings: { threads: Mode[]; runs: number; maxRuns: number; minRounds: number; resolution: number; resolutionMs: number };
  sides: { label: string; role: "ref" | "cand"; profile: string; binSha256: string; version: string | null; mode: Mode }[];
  notes: string[];
  createdAt: string;
  finishedAt: string;
  records: unknown[];
  summary: {
    schema: string;
    rounds: { planned: number; max: number; attempts: number; accepted: number; rejected: number; failed: number };
    minRounds: number;
    confidence: number;
    rejections: Record<string, number>;
    sides: { label: string; role: "ref" | "cand"; mode: Mode; wallMs?: Interval | null; cpuMs?: Interval | null; metrics?: Record<string, Interval | null> }[];
    candidates: {
      label: string;
      ref: string;
      mode: Mode;
      state: CandidateState;
      wallRatio?: Interval | null;
      cpuRatio?: Interval | null;
      call?: Call | null;
      sameWithin?: number;
      metrics?: Record<string, { ratio: Interval | null; call: Call | null; sameWithin: number }>;
    }[];
    settled: boolean;
    clean: boolean;
  };
}

/** A partial record's entries, without the keys it leaves out. */
const defined = <T,>(r: Partial<Record<string, T>> | undefined): [string, T][] =>
  Object.entries(r ?? {}).flatMap(([k, v]) => (v === undefined ? [] : [[k, v] as [string, T]]));

const HARNESS_COMMIT = hex("harness commit", 40);
const MIN_ROUNDS = 3;

function makeResult(name: string, s: ResultSpec): FixtureResult {
  const m: MachineSpec = MACHINES[s.machine];
  const project = PROJECTS[s.project];
  const modes: Mode[] = s.kind === "cli-bench" && s.candidates.some((c) => c.single) ? ["default", "single"] : ["default"];
  const sideLabel = (b: BuildKey, mode: Mode): string => `${BUILDS[b].side}${mode === "single" ? "@1t" : ""}`;
  const side = (b: BuildKey, role: "ref" | "cand", mode: Mode): FixtureResult["sides"][number] => ({
    label: sideLabel(b, mode),
    role,
    profile: BUILDS[b].profile,
    binSha256: binSha(b, m.platform),
    version: BUILDS[b].registered ? `${BUILDS[b].implementation} ${BUILDS[b].version}` : null,
    mode,
  });
  const sides = modes.flatMap((mode) => [side(s.ref, "ref", mode), ...s.candidates.filter((c) => mode === "default" || c.single).map((c) => side(c.build, "cand", mode))]);

  const r = { planned: 6, max: 15, accepted: 6, attempts: 6, rejected: 0, failed: 0, ...s.rounds };
  if (r.accepted + r.rejected + r.failed !== r.attempts) throw new Error(`fixture ${name}: rounds do not add up to attempts`);
  const n = r.accepted;
  const confidence = lookConfidence(n, { runs: r.planned, maxRuns: r.max });
  const stateOf = (c: CandidateSpec): CandidateState => (c.failed ? "failed" : n < MIN_ROUNDS ? "noisy" : "measured");
  const interval = (seed: string, center: number, spread: number): Interval => medianInterval(rounds(`${name} ${seed}`, n, center, spread), confidence);
  const calls: (Call | null)[] = [];
  const called = (where: string, ratio: Interval, state: CandidateState, same: number, want: Measure): Call | null => {
    const call = state === "measured" ? callOf(ratio, confidence, same) : null;
    if (call !== want.expect) throw new Error(`fixture ${name}, ${where}: its numbers give "${call}", the spec expects "${want.expect}"`);
    calls.push(call);
    return call;
  };

  const summarySides: FixtureResult["summary"]["sides"] = [];
  const candidates: FixtureResult["summary"]["candidates"] = [];
  if (s.kind === "cli-bench") {
    for (const mode of modes) {
      const base = s.refMs ?? { default: 100 };
      const refMs = mode === "single" ? (base.single ?? base.default * 2.5) : base.default;
      const refLabel = sideLabel(s.ref, mode);
      const refWall = interval(`${refLabel} wall`, refMs, 0.03);
      summarySides.push({ label: refLabel, role: "ref", mode, wallMs: refWall, cpuMs: interval(`${refLabel} cpu`, refMs * (mode === "single" ? 1 : 4.5), 0.04) });
      for (const c of s.candidates) {
        const measure = mode === "single" ? c.single : c.default;
        if (!measure && !c.failed) continue;
        const label = sideLabel(c.build, mode);
        const state = stateOf(c);
        const same = sameWithin("ms", refWall.estimate);
        const ratio = measure && !c.failed ? interval(`${label} wall ratio`, measure.ratio, measure.spread ?? 0.03) : null;
        summarySides.push({
          label,
          role: "cand",
          mode,
          wallMs: ratio ? interval(`${label} wall`, refMs * ratio.estimate, 0.03) : null,
          cpuMs: ratio ? interval(`${label} cpu`, refMs * ratio.estimate * 3, 0.04) : null,
        });
        candidates.push({
          label,
          ref: refLabel,
          mode,
          state,
          wallRatio: ratio,
          cpuRatio: ratio ? interval(`${label} cpu ratio`, ratio.estimate * 0.8, 0.05) : null,
          call: ratio && measure ? called(label, ratio, state, same, measure) : null,
          sameWithin: same,
        });
      }
    }
  } else {
    const refLabel = sideLabel(s.ref, "default");
    const refMetrics = new Map(defined(s.refMetrics).map(([k, v]) => [k, interval(`${refLabel} ${k}`, v, 0.03)]));
    summarySides.push({ label: refLabel, role: "ref", mode: "default", metrics: Object.fromEntries(refMetrics) });
    for (const c of s.candidates) {
      const label = sideLabel(c.build, "default");
      const state = stateOf(c);
      const metrics = defined(c.metrics).map(([k, x]) => [k, c.failed ? null : interval(`${label} ${k} ratio`, x.ratio, x.spread ?? 0.03), x] as const);
      summarySides.push({
        label,
        role: "cand",
        mode: "default",
        metrics: Object.fromEntries(metrics.map(([k, ratio]) => [k, ratio ? interval(`${label} ${k}`, (refMetrics.get(k)?.estimate ?? 100) * ratio.estimate, 0.03) : null])),
      });
      candidates.push({
        label,
        ref: refLabel,
        mode: "default",
        state,
        metrics: Object.fromEntries(
          metrics.map(([k, ratio, x]) => {
            const unit = METRICS["lsp-bench"].find((mi) => mi.key === k)?.unit ?? "ms";
            const same = sameWithin(unit, refMetrics.get(k)?.estimate ?? 100);
            return [k, { ratio, call: ratio ? called(`${label} ${k}`, ratio, state, same, x) : null, sameWithin: same }];
          }),
        ),
      });
    }
  }

  const body: Omit<FixtureResult, "id"> = {
    schema: "parallax.result/1",
    kind: s.kind,
    publishedAt: s.finishedAt,
    machine: { id: m.id },
    project: { ...project, commit: hex(`${s.project} commit`, 40), clean: s.projectClean ?? true },
    harness: { name: "parallax", version: "0.0.0-fixture", gitCommit: HARNESS_COMMIT, gitDirty: false, node: "v24.11.0" },
    host: {
      platform: m.platform,
      kernel: m.kernel,
      arch: m.arch,
      cpuModel: m.cpuModel,
      cpus: m.cpus,
      memTotalBytes: m.memGb * 2 ** 30,
      state: m.state,
      load: { priority: s.priority ?? 0 },
      accounting: m.accounting,
      counters: m.counters,
    },
    settings: { threads: modes, runs: r.planned, maxRuns: r.max, minRounds: MIN_ROUNDS, resolution: RESOLUTION, resolutionMs: RESOLUTION_MS },
    sides,
    notes: s.notes ?? [],
    createdAt: s.finishedAt,
    finishedAt: s.finishedAt,
    records: [],
    summary: {
      schema: s.kind === "cli-bench" ? "parallax.bench-summary/1" : "parallax.lsp-bench-summary/1",
      rounds: r,
      minRounds: MIN_ROUNDS,
      confidence,
      rejections: s.rejections ?? {},
      sides: summarySides,
      candidates,
      // As Parallax has them: settled when every call of a candidate that ran is one more rounds would
      // not change; clean when every candidate was measured.
      settled: candidates.every((c) => c.state === "failed") || calls.every((c) => c !== null && SETTLED.includes(c)),
      clean: candidates.every((c) => c.state === "measured"),
    },
  };
  // Like a published id, a hash of the result without it (16 hex digits), led by zeros.
  return { ...body, id: `0000${createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 12)}` };
}

const fast = (ratio: number, spread?: number): Measure => ({ ratio, spread, expect: "faster" });

/** Every fixture result, by the name scenarios use for it. */
export const RESULTS = {
  // The typical result: three candidates, both thread modes, every call "faster".
  appLinux: makeResult("appLinux", {
    kind: "cli-bench",
    project: "app",
    machine: "linux",
    finishedAt: "2026-01-10T09:12:00.000Z",
    ref: "base",
    refMs: { default: 260, single: 610 },
    candidates: [
      { build: "beta", default: fast(0.55), single: fast(0.48) },
      { build: "gamma", default: fast(0.62), single: fast(0.7) },
      { build: "alphaNext", default: fast(0.88), single: fast(0.84) },
    ],
    rounds: { attempts: 7, rejected: 1 },
    rejections: { "fixture gate: a round was rejected": 1 },
  }),
  // A second machine: "same" and "slower".
  appMac: makeResult("appMac", {
    kind: "cli-bench",
    project: "app",
    machine: "mac",
    finishedAt: "2026-01-12T18:40:00.000Z",
    ref: "base",
    refMs: { default: 310 },
    candidates: [
      { build: "beta", default: { ratio: 1.004, spread: 0.015, expect: "same" } },
      { build: "gamma", default: { ratio: 1.18, spread: 0.04, expect: "slower" } },
    ],
  }),
  // A noisy result: an interval that spans "same", an unregistered binary, run to the round limit
  // and still unsettled, with notes.
  appWindows: makeResult("appWindows", {
    kind: "cli-bench",
    project: "app",
    machine: "windows",
    finishedAt: "2026-01-14T07:05:00.000Z",
    ref: "base",
    refMs: { default: 420 },
    candidates: [
      { build: "beta", default: { ratio: 0.93, spread: 0.35, expect: "unresolved" } },
      { build: "gammaLocal", default: fast(0.4, 0.08) },
    ],
    rounds: { planned: 6, accepted: 15, attempts: 21, rejected: 6 },
    notes: ["fixture note: some rounds were rejected and re-run", "fixture note: the machine's power plan is not High performance"],
    rejections: { "fixture gate: outside load": 4, "fixture gate: canary drift": 2 },
  }),
  libLinux: makeResult("libLinux", {
    kind: "cli-bench",
    project: "lib",
    machine: "linux",
    finishedAt: "2026-01-11T09:30:00.000Z",
    ref: "base",
    refMs: { default: 980, single: 2600 },
    candidates: [
      { build: "beta", default: fast(0.58), single: fast(0.51) },
      { build: "gamma", default: fast(0.66), single: fast(0.74) },
    ],
  }),
  // Every edge at once: a long project name, a long build label, a failed candidate, the minimum
  // rounds (so every call is "too few rounds"), a dirty project, Low Power Mode on battery, lowered
  // priority.
  edge: makeResult("edge", {
    kind: "cli-bench",
    project: "long",
    machine: "laptop",
    finishedAt: "2026-01-09T22:15:00.000Z",
    ref: "base",
    refMs: { default: 4300 },
    candidates: [
      { build: "betaLong", default: { ratio: 0.21, spread: 0.2, expect: "too few rounds" } },
      { build: "gamma", failed: true },
      { build: "alphaNext", default: { ratio: 0.023, spread: 0.1, expect: "too few rounds" } },
    ],
    rounds: { planned: 6, accepted: 3, attempts: 9, rejected: 3, failed: 3 },
    notes: ["fixture note: on battery in Low Power Mode", "fixture note: the harness ran at lowered priority", "fixture note: candidate gamma failed every round"],
    rejections: { "fixture gate: a round was rejected": 2, "fixture gate: outside load": 1 },
    projectClean: false,
    priority: 10,
  }),
  // Language-server benches: a subset of metrics, with every call they can make.
  appLsp: makeResult("appLsp", {
    kind: "lsp-bench",
    project: "app",
    machine: "linux",
    finishedAt: "2026-01-15T11:00:00.000Z",
    ref: "base",
    refMetrics: {
      "open.firstDiagnosticsMs": 1400,
      "open.initializeMs": 150,
      "edit.firstRequestMs": 70,
      "edit.diagnosticsMs": 210,
      "typing.completionP50Ms": 44,
      "typing.completionP95Ms": 110,
      "session.memoryBytes": 700 * 2 ** 20,
    },
    candidates: [
      {
        build: "beta",
        metrics: {
          "open.firstDiagnosticsMs": fast(0.47),
          "open.initializeMs": { ratio: 0.995, spread: 0.012, expect: "same" },
          "edit.firstRequestMs": fast(0.64),
          "edit.diagnosticsMs": fast(0.53),
          "typing.completionP50Ms": { ratio: 0.97, spread: 0.3, expect: "unresolved" },
          "typing.completionP95Ms": { ratio: 1.27, expect: "slower" },
          "session.memoryBytes": fast(0.6),
        },
      },
      {
        build: "gamma",
        metrics: {
          "open.firstDiagnosticsMs": fast(0.51),
          "open.initializeMs": { ratio: 1.45, expect: "slower" },
          "edit.firstRequestMs": fast(0.73),
          "edit.diagnosticsMs": fast(0.49),
          "typing.completionP50Ms": fast(0.82),
          "typing.completionP95Ms": fast(0.88),
          "session.memoryBytes": { ratio: 1.35, expect: "slower" },
        },
      },
    ],
  }),
  libLspMac: makeResult("libLspMac", {
    kind: "lsp-bench",
    project: "lib",
    machine: "mac",
    finishedAt: "2026-01-16T15:20:00.000Z",
    ref: "base",
    refMetrics: { "open.firstDiagnosticsMs": 3600, "edit.diagnosticsMs": 520, "session.memoryBytes": 1500 * 2 ** 20 },
    candidates: [
      {
        build: "beta",
        metrics: { "open.firstDiagnosticsMs": fast(0.56), "edit.diagnosticsMs": fast(0.67), "session.memoryBytes": fast(0.74) },
      },
    ],
  }),
  // One contributor, three runs against another reference (the newer alpha) on one machine: more
  // comparisons than the three machines against the usual reference, never more machines.
  ...Object.fromEntries(
    (["2026-01-05", "2026-01-06", "2026-01-07"] as const).map((day, i) => [
      `otherRef${i + 1}`,
      makeResult(`otherRef${i + 1}`, {
        kind: "cli-bench",
        project: "app",
        machine: "laptop",
        finishedAt: `${day}T20:00:00.000Z`,
        ref: "alphaNext",
        refMs: { default: 230, single: 540 },
        candidates: [
          { build: "beta", default: fast(0.62), single: fast(0.55) },
          { build: "gamma", default: fast(0.7), single: fast(0.76) },
        ],
      }),
    ]),
  ) as Record<"otherRef1" | "otherRef2" | "otherRef3", FixtureResult>,
};
export type ResultName = keyof typeof RESULTS;

/** Which results each stub set publishes. */
export const SETS: Record<StubSet, readonly ResultName[]> = {
  empty: [],
  one: ["appLinux"],
  many: ["appLinux", "appMac", "appWindows", "libLinux", "edge", "appLsp", "libLspMac"],
  refs: ["appLinux", "appMac", "appWindows", "otherRef1", "otherRef2", "otherRef3"],
};

/** A result's repository path, as `parallax publish` names it. */
const resultPath = (r: FixtureResult): string =>
  `results/${r.kind}/${r.project.name}/${r.finishedAt.slice(0, 10)}-${r.machine.id.slice(0, 8)}-${r.id.slice(0, 8)}.json`;

/** A set's index, exactly as build-index makes it (with a fixed generatedAt). */
export function stubIndex(set: StubSet): Index {
  const results = SETS[set].map((name) => ({ file: resultPath(RESULTS[name]), result: RESULTS[name] }));
  return { ...buildIndex(results, REGISTRY), generatedAt: "2026-01-17T00:00:00.000Z" };
}

/** The `many` set must keep showing every state the scenarios photograph; this says which it lost. */
function missingStates(): string[] {
  const index = stubIndex("many");
  const results = SETS.many.map((n) => RESULTS[n]);
  const calls = new Set(index.comparisons.map((c) => c.call));
  const missing: string[] = [];
  for (const call of ["faster", "slower", "same", "unresolved", "too few rounds"] as const) if (!calls.has(call)) missing.push(`a "${call}" call`);
  if (!results.some((r) => r.summary.candidates.some((c) => c.state === "failed"))) missing.push("a failed candidate");
  if (!results.some((r) => !r.summary.settled)) missing.push("an unsettled result");
  if (!results.some((r) => r.notes.length)) missing.push("notes");
  if (new Set(results.map((r) => r.kind)).size < 2) missing.push("both kinds");
  if (new Set(results.map((r) => r.machine.id)).size < 3) missing.push("three machines");
  if (!index.builds.some((b) => !b.known)) missing.push("an unregistered build");
  if (!index.builds.some((b) => b.label.length > 60)) missing.push("a long build label");
  return missing;
}

/**
 * Writes each set to `<out>/<set>/`: `results/` (the files, in the repository's layout) and
 * `data/` (what the site loads: index.json and results/<id>.json). Returns the data directories.
 */
export function writeFixtureSets(out = FIXTURES_OUT): Record<StubSet, string> {
  const missing = missingStates();
  if (missing.length) throw new Error(`the "many" fixture set no longer has ${missing.join(", ")}: the scenarios need them`);
  rmSync(out, { recursive: true, force: true });
  const dirs = {} as Record<StubSet, string>;
  for (const set of STUB_SETS) {
    const base = join(out, set);
    const data = join(base, "data");
    mkdirSync(join(data, "results"), { recursive: true });
    for (const name of SETS[set]) {
      const r = RESULTS[name];
      const file = join(base, resultPath(r));
      mkdirSync(join(file, ".."), { recursive: true });
      const text = `${JSON.stringify(r, null, 2)}\n`;
      writeFileSync(file, text);
      writeFileSync(join(data, "results", `${r.id}.json`), text);
    }
    writeFileSync(join(data, "index.json"), JSON.stringify(stubIndex(set)));
    dirs[set] = data;
  }
  return dirs;
}

/** What each set holds, for the manifest. */
export function describeSets(): Record<StubSet, { name: ResultName; id: string; kind: Kind; project: string; machine: string; date: string }[]> {
  return Object.fromEntries(
    STUB_SETS.map((set) => [
      set,
      SETS[set].map((name) => {
        const r = RESULTS[name];
        return { name, id: r.id, kind: r.kind, project: r.project.name, machine: `${r.host.platform} ${r.host.cpuModel}`, date: r.finishedAt.slice(0, 10) };
      }),
    ]),
  ) as ReturnType<typeof describeSets>;
}

if (import.meta.main) {
  const out = resolve(process.argv[2] ?? FIXTURES_OUT);
  const dirs = writeFixtureSets(out);
  for (const set of STUB_SETS) console.log(`${set}: ${SETS[set].length} results -> ${dirs[set]}`);
}
