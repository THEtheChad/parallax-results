import type { Build, Call, Interval, MetricInfo } from "./model.ts";

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

export function callText(call: Call | null, sameWithin: number | null): string {
  if (!call) return "–";
  if (call === "same" && sameWithin !== null) return `same ±${Math.round(sameWithin * 100)}%`;
  return call;
}

// "faster" for a ratio under 1 reads as "takes 0.4× the time": spell it out for the tooltip.
export function readRatio(r: number): string {
  if (r < 1) return `takes ${fmtRatio(r)} the reference's time (${(1 / r).toFixed(1)}× as fast)`;
  if (r > 1) return `takes ${fmtRatio(r)} the reference's time`;
  return "the same as the reference";
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

// The ratio in words a visitor uses: "3.1× as fast" or "1.2× slower" for time, "uses 0.32× the
// memory" for bytes. A ratio of exactly 1 is "the same".
export function speedText(r: number, unit: MetricInfo["unit"]): string {
  if (unit === "bytes") return r === 1 ? "the same memory" : `${fmtRatio(r)} the memory`;
  if (r < 1) return `${(1 / r).toFixed(1)}× as fast`;
  if (r > 1) return `${r.toFixed(1)}× slower`;
  return "the same";
}

// Which way is better, for an axis or a subtitle.
export const directionText = (unit: MetricInfo["unit"]): string => (unit === "bytes" ? "lower uses less memory" : "lower is faster");
