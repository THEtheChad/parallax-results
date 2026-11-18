// The one filter row above the chart and table: every choice scopes both. Build chips show and hide
// candidates; each keeps its implementation's color whatever else is hidden.

import type { Kind, MetricInfo } from "../../../../data/model.ts";
import type { CompareSearch, Threads } from "../../CompareView.tsx";

interface Option<T extends string = string> {
  value: T;
  label: string;
}

export interface FiltersProps {
  kinds: Option<Kind>[];
  kind: Kind;
  projects: string[];
  project: string | undefined;
  metrics: MetricInfo[];
  metric: string | undefined;
  threads: Threads;
  oses: Option[];
  os: string;
  refs: Option[];
  reference: string | undefined;
  candidates: { key: string; label: string; slot: number; shown: boolean }[];
  onChange: (patch: Partial<CompareSearch>) => void;
  onToggle: (key: string) => void;
}

function Select<T extends string>(props: { label: string; value: T | undefined; options: Option<T>[]; onChange: (v: T) => void }) {
  return (
    <label>
      {props.label}
      <select value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value as T)} disabled={props.options.length < 2}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Filters(p: FiltersProps) {
  return (
    <>
      <div className="filters">
        <Select label="Benchmark" value={p.kind} options={p.kinds} onChange={(kind) => p.onChange({ kind, metric: undefined, project: undefined, ref: undefined })} />
        <Select label="Project" value={p.project} options={p.projects.map((x) => ({ value: x, label: x }))} onChange={(project) => p.onChange({ project, ref: undefined })} />
        <Select label="Metric" value={p.metric} options={p.metrics.map((m) => ({ value: m.key, label: m.label }))} onChange={(metric) => p.onChange({ metric })} />
        <Select<Threads>
          label="Threads"
          value={p.threads}
          options={[
            { value: "both", label: "default and single" },
            { value: "default", label: "default" },
            { value: "single", label: "single-threaded" },
          ]}
          onChange={(threads) => p.onChange({ threads: threads === "both" ? undefined : threads })}
        />
        <Select label="OS" value={p.os} options={[{ value: "all", label: "all" }, ...p.oses]} onChange={(os) => p.onChange({ os: os === "all" ? undefined : os })} />
        <Select label="Reference" value={p.reference} options={p.refs} onChange={(ref) => p.onChange({ ref })} />
      </div>
      {p.candidates.length > 0 && (
        <div className="filters" role="group" aria-label="Builds shown">
          <div className="chips">
            {p.candidates.map((c) => (
              <button key={c.key} type="button" className="chip" aria-pressed={c.shown} onClick={() => p.onToggle(c.key)}>
                <span className="key" style={{ background: `var(--series-${c.slot})` }} />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
