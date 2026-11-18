// The site's data model: what scripts/build-index.ts writes to data/index.json from results/, and
// what the pages read. One row per comparison: a candidate build against the reference, on one
// metric, in one published result.

export type Kind = "cli-bench" | "lsp-bench";
export type Mode = "default" | "single";
export type Call = "faster" | "slower" | "same" | "unresolved" | "too few rounds";

export interface Interval {
  estimate: number;
  low: number;
  high: number;
  confidence: number;
  n: number;
}

// A build: one binary, named through builds.json when it is known there.
export interface Build {
  // Grouping key: "<implementation>@<version>" for a registered build, "sha:<first 12>" otherwise.
  key: string;
  label: string;
  implementation: string;
  version: string | null;
  // Every binary seen for this build (one per platform), first 16 hex digits.
  shas: string[];
  known: boolean;
  source: string | null;
}

export interface Machine {
  // First 8 characters of the published random machine id.
  id: string;
  platform: string;
  arch: string;
  cpuModel: string;
  cpus: number;
}

export interface ResultSummary {
  id: string;
  // Path of the result in the repository.
  file: string;
  kind: Kind;
  project: string;
  suite: boolean;
  projectCommit: string | null;
  date: string;
  machine: Machine;
  harnessCommit: string | null;
  roundsAccepted: number;
  confidence: number | null;
  settled: boolean | null;
  notes: string[];
  // Build keys of the reference(s) and candidates in this result.
  builds: string[];
}

export interface Comparison {
  // Stable across rebuilds of the index: result id, candidate label, metric.
  id: string;
  result: string;
  kind: Kind;
  project: string;
  metric: string;
  mode: Mode;
  candidate: string;
  reference: string;
  ratio: Interval;
  call: Call | null;
  sameWithin: number | null;
  // The two sides' own figures (median over rounds), in the metric's unit.
  candidateValue: number | null;
  referenceValue: number | null;
}

export interface Index {
  schema: "parallax.results-index/1";
  generatedAt: string;
  builds: Build[];
  results: ResultSummary[];
  comparisons: Comparison[];
}

export interface MetricInfo {
  key: string;
  label: string;
  unit: "ms" | "bytes";
  // Has a call (ratios without one are shown, not judged).
  called: boolean;
}

// Metric keys and labels, in report order. CLI metrics are "cli.*"; language-server metrics keep
// their lsp-bench keys.
export const METRICS: Record<Kind, MetricInfo[]> = {
  "cli-bench": [
    { key: "cli.wallMs", label: "wall time", unit: "ms", called: true },
    { key: "cli.cpuMs", label: "CPU time", unit: "ms", called: false },
  ],
  "lsp-bench": [
    { key: "open.firstDiagnosticsMs", label: "open: first diagnostics", unit: "ms", called: true },
    { key: "open.initializeMs", label: "open: initialize", unit: "ms", called: true },
    { key: "open.cpuMs", label: "open: server CPU", unit: "ms", called: true },
    { key: "edit.firstRequestMs", label: "edit: first request after", unit: "ms", called: true },
    { key: "edit.secondRequestMs", label: "edit: second request", unit: "ms", called: true },
    { key: "edit.diagnosticsMs", label: "edit: diagnostics", unit: "ms", called: true },
    { key: "edit.cpuPerEditMs", label: "edit: CPU per edit", unit: "ms", called: true },
    { key: "typing.completionP50Ms", label: "typing: completion p50", unit: "ms", called: true },
    { key: "typing.completionP95Ms", label: "typing: completion p95", unit: "ms", called: true },
    { key: "typing.diagnosticP50Ms", label: "typing: diagnostics p50", unit: "ms", called: true },
    { key: "typing.diagnosticP95Ms", label: "typing: diagnostics p95", unit: "ms", called: true },
    { key: "typing.hoverP50Ms", label: "typing: hover p50", unit: "ms", called: true },
    { key: "typing.semanticTokensP50Ms", label: "typing: semantic tokens p50", unit: "ms", called: true },
    { key: "typing.inlayHintP50Ms", label: "typing: inlay hints p50", unit: "ms", called: true },
    { key: "typing.cpuPerKeyMs", label: "typing: CPU per key", unit: "ms", called: true },
    { key: "service.keyP50Ms", label: "service: per key p50", unit: "ms", called: true },
    { key: "service.completionP50Ms", label: "service: completion p50", unit: "ms", called: true },
    { key: "service.diagnosticP50Ms", label: "service: diagnostics p50", unit: "ms", called: true },
    { key: "service.cpuPerKeyMs", label: "service: CPU per key", unit: "ms", called: true },
    { key: "session.memoryBytes", label: "session: memory", unit: "bytes", called: true },
  ],
};

export const KIND_LABEL: Record<Kind, string> = { "cli-bench": "Command line", "lsp-bench": "Language server" };

export const metricInfo = (kind: Kind, key: string): MetricInfo | undefined => METRICS[kind].find((m) => m.key === key);
