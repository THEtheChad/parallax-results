import type { Build, Call, Interval, MetricInfo } from "./model.ts";

// What a metric measures, for its words: time ("faster"), CPU time or memory ("lower"), as
// Parallax's reports word them (docs/measurement.md: every metric is lower-is-better).
export type Measure = "time" | "cpu" | "memory";
export const measureOf = (m: Pick<MetricInfo, "key" | "unit">): Measure => (m.unit === "bytes" ? "memory" : /cpu/i.test(m.key) ? "cpu" : "time");
const NOUN: Record<Measure, string> = { time: "time", cpu: "CPU time", memory: "memory" };
export const measureNoun = (m: Measure): string => NOUN[m];

// Two decimals from 0.1 up; two significant figures below (0.023×), where two decimals would lose them.
export const fmtRatio = (v: number): string => `${v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toPrecision(2)}×`;

export const fmtInterval = (i: Interval): string => `${fmtRatio(i.estimate)} (${fmtRatio(i.low)}–${fmtRatio(i.high)})`;

export function fmtValue(v: number | null, unit: MetricInfo["unit"]): string {
  if (v === null) return "–";
  if (unit === "bytes") return `${Math.round(v / 2 ** 20).toLocaleString()} MB`;
  if (v >= 1000) return `${(v / 1000).toFixed(2)} s`;
  return `${v.toFixed(v < 10 ? 1 : 0)} ms`;
}

export const fmtPercent = (c: number): string => `${Math.floor(c * 100)}%`;

// The stored call, worded for the measure: "faster" and "slower" for time, "lower" and "higher" for
// CPU time and memory.
export function callText(call: Call | null, sameWithin: number | null, measure: Measure = "time"): string {
  if (!call) return "–";
  if (call === "same" && sameWithin !== null) return `same ±${Math.round(sameWithin * 100)}%`;
  if (measure !== "time" && call === "faster") return "lower";
  if (measure !== "time" && call === "slower") return "higher";
  return call;
}

// A ratio read out: "takes 0.32× the reference's time", "uses 1.04× the reference's memory".
export function readRatio(r: number, measure: Measure = "time"): string {
  return `${measure === "time" ? "takes" : "uses"} ${fmtRatio(r)} the reference's ${NOUN[measure]}`;
}

const PLATFORM: Record<string, string> = { linux: "Linux", darwin: "macOS", win32: "Windows" };
export const platformName = (p: string): string => PLATFORM[p] ?? p;

// Implementations get categorical slots in a fixed order, from every build in the index (never from
// what a filter left on screen), so an implementation keeps its color whatever is filtered out.
const PREFERRED = ["tsc-rs fork", "tsrs", "tsc 7"];
export function implementationSlots(builds: Build[]): Map<string, number> {
  const names = [...new Set(builds.map((b) => b.implementation))].sort((a, b) => {
    const ia = PREFERRED.indexOf(a);
    const ib = PREFERRED.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return new Map(names.map((n, i) => [n, Math.min(i, 4) + 1]));
}

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// The ratio in words a visitor uses: "3.1× as fast", "12% slower", "2.0× less memory". Only a
// settled call (faster or slower) gets plain words; "same" reads "about the same", and an estimate
// without a settled call (unresolved, too few rounds, an uncalled metric) is marked with "~".
export function plainSpeed(r: number, measure: Measure): string {
  if (r === 1) return "the same";
  const less = r < 1;
  const big = less ? 1 / r : r;
  const amount = big < 1.1 ? `${Math.max(1, Math.round((big - 1) * 100))}%` : `${big.toFixed(1)}×`;
  if (measure === "time") return less ? (big < 1.1 ? `${amount} faster` : `${amount} as fast`) : `${amount} slower`;
  return `${amount} ${less ? "less" : "more"} ${measure === "cpu" ? "CPU" : "memory"}`;
}

export function speedText(r: number, measure: Measure, call: Call | null | undefined): string {
  if (call === "faster" || call === "slower") return plainSpeed(r, measure);
  if (call === "same") return "about the same";
  return `~${plainSpeed(r, measure)}`;
}

// Which way is better, for an axis or a subtitle.
export const directionText = (measure: Measure): string =>
  measure === "time" ? "lower is faster" : measure === "cpu" ? "lower uses less CPU" : "lower uses less memory";
