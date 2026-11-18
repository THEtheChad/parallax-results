import { use } from "react";
import type { Index } from "./model.ts";

// The index is fetched once per page load and shared; components suspend until it arrives.
let indexPromise: Promise<Index> | null = null;

export function loadIndex(): Promise<Index> {
  indexPromise ??= fetch("data/index.json").then(async (r) => {
    if (!r.ok) throw new Error(`data/index.json: HTTP ${r.status}`);
    return (await r.json()) as Index;
  });
  return indexPromise;
}

export const useIndex = (): Index => use(loadIndex());

const resultPromises = new Map<string, Promise<unknown>>();

// One published result, as committed (for the result page).
export function useResult(id: string): unknown {
  let p = resultPromises.get(id);
  if (!p) {
    p = fetch(`data/results/${encodeURIComponent(id)}.json`).then(async (r) => {
      if (!r.ok) throw new Error(`result ${id}: HTTP ${r.status}`);
      return r.json() as Promise<unknown>;
    });
    resultPromises.set(id, p);
  }
  return use(p);
}
