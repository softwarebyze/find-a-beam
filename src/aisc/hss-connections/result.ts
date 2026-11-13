/** Report assembly for Chapter K results. Each limit state carries its own φ/Ω (see refs.ts). */
import type { Quantity } from "@/lib/units";
import type { CalcStep, DesignMethod, LimitState } from "../types";
import type { ApplicabilityCheck, HssConnectionResult } from "./types";

export function step(
  label: string,
  symbol: string,
  value: number,
  quantity: Quantity,
  ref: string,
  expr?: string,
  note?: string,
): CalcStep {
  return { label, symbol, value, quantity, ref, expr, note };
}

export interface FactorPair {
  phi: number;
  omega: number;
}

/** A Chapter K limit state. `expr` documents the equation as written in the Specification. */
export function state(
  id: string,
  name: string,
  nominal: number,
  ref: string,
  factors: FactorPair,
  opts: { expr?: string; steps?: CalcStep[]; quantity?: "force" | "moment"; note?: string } = {},
): LimitState {
  const quantity = opts.quantity ?? "force";
  return {
    id,
    name,
    ref,
    nominal,
    phi: factors.phi,
    omega: factors.omega,
    steps: [
      ...(opts.steps ?? []),
      {
        label: name,
        symbol: quantity === "moment" ? "M{n}" : "R{n}",
        value: nominal,
        quantity,
        ref,
        expr: opts.expr,
        note: opts.note,
      },
    ],
  };
}

export const availableOf = (ls: LimitState, method: DesignMethod): number =>
  method === "LRFD" ? ls.phi! * ls.nominal : ls.nominal / ls.omega!;

export function check(
  id: string,
  label: string,
  symbol: string,
  value: number,
  limit: string,
  ok: boolean,
  ref: string,
): ApplicabilityCheck {
  return { id, label, symbol, value, limit, ok, ref };
}

/** Within-range test that also guards against NaN from degenerate geometry. */
export function within(value: number, lo: number, hi: number, exclusiveLo = false): boolean {
  if (!Number.isFinite(value)) return false;
  return (exclusiveLo ? value > lo : value >= lo) && value <= hi;
}

export function finish(opts: {
  section: string;
  quantity: "force" | "moment";
  method: DesignMethod;
  limitStates: LimitState[];
  params?: CalcStep[];
  steps?: CalcStep[];
  applicability?: ApplicabilityCheck[];
  warnings?: string[];
}): HssConnectionResult {
  const { limitStates, method } = opts;
  if (limitStates.length === 0) throw new Error("no applicable Chapter K limit states");
  for (const ls of limitStates)
    if (!Number.isFinite(ls.nominal) || ls.nominal <= 0)
      throw new RangeError(`Invalid ${ls.id} strength; the joint geometry is outside the Chapter K equations`);
  // Per-limit-state factors differ across Chapter K, so the governing state is the least AVAILABLE.
  const gov = limitStates.reduce((a, b) => (availableOf(b, method) < availableOf(a, method) ? b : a));
  const applicability = opts.applicability ?? [];
  const failed = applicability.filter((a) => !a.ok);
  const warnings = [...(opts.warnings ?? [])];
  if (failed.length)
    warnings.unshift(
      `Outside the limits of applicability of ${failed[0]!.ref} (${failed
        .map((f) => `${f.symbol ?? f.label} ${f.limit}`)
        .join("; ")}). The tabulated strengths are not valid for this joint.`,
    );
  return {
    kind: "connection",
    quantity: opts.quantity,
    section: opts.section,
    nominal: gov.nominal,
    phi: gov.phi!,
    omega: gov.omega!,
    governing: gov.id,
    limitStates,
    steps: [...(opts.params ?? []), ...(opts.steps ?? [])],
    params: opts.params ?? [],
    applicability,
    applicable: failed.length === 0,
    warnings,
  };
}

/** Per-limit-state available strengths and demand/capacity ratios, for the ratio bars on the page. */
export function limitStateRatios(
  result: HssConnectionResult,
  method: DesignMethod,
  demand?: number,
): { id: string; name: string; ref: string; available: number; ratio?: number; governs: boolean }[] {
  return result.limitStates.map((ls) => {
    const avail = availableOf(ls, method);
    return {
      id: ls.id,
      name: ls.name,
      ref: ls.ref,
      available: avail,
      ratio: demand === undefined ? undefined : Math.abs(demand) / avail,
      governs: ls.id === result.governing,
    };
  });
}

export const deg = (d: number) => (d * Math.PI) / 180;
export const sin = (thetaDeg: number) => Math.sin(deg(thetaDeg));
