// The audit's synthetic data sets (docs/ui/AUDIT.md, "Personas" and "Running it"): the states the
// real results/ cannot show on demand. Each set is a list of result files in the published schema
// (parallax.result/1, as parallax's src/commands/publish.ts writes it, with the fields the site and
// scripts/build-index.ts read), indexed by build-index's own buildIndex() against a fixture builds
// registry, so a set's data/ is what the site would load if those files were in results/.
//
// Everything here is deterministic: no clock, no randomness. Ids and sha256s are hashes of fixed
// strings, so a scenario can name a result and get the same page every run. The files carry no
// records: nothing in the site reads them, and they could not be verified anyway (these results
// were never run).
//
//   node scripts/ui-audit/fixtures.ts [out-dir]     writes every set, as capture.ts does

import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildIndex } from "../build-index.ts";
import { METRICS, type Call, type Index, type Interval, type Kind, type Mode } from "../../site/src/data/model.ts";

/** The stub sets. `real` is not here: it is results/ as `pnpm build` indexes it. */
export type StubSet = "empty" | "one" | "many";
export const STUB_SETS: readonly StubSet[] = ["empty", "one", "many"];

export const FIXTURES_OUT = resolve(import.meta.dirname, "fixtures/out");

const hex = (s: string, n = 64): string => createHash("sha256").update(`ui-audit fixture: ${s}`).digest("hex").slice(0, n);

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

const BUILDS = {
  tsc702: { implementation: "tsc 7", version: "7.0.2", source: "npm typescript@7.0.2", profile: "tsc7", side: "tsc7.0.2", registered: true },
  tsc71: { implementation: "tsc 7", version: "7.1.0-beta (3e9236361fa9)", source: "go build of a TypeScript beta commit", profile: "tsc7", side: "tsc7.1-beta", registered: true },
  tsrs: { implementation: "tsrs", version: "0.25.0-ts7.1.0-beta", source: "npm tsrs@0.25.0-ts7.1.0-beta", profile: "tsrs", side: "tsrs", registered: true },
  fork: { implementation: "tsc-rs fork", version: "main e7847f46d", source: "cargo build of the fork's main (local build)", profile: "tsc-rs-fork", side: "tsc-rs-fork", registered: true },
  // A long version string: the label the chart, its chips and every table must make room for.
  tsrsNightly: {
    implementation: "tsrs",
    version: "0.26.0-nightly.2026-11-14+incremental-checker-rewrite (local build, not reproducible)",
    source: "a local build of a tsrs nightly branch",
    profile: "tsrs",
    side: "tsrs-nightly",
    registered: true,
  },
  // A binary builds.json does not list: the site names it by hash.
  forkLocal: { implementation: "tsc-rs fork", version: "", source: "", profile: "tsc-rs-fork", side: "tsc-rs-fork-local", registered: false },
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
    kernel: "6.12.0",
    cpuModel: "AMD Ryzen 9 9950X 16-Core Processor",
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
    kernel: "25.1.0",
    cpuModel: "Apple M4 Pro",
    cpus: 14,
    memGb: 48,
    state: { governors: null, boost: null, smt: null, power: "AC", lowPowerMode: false, powerPlan: null },
    accounting: "rusage",
    counters: "none",
  },
  windows: {
    id: `${hex("machine windows", 8)}-0000-4000-8000-000000000003`,
    platform: "win32",
    arch: "x64",
    kernel: "10.0.26200",
    cpuModel: "Intel(R) Core(TM) Ultra 9 285K",
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
    kernel: "25.1.0",
    cpuModel: "Apple M3 Max (16-core CPU, 40-core GPU, unusually long model string from a custom kernel)",
    cpus: 16,
    memGb: 128,
    state: { governors: null, boost: null, smt: null, power: "battery", lowPowerMode: true, powerPlan: null },
    accounting: "rusage",
    counters: "none",
  },
} satisfies Record<string, MachineSpec>;
type MachineKey = keyof typeof MACHINES;

const PROJECTS = {
  hono: { name: "hono", suite: true, repository: "https://github.com/honojs/hono" },
  umami: { name: "umami", suite: true, repository: "https://github.com/umami-software/umami" },
  // Sorts last, so the compare page's default project stays hono; not in the suite, and dirty.
  long: { name: "zz-a-deliberately-long-project-name-that-is-not-in-the-suite", suite: false, repository: null },
} satisfies Record<string, { name: string; suite: boolean; repository: string | null }>;
type ProjectKey = keyof typeof PROJECTS;

// ── Results ──────────────────────────────────────────────────────────────────────────────────────

const iv = (estimate: number, spread = 0.03, n = 6, bounds?: [number, number]): Interval => ({
  estimate,
  low: bounds?.[0] ?? estimate * (1 - spread),
  high: bounds?.[1] ?? estimate * (1 + spread),
  confidence: 0.96875,
  n,
});

type LspKey = (typeof METRICS)["lsp-bench"][number]["key"];

interface Measure {
  ratio: number;
  call: Call | null;
  spread?: number;
  // An explicit interval, for a noisy candidate whose interval is not symmetric.
  bounds?: [number, number];
}

interface CandidateSpec {
  build: BuildKey;
  // cli-bench: the wall-time ratio and call, per thread mode (`single` only when the result ran it).
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
  rounds?: { planned?: number; accepted?: number; attempts?: number; rejected?: number; failed?: number };
  settled?: boolean;
  notes?: string[];
  rejections?: Record<string, number>;
  projectClean?: boolean;
  priority?: number;
}

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
      state: "measured" | "failed";
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

function makeResult(s: ResultSpec): FixtureResult {
  const m: MachineSpec = MACHINES[s.machine];
  const project = PROJECTS[s.project];
  const modes: Mode[] = s.kind === "cli-bench" && s.candidates.some((c) => c.single) ? ["default", "single"] : ["default"];
  const sideLabel = (b: BuildKey, mode: Mode): string => `${BUILDS[b].side}${mode === "single" ? "@1t" : ""}`;
  const side = (b: BuildKey, role: "ref" | "cand", mode: Mode): FixtureResult["sides"][number] => ({
    label: sideLabel(b, mode),
    role,
    profile: BUILDS[b].profile,
    binSha256: binSha(b, m.platform),
    version: BUILDS[b].registered ? `Version ${BUILDS[b].version}` : null,
    mode,
  });
  const sides = modes.flatMap((mode) => [side(s.ref, "ref", mode), ...s.candidates.filter((c) => mode === "default" || c.single).map((c) => side(c.build, "cand", mode))]);

  const rounds = { planned: 6, max: 15, accepted: 6, attempts: 6, rejected: 0, failed: 0, ...s.rounds };
  const summarySides: FixtureResult["summary"]["sides"] = [];
  const candidates: FixtureResult["summary"]["candidates"] = [];
  if (s.kind === "cli-bench") {
    for (const mode of modes) {
      const base = s.refMs ?? { default: 100 };
      const refMs = mode === "single" ? (base.single ?? base.default * 2.5) : base.default;
      summarySides.push({ label: sideLabel(s.ref, mode), role: "ref", mode, wallMs: iv(refMs), cpuMs: iv(refMs * (mode === "single" ? 1 : 4.5)) });
      for (const c of s.candidates) {
        const measure = mode === "single" ? c.single : c.default;
        if (!measure && !c.failed) continue;
        const label = sideLabel(c.build, mode);
        const ratio = measure && !c.failed ? iv(measure.ratio, measure.spread, rounds.accepted, measure.bounds) : null;
        summarySides.push({ label, role: "cand", mode, wallMs: ratio ? iv(refMs * ratio.estimate) : null, cpuMs: ratio ? iv(refMs * ratio.estimate * 3) : null });
        candidates.push({
          label,
          ref: sideLabel(s.ref, mode),
          mode,
          state: c.failed ? "failed" : "measured",
          wallRatio: ratio,
          cpuRatio: ratio ? iv(ratio.estimate * 0.8, 0.05, rounds.accepted) : null,
          call: c.failed ? null : (measure?.call ?? null),
          sameWithin: 0.05,
        });
      }
    }
  } else {
    const refMetrics = new Map(defined(s.refMetrics));
    summarySides.push({
      label: sideLabel(s.ref, "default"),
      role: "ref",
      mode: "default",
      metrics: Object.fromEntries([...refMetrics].map(([k, v]) => [k, iv(v)])),
    });
    for (const c of s.candidates) {
      const label = sideLabel(c.build, "default");
      const metrics = defined(c.metrics).map(([k, x]) => [k, c.failed ? null : iv(x.ratio, x.spread, rounds.accepted, x.bounds), x] as const);
      summarySides.push({
        label,
        role: "cand",
        mode: "default",
        metrics: Object.fromEntries(metrics.map(([k, r]) => [k, r ? iv((refMetrics.get(k) ?? 100) * r.estimate) : null])),
      });
      candidates.push({
        label,
        ref: sideLabel(s.ref, "default"),
        mode: "default",
        state: c.failed ? "failed" : "measured",
        metrics: Object.fromEntries(metrics.map(([k, r, x]) => [k, { ratio: r, call: r ? x.call : null, sameWithin: 0.05 }])),
      });
    }
  }

  const body: Omit<FixtureResult, "id"> = {
    schema: "parallax.result/1",
    kind: s.kind,
    publishedAt: s.finishedAt,
    machine: { id: m.id },
    project: { ...project, commit: hex(`${s.project} commit`, 40), clean: s.projectClean ?? true },
    harness: { name: "parallax", version: "0.0.0", gitCommit: HARNESS_COMMIT, gitDirty: false, node: "v24.11.0" },
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
    settings: { threads: modes, runs: rounds.planned, maxRuns: rounds.max, minRounds: 3, resolution: 0.05, resolutionMs: 1 },
    sides,
    notes: s.notes ?? [],
    createdAt: s.finishedAt,
    finishedAt: s.finishedAt,
    records: [],
    summary: {
      schema: s.kind === "cli-bench" ? "parallax.bench-summary/1" : "parallax.lsp-bench-summary/1",
      rounds,
      minRounds: 3,
      confidence: 0.95,
      rejections: s.rejections ?? {},
      sides: summarySides,
      candidates,
      settled: s.settled ?? true,
      clean: true,
    },
  };
  // Like a published id: a hash of the result without it, 16 hex digits.
  return { ...body, id: createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16) };
}

const fast = (ratio: number, spread?: number): Measure => ({ ratio, call: "faster", spread });

/** Every fixture result, by the name scenarios use for it. */
export const RESULTS = {
  // The typical result: three candidates, both thread modes, every call "faster".
  honoLinux: makeResult({
    kind: "cli-bench",
    project: "hono",
    machine: "linux",
    finishedAt: "2026-11-10T09:12:00.000Z",
    ref: "tsc702",
    refMs: { default: 340, single: 820 },
    candidates: [
      { build: "tsrs", default: fast(0.32), single: fast(0.27) },
      { build: "fork", default: fast(0.35), single: fast(0.45) },
      { build: "tsc71", default: fast(0.77), single: fast(0.72) },
    ],
    rounds: { attempts: 7, rejected: 1 },
    rejections: { "canary slower than the fastest canary": 1 },
  }),
  // A second machine: "same" and "slower".
  honoMac: makeResult({
    kind: "cli-bench",
    project: "hono",
    machine: "mac",
    finishedAt: "2026-11-12T18:40:00.000Z",
    ref: "tsc702",
    refMs: { default: 290 },
    candidates: [
      { build: "tsrs", default: { ratio: 1.01, call: "same", spread: 0.02 } },
      { build: "fork", default: { ratio: 1.18, call: "slower", spread: 0.04 } },
    ],
  }),
  // A noisy result: an interval that spans "same", an unregistered binary, unsettled, with notes.
  honoWindows: makeResult({
    kind: "cli-bench",
    project: "hono",
    machine: "windows",
    finishedAt: "2026-11-14T07:05:00.000Z",
    ref: "tsc702",
    refMs: { default: 410 },
    candidates: [
      { build: "tsrs", default: { ratio: 0.93, call: "unresolved", bounds: [0.62, 1.38] } },
      { build: "forkLocal", default: fast(0.4, 0.08) },
    ],
    rounds: { planned: 6, accepted: 15, attempts: 21, rejected: 6 },
    settled: false,
    notes: ["load rose above the idle gate during 6 rounds; they were rejected and re-run", "the machine's power plan is Balanced, not High performance"],
    rejections: { "outside load over 1 core": 4, "canary drift over 10%": 2 },
  }),
  umamiLinux: makeResult({
    kind: "cli-bench",
    project: "umami",
    machine: "linux",
    finishedAt: "2026-11-11T09:30:00.000Z",
    ref: "tsc702",
    refMs: { default: 1250, single: 3900 },
    candidates: [
      { build: "tsrs", default: fast(0.41), single: fast(0.33) },
      { build: "fork", default: fast(0.29), single: fast(0.52) },
    ],
  }),
  // Every edge at once: a long project name, a long build label, a failed candidate, too few
  // rounds, a dirty project, Low Power Mode on battery, lowered priority.
  edge: makeResult({
    kind: "cli-bench",
    project: "long",
    machine: "laptop",
    finishedAt: "2026-11-09T22:15:00.000Z",
    ref: "tsc702",
    refMs: { default: 5120 },
    candidates: [
      { build: "tsrsNightly", default: { ratio: 0.21, call: "too few rounds", spread: 0.2 } },
      { build: "fork", failed: true },
      { build: "tsc71", default: { ratio: 0.023, call: "faster", spread: 0.1 } },
    ],
    rounds: { planned: 6, accepted: 2, attempts: 9, rejected: 3, failed: 4 },
    settled: false,
    notes: ["running on battery in Low Power Mode: results are slower and noisier than on AC power", "the harness ran at lowered priority (nice 10)", "tsc-rs-fork failed every round: exit code 101"],
    rejections: { "canary slower than the fastest canary": 2, "outside load over 1 core": 1 },
    projectClean: false,
    priority: 10,
  }),
  // Language-server benches: a subset of metrics, with every call.
  honoLsp: makeResult({
    kind: "lsp-bench",
    project: "hono",
    machine: "linux",
    finishedAt: "2026-11-15T11:00:00.000Z",
    ref: "tsc702",
    refMetrics: {
      "open.firstDiagnosticsMs": 1850,
      "open.initializeMs": 120,
      "edit.firstRequestMs": 85,
      "edit.diagnosticsMs": 240,
      "typing.completionP50Ms": 38,
      "typing.completionP95Ms": 96,
      "session.memoryBytes": 912 * 2 ** 20,
    },
    candidates: [
      {
        build: "tsrs",
        metrics: {
          "open.firstDiagnosticsMs": fast(0.42),
          "open.initializeMs": { ratio: 1.02, call: "same" },
          "edit.firstRequestMs": fast(0.6),
          "edit.diagnosticsMs": fast(0.5),
          "typing.completionP50Ms": { ratio: 0.97, call: "unresolved", bounds: [0.7, 1.3] },
          "typing.completionP95Ms": { ratio: 1.3, call: "slower" },
          "session.memoryBytes": fast(0.55),
        },
      },
      {
        build: "fork",
        metrics: {
          "open.firstDiagnosticsMs": fast(0.38),
          "open.initializeMs": { ratio: 1.6, call: "slower" },
          "edit.firstRequestMs": fast(0.7),
          "edit.diagnosticsMs": fast(0.45),
          "typing.completionP50Ms": fast(0.8),
          "typing.completionP95Ms": fast(0.85),
          "session.memoryBytes": { ratio: 1.4, call: "slower" },
        },
      },
    ],
  }),
  umamiLspMac: makeResult({
    kind: "lsp-bench",
    project: "umami",
    machine: "mac",
    finishedAt: "2026-11-16T15:20:00.000Z",
    ref: "tsc702",
    refMetrics: { "open.firstDiagnosticsMs": 4200, "edit.diagnosticsMs": 610, "session.memoryBytes": 2100 * 2 ** 20 },
    candidates: [
      {
        build: "tsrs",
        metrics: { "open.firstDiagnosticsMs": fast(0.5), "edit.diagnosticsMs": fast(0.62), "session.memoryBytes": fast(0.7) },
      },
    ],
  }),
};
export type ResultName = keyof typeof RESULTS;

/** Which results each stub set publishes. */
export const SETS: Record<StubSet, readonly ResultName[]> = {
  empty: [],
  one: ["honoLinux"],
  many: ["honoLinux", "honoMac", "honoWindows", "umamiLinux", "edge", "honoLsp", "umamiLspMac"],
};

/** A result's repository path, as `parallax publish` names it. */
const resultPath = (r: FixtureResult): string =>
  `results/${r.kind}/${r.project.name}/${r.finishedAt.slice(0, 10)}-${r.machine.id.slice(0, 8)}-${r.id.slice(0, 8)}.json`;

/** A set's index, exactly as build-index makes it (with a fixed generatedAt). */
export function stubIndex(set: StubSet): Index {
  const results = SETS[set].map((name) => ({ file: resultPath(RESULTS[name]), result: RESULTS[name] }));
  return { ...buildIndex(results, REGISTRY), generatedAt: "2026-11-17T00:00:00.000Z" };
}

/**
 * Writes each set to `<out>/<set>/`: `results/` (the files, in the repository's layout) and
 * `data/` (what the site loads: index.json and results/<id>.json). Returns the data directories.
 */
export function writeFixtureSets(out = FIXTURES_OUT): Record<StubSet, string> {
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
