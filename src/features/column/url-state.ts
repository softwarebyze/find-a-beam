/**
 * URL query-string state helpers. Numbers are stored in ENGINE units (kip, in., kip-in.) so a link
 * reproduces the same design regardless of the reader's unit setting.
 */
import { useCallback } from "react";
import { useSearchParams } from "react-router";

export type Patch = Record<string, string | number | boolean | undefined | null>;

/** Compact, round-trippable number encoding for URLs. */
export function encodeNum(v: number): string {
  return String(Number(v.toPrecision(8)));
}

export function parseNum(raw: string | null | undefined, fallback: number): number;
export function parseNum(raw: string | null | undefined, fallback?: undefined): number | undefined;
export function parseNum(raw: string | null | undefined, fallback?: number): number | undefined {
  if (raw === null || raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Apply a patch onto search params: undefined/null/"" removes the key. */
export function applyPatch(prev: URLSearchParams, patch: Patch): URLSearchParams {
  const next = new URLSearchParams(prev);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === "" || (typeof v === "number" && !Number.isFinite(v))) next.delete(k);
    else next.set(k, typeof v === "number" ? encodeNum(v) : typeof v === "boolean" ? (v ? "1" : "0") : v);
  }
  return next;
}

export function useQueryState() {
  const [params, setParams] = useSearchParams();
  const set = useCallback((patch: Patch) => setParams((p) => applyPatch(p, patch), { replace: true }), [setParams]);
  const str = useCallback((k: string, d = "") => params.get(k) ?? d, [params]);
  const numOr = useCallback((k: string, d: number) => parseNum(params.get(k), d), [params]);
  const numOpt = useCallback((k: string) => parseNum(params.get(k)), [params]);
  const bool = useCallback(
    (k: string, d = false) => {
      const v = params.get(k);
      return v === null ? d : v === "1";
    },
    [params],
  );
  return { params, set, str, numOr, numOpt, bool };
}
