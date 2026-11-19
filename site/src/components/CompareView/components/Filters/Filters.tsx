// The filters: every choice scopes the billboard, the chart and the table. Up to five choices are a
// segmented control; longer lists are a roomy select. Build chips show and hide candidates, each in
// its implementation's colour and shape, and spotlight it on hover or focus. On a phone the whole
// panel folds behind one button that names the current selection.

import { useState } from "react";
import type { Kind, MetricInfo } from "../../../../data/model.ts";
import { Segmented, type Choice } from "../../../Segmented/Segmented.tsx";
import { Shape } from "../../../Shape/Shape.tsx";
import type { CompareSearch, Threads } from "../../CompareView.tsx";

export interface FiltersProps {
  kinds: Choice<Kind>[];
  kind: Kind;
  projects: string[];
  project: string | undefined;
  metrics: MetricInfo[];
  metric: string | undefined;
  threads: Threads;
  oses: Choice<string>[];
  os: string;
  refs: Choice<string>[];
  reference: string | undefined;
  candidates: { key: string; label: string; implementation: string; slot: number; shown: boolean }[];
  spot: string | null;
  onSpot: (implementation: string | null) => void;
  onChange: (patch: Partial<CompareSearch>) => void;
  onToggle: (key: string) => void;
}

function Select(props: { label: string; value: string | undefined; options: Choice<string>[]; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <select className="select" value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value)} disabled={props.options.length < 2}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// Segmented when it fits, a select when the list is long.
function Choose(props: { label: string; value: string; choices: Choice<string>[]; onChange: (v: string) => void }) {
  return props.choices.length <= 5 ? <Segmented {...props} /> : <Select label={props.label} value={props.value} options={props.choices} onChange={props.onChange} />;
}

const THREADS: Choice<Threads>[] = [
  { value: "both", label: "both" },
  { value: "default", label: "default" },
  { value: "single", label: "1 thread" },
];

export function Filters(p: FiltersProps) {
  const [open, setOpen] = useState(false);
  const metricLabel = p.metrics.find((m) => m.key === p.metric)?.label ?? "–";
  return (
    <div className="panel">
      <button type="button" className="btn filters-toggle" aria-expanded={open} aria-controls="filters-body" onClick={() => setOpen((o) => !o)}>
        <span>Filters</span>
        <span className="current">
          {p.project} · {metricLabel} · {p.threads === "both" ? "both thread modes" : p.threads === "single" ? "1 thread" : "default threads"}
        </span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      <div className="filters-body" id="filters-body" data-open={open}>
        <div className="filters">
          <Choose label="Benchmark" value={p.kind} choices={p.kinds} onChange={(kind) => p.onChange({ kind: kind as Kind, metric: undefined, project: undefined, ref: undefined })} />
          <Choose label="Project" value={p.project ?? ""} choices={p.projects.map((x) => ({ value: x, label: x }))} onChange={(project) => p.onChange({ project, ref: undefined })} />
          <Select label="Metric" value={p.metric} options={p.metrics.map((m) => ({ value: m.key, label: m.label }))} onChange={(metric) => p.onChange({ metric })} />
          <Segmented<Threads> label="Threads" value={p.threads} choices={THREADS} onChange={(threads) => p.onChange({ threads: threads === "both" ? undefined : threads })} />
          <Choose label="OS" value={p.os} choices={[{ value: "all", label: "all" }, ...p.oses]} onChange={(os) => p.onChange({ os: os === "all" ? undefined : os })} />
          <Select label="Reference" value={p.reference} options={p.refs} onChange={(ref) => p.onChange({ ref })} />
        </div>
        {p.candidates.length > 0 && (
          <div className="chips" role="group" aria-label="Builds shown">
            {p.candidates.map((c) => (
              <button
                key={c.key}
                type="button"
                className="chip"
                aria-pressed={c.shown}
                style={{ ["--c" as string]: `var(--series-${c.slot})` }}
                data-dim={c.shown && p.spot !== null && p.spot !== c.implementation}
                onClick={() => p.onToggle(c.key)}
                onMouseEnter={() => c.shown && p.onSpot(c.implementation)}
                onMouseLeave={() => p.onSpot(null)}
                onFocus={() => c.shown && p.onSpot(c.implementation)}
                onBlur={() => p.onSpot(null)}
              >
                <Shape slot={c.slot} size={14} hollow={!c.shown} />
                {c.label}
                <span className="chip-state">{c.shown ? "on" : "off"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
