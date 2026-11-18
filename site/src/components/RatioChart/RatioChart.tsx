// Ratio-to-reference dot plot: one row per candidate build (and thread mode), one dot per result at
// the median ratio, its interval as a line through it, against the reference at 1 and the "same"
// band around it. ECharts animates every change: each dot carries a stable id, so when a filter
// changes, dots that stay slide to their new place, new ones fade in and dropped ones fade out.

import { useEffect, useMemo, useRef } from "react";
import type { EChartsOption, CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams } from "echarts";
import { escapeHtml, fmtInterval, fmtPercent, fmtRatio, fmtValue, callText, platformName, readRatio } from "../../data/format.ts";
import type { Build, Comparison, MetricInfo, ResultSummary } from "../../data/model.ts";
import { cssVar, useThemeVersion } from "../../theme.ts";

export interface ChartRow {
  key: string;
  label: string;
  implementation: string;
}

export interface RatioChartProps {
  comparisons: Comparison[];
  rows: ChartRow[];
  rowOf: (c: Comparison) => string;
  builds: Map<string, Build>;
  results: Map<string, ResultSummary>;
  slots: Map<string, number>;
  metric: MetricInfo;
  // The relative "same" band to shade (the resolution most comparisons used).
  sameWithin: number | null;
  onSelect?: (resultId: string) => void;
}

const ROW_HEIGHT = 44;

export function RatioChart(props: RatioChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ReturnType<typeof echarts.init> | null>(null);
  const theme = useThemeVersion();
  const height = Math.max(160, props.rows.length * ROW_HEIGHT + 96);

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, null, { renderer: "svg" });
    chart.current = c;
    const resize = new ResizeObserver(() => c.resize());
    resize.observe(el.current);
    return () => {
      resize.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const select = props.onSelect;
    c.off("click");
    if (select) c.on("click", (p) => {
      const id = (p.data as { result?: string } | undefined)?.result;
      if (id) select(id);
    });
  }, [props.onSelect]);

  const option = useMemo(() => buildOption(props), [props, theme]);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.resize({ height });
    // replaceMerge drops series no longer present; series that remain are merged, so their data
    // items are matched by id and animate. If an update fails, draw afresh rather than lose the page.
    try {
      c.setOption(option, { replaceMerge: ["series"] });
    } catch (e) {
      console.error("chart update failed; redrawing", e);
      c.clear();
      c.setOption(option);
    }
  }, [option, height]);

  return <div ref={el} className="chart" style={{ height }} role="img" aria-label={`Ratio to the reference, ${props.metric.label}, by build`} />;
}

interface Item {
  id: string;
  result: string;
  value: [low: number, high: number, estimate: number, y: number];
}

// Width of the widest row label, so the plot starts after it (ECharts does not reserve room for
// labels placed with customValues).
function labelWidth(labels: string[]): number {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return 200;
  ctx.font = '12px system-ui, -apple-system, "Segoe UI", sans-serif';
  return Math.ceil(Math.max(0, ...labels.map((l) => ctx.measureText(l).width)));
}

const axisRatio = (v: number): string => `${Number(v.toFixed(3))}×`;

function buildOption(p: RatioChartProps): EChartsOption {
  const color = (implementation: string): string => cssVar(`--series-${p.slots.get(implementation) ?? 5}`);
  const surface = cssVar("--surface-1");
  const muted = cssVar("--text-muted");
  const secondary = cssVar("--text-secondary");
  const primary = cssVar("--text-primary");
  const grid = cssVar("--grid");
  const axis = cssVar("--axis");
  const rowIndex = new Map(p.rows.map((r, i) => [r.key, i]));

  // Dots of one row spread a little around its line, in a stable order (date, then machine).
  const byRow = new Map<string, Comparison[]>();
  for (const c of p.comparisons) byRow.set(p.rowOf(c), [...(byRow.get(p.rowOf(c)) ?? []), c]);
  const offset = new Map<string, number>();
  for (const list of byRow.values()) {
    const sorted = [...list].sort((a, b) => {
      const ra = p.results.get(a.result)!;
      const rb = p.results.get(b.result)!;
      return ra.date.localeCompare(rb.date) || ra.machine.id.localeCompare(rb.machine.id) || a.id.localeCompare(b.id);
    });
    const step = Math.min(0.18, 0.7 / Math.max(1, sorted.length - 1));
    sorted.forEach((c, i) => offset.set(c.id, (i - (sorted.length - 1) / 2) * step));
  }

  const lows = p.comparisons.map((c) => c.ratio.low);
  const highs = p.comparisons.map((c) => c.ratio.high);
  // Whole powers of two at both ends, so the log axis has round labels (0.25×, 0.5×, 1×, 2×).
  const lo = 2 ** Math.floor(Math.log2(Math.min(1, ...lows) / 1.05));
  const hi = 2 ** Math.ceil(Math.log2(Math.max(1, ...highs) * 1.05));

  const implementations = [...new Set(p.rows.map((r) => r.implementation))];
  const series = implementations.map((impl) => {
    const data: Item[] = p.comparisons
      .filter((c) => p.builds.get(c.candidate)?.implementation === impl)
      .map((c) => ({
        id: c.id,
        result: c.result,
        value: [c.ratio.low, c.ratio.high, c.ratio.estimate, (rowIndex.get(p.rowOf(c)) ?? 0) + (offset.get(c.id) ?? 0)],
      }));
    const stroke = color(impl);
    return {
      id: `impl:${impl}`,
      name: impl,
      type: "custom" as const,
      coordinateSystem: "cartesian2d",
      encode: { x: [0, 1, 2], y: 3, tooltip: [2] },
      data,
      itemStyle: { color: stroke },
      renderItem: (_params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
        const low = api.coord([api.value(0), api.value(3)]);
        const high = api.coord([api.value(1), api.value(3)]);
        const mid = api.coord([api.value(2), api.value(3)]);
        const [x1, y] = [low[0]!, mid[1]!];
        const x2 = high[0]!;
        // Shapes move to their new place (transition), fade in when they appear and out when they
        // leave. A group has no style to fade, so the fades sit on its children.
        const fade = { enterFrom: { style: { opacity: 0 } }, leaveTo: { style: { opacity: 0 } } };
        return {
          type: "group",
          children: [
            // Hit target: the whole interval, 24px tall, invisible.
            { type: "rect", shape: { x: x1 - 8, y: y - 12, width: Math.max(16, x2 - x1 + 16), height: 24 }, style: { fill: "rgba(0,0,0,0)" }, transition: ["shape"] },
            { type: "line", shape: { x1, y1: y, x2, y2: y }, style: { stroke, lineWidth: 2, lineCap: "round" }, transition: ["shape"], ...fade },
            { type: "circle", shape: { cx: mid[0]!, cy: y, r: 5 }, style: { fill: stroke, stroke: surface, lineWidth: 2 }, transition: ["shape"], ...fade },
          ],
        };
      },
      z: 3,
    };
  });

  const band = p.sameWithin;
  // An empty series carries the reference line and the "same" band, so they never animate with data.
  const reference = {
    id: "reference",
    name: "reference",
    type: "line" as const,
    data: [],
    silent: true,
    markLine: {
      silent: true,
      symbol: "none",
      lineStyle: { color: axis, width: 1, type: "solid" as const },
      label: { formatter: "reference", color: muted, position: "start" as const },
      data: [{ xAxis: 1 }],
    },
    ...(band
      ? {
          markArea: {
            silent: true,
            itemStyle: { color: cssVar("--same-band") },
            label: { show: true, position: "insideTop" as const, formatter: `same ±${Math.round(band * 100)}%`, color: muted, fontSize: 11 },
            data: [[{ xAxis: Math.max(1 - band, lo) }, { xAxis: Math.min(1 + band, hi) }]] as [object, object][],
          },
        }
      : {}),
  };

  return {
    animationDuration: 500,
    animationDurationUpdate: 650,
    animationEasingUpdate: "cubicInOut",
    aria: { enabled: true },
    textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: secondary },
    grid: { left: labelWidth(p.rows.map((r) => r.label)) + 20, right: 32, top: 40, bottom: 44 },
    legend: {
      top: 0,
      left: 0,
      icon: "circle",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: secondary },
      data: implementations,
      selectedMode: false,
    },
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: surface,
      borderColor: cssVar("--border"),
      textStyle: { color: primary, fontSize: 12 },
      formatter: (params) => {
        const item = (Array.isArray(params) ? params[0] : params)?.data as Item | undefined;
        const c = item && p.comparisons.find((x) => x.id === item.id);
        if (!c) return "";
        const r = p.results.get(c.result)!;
        const cand = p.builds.get(c.candidate)!;
        const ref = p.builds.get(c.reference)!;
        const lines = [
          `<div style="font-size:15px;font-weight:600">${escapeHtml(fmtInterval(c.ratio))}</div>`,
          `<div>${escapeHtml(callText(c.call, c.sameWithin))} · ${escapeHtml(fmtPercent(c.ratio.confidence))} interval, ${c.ratio.n} rounds</div>`,
          `<div style="color:${secondary}">${escapeHtml(readRatio(c.ratio.estimate))}</div>`,
          `<div style="margin-top:6px">${escapeHtml(cand.label)}${c.mode === "single" ? " · single-threaded" : ""}: ${escapeHtml(fmtValue(c.candidateValue, p.metric.unit))}</div>`,
          `<div style="color:${secondary}">vs ${escapeHtml(ref.label)}: ${escapeHtml(fmtValue(c.referenceValue, p.metric.unit))}</div>`,
          `<div style="color:${secondary};margin-top:6px">${escapeHtml(platformName(r.machine.platform))} · ${escapeHtml(r.machine.cpuModel)} · ${r.machine.cpus} threads</div>`,
          `<div style="color:${secondary}">${escapeHtml(r.project)} · ${escapeHtml(r.date)} · machine ${escapeHtml(r.machine.id)}</div>`,
        ];
        return lines.join("");
      },
    },
    xAxis: {
      type: "log",
      logBase: 2,
      min: lo,
      max: hi,
      name: "time relative to the reference (lower is faster)",
      nameLocation: "middle",
      nameGap: 26,
      nameTextStyle: { color: muted },
      // The x axis sits at the bottom, not at y = 0 (the first row).
      axisLine: { onZero: false, lineStyle: { color: axis } },
      axisTick: { lineStyle: { color: axis } },
      axisLabel: { color: muted, formatter: (v: number) => axisRatio(v) },
      splitLine: { lineStyle: { color: grid, type: "solid" } },
    },
    yAxis: {
      type: "value",
      inverse: true,
      min: -0.5,
      max: Math.max(0.5, p.rows.length - 0.5),
      interval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      // One label per row, at the row's integer position (the axis itself runs from -0.5).
      axisLabel: {
        color: primary,
        customValues: p.rows.map((_, i) => i),
        formatter: (v: number) => p.rows[v]?.label ?? "",
      },
    },
    series: [reference, ...series],
  } as EChartsOption;
}
