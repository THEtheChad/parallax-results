// The table view behind the chart: every comparison on screen, sortable, each linked to its result.
// Everything the chart shows can be read here without hovering.

import { Link } from "@tanstack/react-router";
import { createColumnHelper, createSortedRowModel, rowSortingFeature, sortFn_alphanumeric, tableFeatures, useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { callText, fmtInterval, fmtValue, platformName } from "../../data/format.ts";
import type { Build, Comparison, MetricInfo, ResultSummary } from "../../data/model.ts";

interface Row {
  id: string;
  result: string;
  build: string;
  implementation: string;
  mode: string;
  ratio: number;
  ratioText: string;
  call: string;
  candidate: string;
  reference: string;
  machine: string;
  date: string;
}

const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel(), sortFns: { alphanumeric: sortFn_alphanumeric } });
const helper = createColumnHelper<typeof features, Row>();
const columns = helper.columns([
  helper.accessor("build", { header: "Build", cell: (c) => c.getValue(), sortFn: "alphanumeric" }),
  helper.accessor("mode", { header: "Threads", cell: (c) => c.getValue() }),
  helper.accessor("ratio", { header: "Ratio (interval)", cell: (c) => c.row.original.ratioText }),
  helper.accessor("call", { header: "Call", cell: (c) => <span className="call" data-call={c.row.original.call.split(" ±")[0]}>{c.getValue()}</span> }),
  helper.accessor("candidate", { header: "Candidate", cell: (c) => c.getValue(), enableSorting: false }),
  helper.accessor("reference", { header: "Reference", cell: (c) => c.getValue(), enableSorting: false }),
  helper.accessor("machine", { header: "Machine", cell: (c) => c.getValue() }),
  helper.accessor("date", { header: "Date", cell: (c) => c.getValue() }),
  helper.accessor("result", {
    header: "Result",
    enableSorting: false,
    cell: (c) => (
      <Link to="/result/$id" params={{ id: c.getValue() }}>
        {c.getValue().slice(0, 8)}
      </Link>
    ),
  }),
]);

const NUMERIC = new Set(["ratio", "candidate", "reference"]);

export interface ComparisonTableProps {
  comparisons: Comparison[];
  builds: Map<string, Build>;
  results: Map<string, ResultSummary>;
  metric: MetricInfo;
}

export function ComparisonTable({ comparisons, builds, results, metric }: ComparisonTableProps) {
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
          mode: c.mode === "single" ? "single" : "default",
          ratio: c.ratio.estimate,
          ratioText: fmtInterval(c.ratio),
          call: callText(c.call, c.sameWithin),
          candidate: fmtValue(c.candidateValue, metric.unit),
          reference: fmtValue(c.referenceValue, metric.unit),
          machine: `${platformName(r.machine.platform)}, ${r.machine.cpuModel}`,
          date: r.date,
        };
      }),
    [comparisons, builds, results, metric],
  );
  const table = useTable({ features, columns, data, initialState: { sorting: [{ id: "ratio", desc: false }] }, getRowId: (r) => r.id });

  return (
    <div className="table-wrap">
      <table>
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
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getAllCells().map((cell) => (
                <td key={cell.id} className={NUMERIC.has(cell.column.id) ? "num" : undefined}>
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
