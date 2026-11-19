// The compare page. First the answer (the billboard: the selection's lowest observed time, raced
// against the others in one result), then the filters and build chips (all in the URL, so a view is
// a link), the ratio chart across every result, and its table. Hovering, focusing or tapping an
// implementation anywhere spotlights it everywhere.

import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { directionText, fmtPercent, implementationSlots, measureNoun, measureOf, platformName } from "../../data/format.ts";
import { KIND_LABEL, METRICS, metricInfo, type Comparison, type Kind } from "../../data/model.ts";
import { useIndex } from "../../data/useIndex.ts";
import { ComparisonTable } from "../ComparisonTable/ComparisonTable.tsx";
import { RatioChart, type ChartRow } from "../RatioChart/RatioChart.tsx";
import { Section } from "../Section/Section.tsx";
import { Billboard } from "./components/Billboard/Billboard.tsx";
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
  // The result the billboard races (defaults to the newest in the selection).
  run?: string;
}

const route = getRouteApi("/");

const LAST = "parallax-results-compare";
function rememberCompare(search: CompareSearch): void {
  try {
    sessionStorage.setItem(LAST, JSON.stringify(search));
  } catch {
    // Storage may be unavailable; the nav then opens Compare at its defaults.
  }
}
// The compare view last seen in this tab, for the Pages nav.
export function lastCompare(): CompareSearch {
  try {
    return JSON.parse(sessionStorage.getItem(LAST) ?? "{}") as CompareSearch;
  } catch {
    return {};
  }
}

const unique = <T,>(xs: T[]): T[] => [...new Set(xs)];
const mostCommon = (xs: string[]): string | undefined => {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
};
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function CompareView() {
  const index = useIndex();
  const search = route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const set = useCallback(
    (patch: Partial<CompareSearch>) => navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true, resetScroll: false }),
    [navigate],
  );
  const [spot, setSpot] = useState<string | null>(null);
  // Remember this view, so the Pages nav's Compare returns to it from another page.
  useEffect(() => rememberCompare(search), [search]);

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
  // Rows in speed order: the lowest median ratio across the row's results first. The median only
  // orders the rows; every result keeps its own dot.
  const rows = useMemo<ChartRow[]>(() => {
    const byRow = new Map<string, Comparison[]>();
    for (const c of shown) byRow.set(rowKey(c), [...(byRow.get(rowKey(c)) ?? []), c]);
    return [...byRow.entries()]
      .map(([key, list]) => {
        const [build, mode] = key.split("|");
        const b = builds.get(build!)!;
        return {
          key,
          label: `${b.label}${mode === "single" ? " · 1 thread" : ""}`,
          implementation: b.implementation,
          order: median(list.map((c) => c.ratio.estimate)),
        };
      })
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
      .map(({ key, label, implementation }) => ({ key, label, implementation }));
  }, [shown, rowKey, builds]);
  // A "same" band is drawn only when every comparison on screen shares one resolution.
  const resolutions = unique(shown.map((c) => c.sameWithin));
  const sameWithin = resolutions.length === 1 ? resolutions[0]! : null;
  const machines = unique(shown.map((c) => results.get(c.result)!.machine.id)).length;
  const resultCount = unique(shown.map((c) => c.result)).length;
  const confidences = unique(shown.map((c) => fmtPercent(c.ratio.confidence)));

  // The billboard races one result: the chosen run, else the newest in the selection.
  const runs = unique(withRef.map((c) => c.result))
    .map((id) => results.get(id)!)
    .sort((a, b) => b.date.localeCompare(a.date) || a.machine.id.localeCompare(b.machine.id));
  const run = runs.find((r) => r.id === search.run) ?? runs[0];

  const onSelect = useCallback((id: string) => navigate({ to: "/result/$id", params: { id } }), [navigate]);

  if (!index.comparisons.length) {
    return (
      <div className="state">
        <h1>blank tape</h1>
        <p>No results have been published yet. Be the first: run the suite on your machine and open a pull request.</p>
        <div className="actions">
          <Link className="btn primary" to="/about" hash="contribute">
            Run it on your machine
          </Link>
        </div>
      </div>
    );
  }

  const refLabel = ref ? builds.get(ref)!.label : "–";

  return (
    <>
      {metric && run ? (
        <Billboard
          kind={KIND_LABEL[kind]}
          project={project ?? "–"}
          metric={metric}
          reference={ref}
          comparisons={withRef.filter((c) => c.result === run.id && !hidden.has(c.candidate) && (threads === "single" ? c.mode === "single" : c.mode === "default"))}
          mode={threads === "single" ? "single" : "default"}
          run={run}
          runs={runs}
          onRun={(id) => set({ run: id === runs[0]?.id ? undefined : id })}
          builds={builds}
          slots={slots}
          scope={{ results: resultCount, machines }}
          bothModes={threads === "both"}
          spot={spot}
          onSpot={setSpot}
        />
      ) : (
        <h1 className="kicker">Compare · {project}</h1>
      )}

      <Section n="01" word="tune in" id="filters" aside="every choice is in the link">
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
            return { key, label: b.label, implementation: b.implementation, slot: slots.get(b.implementation) ?? 5, shown: !hidden.has(key) };
          })}
          spot={spot}
          onSpot={setSpot}
          onChange={(patch) => set({ ...patch, run: undefined })}
          onToggle={(key) => {
            const next = new Set(hidden);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            set({ hide: [...next].join(",") || undefined });
          }}
        />
      </Section>

      {metric ? (
        <>
          <Section
            n="02"
            word="the spread"
            id="chart"
            aside={`${resultCount} result${resultCount === 1 ? "" : "s"} · ${machines} machine${machines === 1 ? "" : "s"}`}
            sub={
              <>
                <strong>
                  {metric.label} on {project}
                </strong>
                , each build's {measureNoun(measureOf(metric))} divided by {refLabel}'s, measured in the same rounds on the same
                machine. One mark is one result, its line the {confidences.length ? `${confidences.join(", ")} ` : ""}interval; {directionText(measureOf(metric))}.
                Machines are never averaged: their spread is the evidence.
                {metric.called ? "" : " This metric is shown for context and gets no call."}
              </>
            }
          >
            <div className="panel">
              {rows.length ? (
                <RatioChart
                  comparisons={shown}
                  rows={rows}
                  rowOf={rowKey}
                  builds={builds}
                  results={results}
                  slots={slots}
                  metric={metric}
                  referenceLabel={refLabel}
                  sameWithin={sameWithin}
                  spot={spot}
                  onSpot={setSpot}
                  onSelect={onSelect}
                />
              ) : (
                <p className="empty">Nothing left to show: every build is hidden. Switch one back on above.</p>
              )}
              <details className="explain">
                <summary>How to read an interval and a call</summary>
                <p>
                  A mark sits at the median ratio over the result's rounds; its line is the distribution-free interval at the stated
                  confidence. A ratio of 0.5× takes half the reference's {measureNoun(measureOf(metric))}. The call, as Parallax makes it:{" "}
                  <em>{measureOf(metric) === "time" ? "faster" : "lower"}</em> when the whole interval lies below 1× and the estimate is at
                  least 1% under it, <em>{measureOf(metric) === "time" ? "slower" : "higher"}</em> when it lies wholly above;{" "}
                  <em>same ±r</em> when the whole interval lies within the resolution r around 1×; <em>unresolved</em> when none of these
                  holds, which more rounds would settle; <em>too few rounds</em> when the interval cannot reach the confidence a call needs.
                  In the tables, an estimate without a settled call is marked "~".
                  {sameWithin === null && shown.some((c) => c.sameWithin !== null)
                    ? " The results on screen use different resolutions, so no shared band is drawn."
                    : ""}{" "}
                  The method is in <a href="https://github.com/THEtheChad/parallax/blob/main/docs/measurement.md">docs/measurement.md</a>.
                </p>
              </details>
            </div>
          </Section>

          <Section n="03" word="liner notes" id="table" sub="Every comparison on screen, with each side's own figure. Select a result to see where it came from.">
            <div className="liner">
              <ComparisonTable
                label={`Side A · ${project} · vs ${refLabel}`}
                file={`parallax-${project}-${metric.key}`}
                comparisons={shown}
                builds={builds}
                results={results}
                metric={metric}
                slots={slots}
                spot={spot}
                onSpot={setSpot}
              />
            </div>
          </Section>
        </>
      ) : (
        <p className="empty">No metric has results for this selection.</p>
      )}
    </>
  );
}
