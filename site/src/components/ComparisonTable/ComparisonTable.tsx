// The table behind the chart, as liner notes: every comparison on screen, sortable, each linked to its
// result. Everything the chart shows can be read here without hovering: the interval, its confidence
// and rounds, the call, and each side's own figure. On a phone each row is a card. Its downloads are
// exactly the rows on screen, in the order on screen.

import { Link } from "@tanstack/react-router";
import { createColumnHelper, createSortedRowModel, rowSortingFeature, sortFn_alphanumeric, tableFeatures, useTable } from "@tanstack/react-table";
import { useMemo, type ReactNode } from "react";
import { callText, fmtInterval, fmtPercent, fmtValue, measureOf, platformName, speedText } from "../../data/format.ts";
import type { Build, Comparison, MetricInfo, ResultSummary } from "../../data/model.ts";
import { Shape } from "../Shape/Shape.tsx";

interface Row {
  id: string;
  result: string;
  build: string;
  implementation: string;
  slot: number;
  mode: string;
  ratio: number;
  ratioText: string;
  speed: string;
  evidence: string;
  call: string;
  callKind: string;
  candidate: string;
  reference: string;
  machine: string;
  date: string;
}

const round = (v: number | null): number | null => (v === null ? null : Number(v.toPrecision(4)));

// The records a download carries: the table's words, plus the numbers behind them (rounded to four
// significant figures; confidence as a fraction).
export function comparisonRecords(comparisons: Comparison[], builds: Map<string, Build>, results: Map<string, ResultSummary>, metric: MetricInfo): Record<string, string | number | null>[] {
  const measure = measureOf(metric);
  return comparisons.map((c) => {
    const r = results.get(c.result)!;
    return {
      result: c.result,
      project: c.project,
      metric: metric.label,
      candidate: builds.get(c.candidate)?.label ?? c.candidate,
      reference: builds.get(c.reference)?.label ?? c.reference,
      threads: c.mode === "single" ? "1 thread" : "default",
      ratio: round(c.ratio.estimate),
      ratio_low: round(c.ratio.low),
      ratio_high: round(c.ratio.high),
      in_words: speedText(c.ratio.estimate, measure, metric.called ? c.call : null),
      confidence: round(c.ratio.confidence),
      rounds: c.ratio.n,
      call: metric.called ? callText(c.call, c.sameWithin, measure) : "no call",
      [`candidate_${metric.unit}`]: round(c.candidateValue),
      [`reference_${metric.unit}`]: round(c.referenceValue),
      platform: r.machine.platform,
      cpu: r.machine.cpuModel,
      machine: r.machine.id,
      date: r.date,
    };
  });
}

const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel(), sortFns: { alphanumeric: sortFn_alphanumeric } });
const helper = createColumnHelper<typeof features, Row>();
const columns = helper.columns([
  // The track number is the row's place in the current order, filled in when the rows render.
  helper.display({ id: "track", header: "#", cell: () => null }),
  helper.accessor("build", {
    header: "Build",
    sortFn: "alphanumeric",
    cell: (c) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Shape slot={c.row.original.slot} />
        {c.getValue()}
      </span>
    ),
  }),
  helper.accessor("mode", { header: "Threads", cell: (c) => c.getValue() }),
  helper.accessor("ratio", { header: "Ratio (interval)", cell: (c) => c.row.original.ratioText }),
  helper.accessor("speed", { header: "In words", cell: (c) => c.getValue(), enableSorting: false }),
  helper.accessor("call", { header: "Call", cell: (c) => <span className="call" data-call={c.row.original.callKind}>{c.getValue()}</span> }),
  helper.accessor("evidence", { header: "Confidence", cell: (c) => c.getValue(), enableSorting: false }),
  helper.accessor("candidate", { header: "Candidate", cell: (c) => c.getValue(), enableSorting: false }),
  helper.accessor("reference", { header: "Reference", cell: (c) => c.getValue(), enableSorting: false }),
  helper.accessor("machine", { header: "Machine", cell: (c) => c.getValue() }),
  helper.accessor("date", { header: "Date", cell: (c) => c.getValue() }),
  helper.accessor("result", {
    header: "Result",
    enableSorting: false,
    cell: (c) => (
      <Link to="/result/$id" params={{ id: c.getValue() }} aria-label={`Result ${c.getValue().slice(0, 8)}: where this came from`}>
        {c.getValue().slice(0, 8)} →
      </Link>
    ),
  }),
]);

const NUMERIC = new Set(["ratio", "candidate", "reference"]);
const CLASS: Record<string, string> = { track: "track", build: "build" };

function download(name: string, type: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface ComparisonTableProps {
  // The liner's label, and the downloads' file name (without extension).
  label: ReactNode;
  file: string;
  comparisons: Comparison[];
  builds: Map<string, Build>;
  results: Map<string, ResultSummary>;
  metric: MetricInfo;
  slots: Map<string, number>;
  spot: string | null;
  onSpot: (implementation: string | null) => void;
}

export function ComparisonTable({ label, file, comparisons, builds, results, metric, slots, spot, onSpot }: ComparisonTableProps) {
  const data = useMemo<Row[]>(
    () =>
      comparisons.map((c) => {
        const r = results.get(c.result)!;
        const b = builds.get(c.candidate)!;
        return {
          id: c.id,
          result: c.result,
          build: b.label,
          implementation: b.implementation,
          slot: slots.get(b.implementation) ?? 5,
          mode: c.mode === "single" ? "1 thread" : "default",
          ratio: c.ratio.estimate,
          ratioText: fmtInterval(c.ratio),
          speed: speedText(c.ratio.estimate, measureOf(metric), metric.called ? c.call : null),
          evidence: `${fmtPercent(c.ratio.confidence)} · ${c.ratio.n} rounds`,
          call: metric.called ? callText(c.call, c.sameWithin, measureOf(metric)) : "no call",
          callKind: metric.called ? (c.call ?? "") : "",
          candidate: fmtValue(c.candidateValue, metric.unit),
          reference: fmtValue(c.referenceValue, metric.unit),
          machine: `${platformName(r.machine.platform)}, ${r.machine.cpuModel}`,
          date: r.date,
        };
      }),
    [comparisons, builds, results, metric, slots],
  );
  const table = useTable({ features, columns, data, initialState: { sorting: [{ id: "ratio", desc: false }] }, getRowId: (r) => r.id });
  const byId = new Map(comparisons.map((c) => [c.id, c]));
  // What is on screen, in the order on screen.
  const records = () => comparisonRecords(table.getRowModel().rows.map((row) => byId.get(row.original.id)!), builds, results, metric);
  const empty = comparisons.length === 0;

  return (
    <>
      <div className="liner-label">
        <span>{label}</span>
        <span className="tools">
          <button
            type="button"
            className="btn small"
            disabled={empty}
            onClick={() => {
              const recs = records();
              const head = Object.keys(recs[0] ?? {});
              download(`${file}.csv`, "text/csv", [head.join(","), ...recs.map((r) => head.map((h) => csvCell(r[h])).join(","))].join("\n") + "\n");
            }}
          >
            ↓ CSV
          </button>
          <button type="button" className="btn small" disabled={empty} onClick={() => download(`${file}.json`, "application/json", JSON.stringify(records(), null, 2) + "\n")}>
            ↓ JSON
          </button>
        </span>
      </div>
      {empty ? <p className="empty">No rows: every build is hidden.</p> : null}
    <div className="table-wrap" hidden={empty}>
      <table className="cards">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <th key={header.id} className={NUMERIC.has(header.column.id) ? "num" : undefined} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}>
                    {header.column.getCanSort() ? (
                      <button type="button" onClick={header.column.getToggleSortingHandler()}>
                        <table.FlexRender header={header} />
                        {sorted === "asc" ? " ↑" : sorted === "desc" ? " ↓" : ""}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => (
            <tr
              key={row.id}
              data-dim={spot !== null && spot !== row.original.implementation}
              data-spot={spot !== null && spot === row.original.implementation}
              onMouseEnter={() => onSpot(row.original.implementation)}
              onMouseLeave={() => onSpot(null)}
              onFocus={() => onSpot(row.original.implementation)}
              onBlur={() => onSpot(null)}
            >
              {row.getAllCells().map((cell) => {
                const label = typeof cell.column.columnDef.header === "string" ? cell.column.columnDef.header : cell.column.id;
                return (
                  <td key={cell.id} data-label={label} className={[NUMERIC.has(cell.column.id) ? "num" : "", CLASS[cell.column.id] ?? ""].join(" ").trim() || undefined}>
                    {cell.column.id === "track" ? String(i + 1).padStart(2, "0") : <table.FlexRender cell={cell} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
