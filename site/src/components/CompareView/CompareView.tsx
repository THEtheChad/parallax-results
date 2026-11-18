// The compare page: one row of filters (all in the URL, so a view is a link), the ratio chart, and
// its table. Changing a filter keeps the chart and animates it to the new selection.

import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { fmtPercent, implementationSlots, platformName } from "../../data/format.ts";
import { KIND_LABEL, METRICS, metricInfo, type Comparison, type Kind } from "../../data/model.ts";
import { useIndex } from "../../data/useIndex.ts";
import { ComparisonTable } from "../ComparisonTable/ComparisonTable.tsx";
import { RatioChart, type ChartRow } from "../RatioChart/RatioChart.tsx";
import { Filters } from "./components/Filters/Filters.tsx";

export type Threads = "both" | "default" | "single";

export interface CompareSearch {
  kind?: Kind;
  project?: string;
  metric?: string;
  threads?: Threads;
  ref?: string;
  os?: string;
  // Build keys hidden from the chart, comma-separated.
  hide?: string;
}

const route = getRouteApi("/");

const unique = <T,>(xs: T[]): T[] => [...new Set(xs)];
const mostCommon = (xs: string[]): string | undefined => {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
};

export function CompareView() {
  const index = useIndex();
  const search = route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const set = useCallback(
    (patch: Partial<CompareSearch>) => navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true, resetScroll: false }),
    [navigate],
  );

  const builds = useMemo(() => new Map(index.builds.map((b) => [b.key, b])), [index]);
  const results = useMemo(() => new Map(index.results.map((r) => [r.id, r])), [index]);
  const slots = useMemo(() => implementationSlots(index.builds), [index]);

  // Each filter's choices come from what the filters before it leave, and an invalid or missing
  // value falls back to the first choice, so any URL shows something.
  const kinds = unique(index.comparisons.map((c) => c.kind)).sort();
  const kind: Kind = search.kind && kinds.includes(search.kind) ? search.kind : (kinds[0] ?? "cli-bench");
  const inKind = index.comparisons.filter((c) => c.kind === kind);
  const projects = unique(inKind.map((c) => c.project)).sort();
  const project = search.project && projects.includes(search.project) ? search.project : projects[0];
  const inProject = inKind.filter((c) => c.project === project);
  const metrics = METRICS[kind].filter((m) => inProject.some((c) => c.metric === m.key));
  const metricKey = search.metric && metrics.some((m) => m.key === search.metric) ? search.metric : metrics[0]?.key;
  const metric = metricKey ? metricInfo(kind, metricKey) : undefined;
  const threads: Threads = search.threads ?? "both";
  const oses = unique(inProject.map((c) => results.get(c.result)!.machine.platform)).sort();
  const os = search.os && oses.includes(search.os) ? search.os : "all";
  const scoped = inProject.filter(
    (c) => c.metric === metricKey && (threads === "both" || c.mode === threads) && (os === "all" || results.get(c.result)!.machine.platform === os),
  );
  const refs = unique(scoped.map((c) => c.reference));
  const ref = search.ref && refs.includes(search.ref) ? search.ref : mostCommon(scoped.map((c) => c.reference));
  const withRef = scoped.filter((c) => c.reference === ref);
  const candidates = unique(withRef.map((c) => c.candidate)).sort((a, b) => builds.get(a)!.label.localeCompare(builds.get(b)!.label));
  const hidden = new Set((search.hide ?? "").split(",").filter(Boolean));
  const shown = withRef.filter((c) => !hidden.has(c.candidate));

  const rowKey = useCallback((c: Comparison) => (threads === "both" ? `${c.candidate}|${c.mode}` : c.candidate), [threads]);
  const rows = useMemo<ChartRow[]>(() => {
    const keys = unique(shown.map(rowKey));
    return keys
      .map((key) => {
        const [build, mode] = key.split("|");
        const b = builds.get(build!)!;
        return { key, label: `${b.label}${mode === "single" ? " · 1 thread" : ""}`, implementation: b.implementation, slot: slots.get(b.implementation) ?? 9 };
      })
      .sort((a, b) => a.slot - b.slot || a.label.localeCompare(b.label))
      .map(({ key, label, implementation }) => ({ key, label, implementation }));
  }, [shown, rowKey, builds, slots]);
  const sameWithin = mostCommon(shown.filter((c) => c.sameWithin !== null).map((c) => String(c.sameWithin)));
  const machines = unique(shown.map((c) => results.get(c.result)!.machine.id)).length;
  const resultCount = unique(shown.map((c) => c.result)).length;
  const confidences = unique(shown.map((c) => fmtPercent(c.ratio.confidence)));

  const onSelect = useCallback((id: string) => navigate({ to: "/result/$id", params: { id } }), [navigate]);

  if (!index.comparisons.length) return <p className="empty">No results have been published yet.</p>;

  return (
    <>
      <p className="lede">
        Each dot is one published result: a candidate build's time divided by the reference's, measured in the same rounds on the same
        machine, with its interval. Below 1 is faster. Results from different machines are never mixed into one number; their spread is
        the evidence.
      </p>
      <Filters
        kinds={kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        kind={kind}
        projects={projects}
        project={project}
        metrics={metrics}
        metric={metricKey}
        threads={threads}
        oses={oses.map((o) => ({ value: o, label: platformName(o) }))}
        os={os}
        refs={refs.map((r) => ({ value: r, label: builds.get(r)!.label }))}
        reference={ref}
        candidates={candidates.map((key) => {
          const b = builds.get(key)!;
          return { key, label: b.label, slot: slots.get(b.implementation) ?? 5, shown: !hidden.has(key) };
        })}
        onChange={set}
        onToggle={(key) => {
          const next = new Set(hidden);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          set({ hide: [...next].join(",") || undefined });
        }}
      />
      {metric ? (
        <>
          <section className="card">
            <h2>
              {metric.label} · {project} · against {ref ? builds.get(ref)!.label : "–"}
            </h2>
            <p className="sub">
              {resultCount} result{resultCount === 1 ? "" : "s"} from {machines} machine{machines === 1 ? "" : "s"}
              {confidences.length ? ` · ${confidences.join(", ")} intervals` : ""}
              {metric.called ? "" : " · shown for context; this metric gets no call"}
            </p>
            {rows.length ? (
              <RatioChart
                comparisons={shown}
                rows={rows}
                rowOf={rowKey}
                builds={builds}
                results={results}
                slots={slots}
                metric={metric}
                sameWithin={sameWithin === undefined ? null : Number(sameWithin)}
                onSelect={onSelect}
              />
            ) : (
              <p className="empty">Nothing left to show: every build is hidden.</p>
            )}
          </section>
          <section className="card">
            <h2>Table</h2>
            <p className="sub">The same comparisons, with each side's own figure.</p>
            <ComparisonTable comparisons={shown} builds={builds} results={results} metric={metric} />
          </section>
        </>
      ) : (
        <p className="empty">No metric has results for this selection.</p>
      )}
    </>
  );
}
