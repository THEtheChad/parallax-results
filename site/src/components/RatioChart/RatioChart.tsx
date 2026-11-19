// Ratio-to-reference dot plot: one row per candidate build (and thread mode), in speed order, one
// mark per result at the median ratio, its interval as a line through it, against the reference (the
// amber lamp at 1×) and, when every comparison shares one resolution, the "same" band around it.
// Each implementation is drawn in its colour and its shape. ECharts animates every change: each mark
// carries a stable id, so when a filter changes, marks that stay slide to their new place.
//
// Narrow (a phone): the chart re-encodes rather than shrinks. Row labels sit above their marks, so
// the plot keeps the width. A first tap on a mark shows its numbers; a second opens its result.

import { useEffect, useMemo, useRef, useState } from "react";
import type { EChartsOption, CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams } from "echarts";
import { callText, directionText, escapeHtml, fmtInterval, fmtPercent, fmtValue, measureNoun, measureOf, platformName, readRatio, speedText } from "../../data/format.ts";
import type { Build, Comparison, MetricInfo, ResultSummary } from "../../data/model.ts";
import { cssVar, useThemeVersion } from "../../theme.ts";
import { Shape, shapeOfSlot, shapePoints } from "../Shape/Shape.tsx";

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
  referenceLabel: string;
  // The relative "same" band to shade, only when every comparison on screen shares it.
  sameWithin: number | null;
  spot: string | null;
  onSpot: (implementation: string | null) => void;
  onSelect?: (resultId: string) => void;
}

const NARROW = 560;
const FONT = '"Geist Mono Variable", ui-monospace, "SFMono-Regular", Menlo, monospace';

export function RatioChart(props: RatioChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ReturnType<typeof echarts.init> | null>(null);
  const theme = useThemeVersion();
  const [width, setWidth] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const narrow = width > 0 && width < NARROW;
  const rowHeight = narrow ? 64 : 48;
  const height = Math.max(160, props.rows.length * rowHeight + (narrow ? 72 : 80));

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, null, { renderer: "svg" });
    chart.current = c;
    setWidth(el.current.clientWidth);
    const resize = new ResizeObserver(() => {
      c.resize();
      if (el.current) setWidth(el.current.clientWidth);
    });
    resize.observe(el.current);
    // Escape closes an open tooltip.
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") c.dispatchAction({ type: "hideTip" });
    };
    window.addEventListener("keydown", escape);
    // Row labels are measured in the house face; measure again once it has loaded.
    void document.fonts?.ready.then(() => setFontsReady(true));
    return () => {
      window.removeEventListener("keydown", escape);
      resize.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  // Touch: the first tap on a mark shows its tooltip, a second tap on the same mark opens its result.
  // A mouse click opens it at once (hover has already shown the numbers).
  const lastTap = useRef<string | null>(null);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const { onSelect, onSpot } = props;
    c.off("click");
    c.off("mouseover");
    c.off("mouseout");
    c.on("click", (p) => {
      const item = p.data as { id?: string; result?: string } | undefined;
      if (!item?.result || !onSelect) return;
      const native = (p.event as { event?: Event } | undefined)?.event;
      const touch = native ? ("pointerType" in native ? (native as PointerEvent).pointerType === "touch" : native.type.startsWith("touch")) : false;
      if (touch && lastTap.current !== item.id) {
        lastTap.current = item.id ?? null;
        return;
      }
      onSelect(item.result);
    });
    c.on("mouseover", (p) => {
      if (p.seriesId?.startsWith("impl:")) onSpot(p.seriesName ?? null);
    });
    c.on("mouseout", () => onSpot(null));
  }, [props.onSelect, props.onSpot]);

  // The option is rebuilt only when what it draws changes, never for the spotlight: rebuilding
  // under the pointer would replace the mark being hovered (and swallow its click). The spotlight is
  // ECharts' own highlight and blur states, below.
  const latest = useRef(props);
  latest.current = props;
  const drawn = [
    props.comparisons.map((c) => c.id).join(","),
    props.rows.map((r) => r.key).join(","),
    props.metric.key,
    props.referenceLabel,
    props.sameWithin,
  ].join("|");
  const option = useMemo(() => buildOption(latest.current, narrow), [drawn, theme, narrow, fontsReady]);

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
    if (latest.current.spot) c.dispatchAction({ type: "highlight", seriesId: `impl:${latest.current.spot}` });
  }, [option, height]);

  // A spotlight from elsewhere on the page (a chip, a table row, the hero) lights the same series here.
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.dispatchAction({ type: "downplay" });
    if (props.spot) c.dispatchAction({ type: "highlight", seriesId: `impl:${props.spot}` });
  }, [props.spot]);

  const implementations = [...new Set(props.rows.map((r) => r.implementation))];
  return (
    <>
      <ul className="legend" aria-label="Legend">
        {implementations.map((impl) => (
          <li key={impl} data-dim={props.spot !== null && props.spot !== impl}>
            <Shape slot={props.slots.get(impl) ?? 5} size={14} />
            {impl}
          </li>
        ))}
        <li className="ref">1× = {props.referenceLabel}</li>
      </ul>
      <div
        ref={el}
        className="chart"
        style={{ height }}
        role="img"
        aria-label={`${props.metric.label} relative to ${props.referenceLabel}, by build; ${directionText(measureOf(props.metric))}. The table below has every value.`}
      />
    </>
  );
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
  ctx.font = `13px ${FONT}`;
  return Math.ceil(Math.max(0, ...labels.map((l) => ctx.measureText(l).width)));
}

const axisRatio = (v: number): string => `${Number(v.toFixed(3))}×`;

function buildOption(p: RatioChartProps, narrow: boolean): EChartsOption {
  const slotOf = (implementation: string): number => p.slots.get(implementation) ?? 5;
  const color = (implementation: string): string => cssVar(`--series-${slotOf(implementation)}`);
  const surface = cssVar("--surface-1");
  const muted = cssVar("--text-muted");
  const secondary = cssVar("--text-secondary");
  const primary = cssVar("--text-primary");
  const grid = cssVar("--grid");
  const axis = cssVar("--axis");
  const reference = cssVar("--reference");
  const rowIndex = new Map(p.rows.map((r, i) => [r.key, i]));
  const measure = measureOf(p.metric);

  // Marks of one row spread a little around its line, in a stable order (date, then machine).
  const byRow = new Map<string, Comparison[]>();
  for (const c of p.comparisons) byRow.set(p.rowOf(c), [...(byRow.get(p.rowOf(c)) ?? []), c]);
  const offset = new Map<string, number>();
  for (const list of byRow.values()) {
    const sorted = [...list].sort((a, b) => {
      const ra = p.results.get(a.result)!;
      const rb = p.results.get(b.result)!;
      return ra.date.localeCompare(rb.date) || ra.machine.id.localeCompare(rb.machine.id) || a.id.localeCompare(b.id);
    });
    const step = Math.min(0.18, 0.6 / Math.max(1, sorted.length - 1));
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
    const shape = shapeOfSlot(slotOf(impl));
    return {
      id: `impl:${impl}`,
      name: impl,
      type: "custom" as const,
      coordinateSystem: "cartesian2d",
      encode: { x: [0, 1, 2], y: 3, tooltip: [2] },
      data,
      itemStyle: { color: stroke },
      // Hovering a mark, or a spotlight from elsewhere, dims every other implementation.
      emphasis: { focus: "series" as const },
      blur: { itemStyle: { opacity: 0.22 } },
      renderItem: (_params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
        const low = api.coord([api.value(0), api.value(3)]);
        const high = api.coord([api.value(1), api.value(3)]);
        const mid = api.coord([api.value(2), api.value(3)]);
        const [x1, y] = [low[0]!, mid[1]!];
        const x2 = high[0]!;
        const cx = mid[0]!;
        const blur = { blur: { style: { opacity: 0.22 } } };
        // Shapes move to their new place (transition), fade in when they appear and out when they
        // leave. A group has no style to fade, so the fades sit on its children.
        const fade = { enterFrom: { style: { opacity: 0 } }, leaveTo: { style: { opacity: 0 } } };
        const r = 6;
        const mark =
          shape === "circle"
            ? { type: "circle", shape: { cx, cy: y, r } }
            : { type: "polygon", shape: { points: shapePoints(shape, r).map(([px, py]) => [cx + px, y + py]) } };
        return {
          type: "group",
          children: [
            // Hit target: the whole interval, 28px tall, invisible.
            { type: "rect", shape: { x: x1 - 10, y: y - 14, width: Math.max(20, x2 - x1 + 20), height: 28 }, style: { fill: "rgba(0,0,0,0)" }, transition: ["shape"] },
            // The interval: crisp, never glowing, so its ends read exactly.
            { type: "line", shape: { x1, y1: y, x2, y2: y }, style: { stroke, lineWidth: 3, lineCap: "butt" }, transition: ["shape"], ...fade, ...blur },
            { type: "line", shape: { x1, y1: y - 5, x2: x1, y2: y + 5 }, style: { stroke, lineWidth: 2 }, transition: ["shape"], ...fade, ...blur },
            { type: "line", shape: { x1: x2, y1: y - 5, x2, y2: y + 5 }, style: { stroke, lineWidth: 2 }, transition: ["shape"], ...fade, ...blur },
            { ...mark, style: { fill: stroke, stroke: surface, lineWidth: 2 }, transition: ["shape"], ...fade, ...blur },
          ],
        };
      },
      z: 3,
    };
  });

  // Narrow: each row's label above its marks, at the plot's left edge.
  const labels = narrow
    ? [
        {
          id: "labels",
          type: "custom" as const,
          coordinateSystem: "cartesian2d",
          silent: true,
          data: p.rows.map((r, i) => ({ id: `label:${r.key}`, value: [lo, i], label: r.label, impl: r.implementation })),
          renderItem: (params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
            const row = p.rows[params.dataIndex]!;
            const at = api.coord([lo, api.value(1)]);
            return {
              type: "text",
              x: at[0]!,
              y: at[1]! - 26,
              style: { text: row.label, fill: primary, font: `600 12px ${FONT}`, width: Math.max(80, api.getWidth() - 28), overflow: "truncate" },
            };
          },
          z: 2,
        },
      ]
    : [];

  const band = p.sameWithin;
  // An empty series carries the reference lamp and the "same" band, so they never animate with data.
  const referenceSeries = {
    id: "reference",
    name: "reference",
    type: "line" as const,
    data: [],
    silent: true,
    markLine: {
      silent: true,
      symbol: "none",
      lineStyle: { color: reference, width: 2, type: "solid" as const, shadowBlur: 10, shadowColor: reference },
      label: { formatter: "1× reference", color: reference, position: "start" as const, fontFamily: FONT, fontWeight: 700 },
      data: [{ xAxis: 1 }],
    },
    ...(band
      ? {
          markArea: {
            silent: true,
            itemStyle: { color: cssVar("--same-band") },
            label: { show: !narrow, position: "insideBottom" as const, formatter: `same ±${Math.round(band * 100)}%`, color: muted, fontSize: 11, fontFamily: FONT },
            data: [[{ xAxis: Math.max(1 - band, lo) }, { xAxis: Math.min(1 + band, hi) }]] as [object, object][],
          },
        }
      : {}),
  };

  return {
    // ECharts animates in script, out of reach of the stylesheet's reduced-motion rule.
    animation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    animationDuration: 600,
    animationDurationUpdate: 650,
    animationEasingUpdate: "cubicInOut",
    aria: { enabled: false },
    textStyle: { fontFamily: FONT, color: secondary },
    grid: narrow ? { left: 12, right: 16, top: 40, bottom: 48 } : { left: labelWidth(p.rows.map((r) => r.label)) + 24, right: 32, top: 32, bottom: 52 },
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove|click",
      confine: true,
      backgroundColor: surface,
      borderColor: cssVar("--pink"),
      borderWidth: 1.5,
      padding: [10, 14] as [number, number],
      extraCssText: `border-radius:14px;box-shadow:0 0 24px color-mix(in srgb, ${cssVar("--pink")} 35%, transparent);max-width:${narrow ? 240 : 320}px;white-space:normal`,
      textStyle: { color: primary, fontSize: narrow ? 11 : 12, fontFamily: FONT },
      formatter: (params: unknown) => {
        const item = (Array.isArray(params) ? params[0] : params)?.data as Item | undefined;
        const c = item && p.comparisons.find((x) => x.id === item.id);
        if (!c) return "";
        const r = p.results.get(c.result)!;
        const cand = p.builds.get(c.candidate)!;
        const ref = p.builds.get(c.reference)!;
        const lines = [
          `<div style="font-size:16px;font-weight:800">${escapeHtml(fmtInterval(c.ratio))}</div>`,
          `<div style="color:${cssVar("--pink")};font-weight:700">${escapeHtml(speedText(c.ratio.estimate, measure, p.metric.called ? c.call : null))} · ${escapeHtml(p.metric.called ? callText(c.call, c.sameWithin, measure) : "no call")}</div>`,
          `<div style="color:${secondary}">${escapeHtml(fmtPercent(c.ratio.confidence))} interval, ${c.ratio.n} rounds · ${escapeHtml(readRatio(c.ratio.estimate, measure))}</div>`,
          `<div style="margin-top:6px">${escapeHtml(cand.label)}${c.mode === "single" ? " · 1 thread" : ""}: <b>${escapeHtml(fmtValue(c.candidateValue, p.metric.unit))}</b></div>`,
          `<div style="color:${secondary}">vs ${escapeHtml(ref.label)}: ${escapeHtml(fmtValue(c.referenceValue, p.metric.unit))}</div>`,
          `<div style="color:${secondary};margin-top:6px">${escapeHtml(platformName(r.machine.platform))} · ${escapeHtml(r.machine.cpuModel)} · ${escapeHtml(r.date)}</div>`,
          `<div style="color:${muted};margin-top:4px">${narrow ? "tap again to open this result" : "click to open this result"}</div>`,
        ];
        return lines.join("");
      },
    },
    xAxis: {
      type: "log",
      logBase: 2,
      min: lo,
      max: hi,
      name: narrow ? directionText(measure) : `${measureNoun(measure)} relative to the reference · ${directionText(measure)}`,
      nameLocation: "middle",
      nameGap: 30,
      nameTextStyle: { color: secondary, fontFamily: FONT, fontSize: narrow ? 11 : 12 },
      // The x axis sits at the bottom, not at y = 0 (the first row).
      // The axis is a neon rule, like the section rules: pink to cyan.
      axisLine: {
        onZero: false,
        lineStyle: {
          width: 2,
          color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: cssVar("--pink") }, { offset: 1, color: cssVar("--cyan") }] },
        },
      },
      axisTick: { lineStyle: { color: axis } },
      axisLabel: { color: secondary, formatter: (v: number) => axisRatio(v), hideOverlap: true, fontFamily: FONT },
      splitLine: { lineStyle: { color: grid, type: "dashed" } },
    },
    yAxis: {
      type: "value",
      inverse: true,
      min: narrow ? -0.75 : -0.5,
      max: Math.max(0.5, p.rows.length - 0.5),
      interval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      // One label per row, at the row's integer position (the axis itself runs from -0.5).
      axisLabel: narrow
        ? { show: false }
        : {
            color: primary,
            fontFamily: FONT,
            fontSize: 13,
            customValues: p.rows.map((_, i) => i),
            formatter: (v: number) => p.rows[v]?.label ?? "",
          },
    },
    series: [referenceSeries, ...labels, ...series],
  } as unknown as EChartsOption;
}
