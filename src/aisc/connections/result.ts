import type { CalcStep, LimitState } from "../types";
import type { ConnectionResult } from "./types";

export function positive(value: number | undefined, name: string): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0)
    throw new RangeError(`${name} must be finite and positive`);
  return value;
}
export function nonnegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative`);
  return value;
}
export function count(value: number, name: string): number {
  positive(value, name);
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer`);
  return value;
}
export function state(
  id: string,
  name: string,
  nominal: number,
  ref: string,
  expr: string,
  phi = 0.75,
  omega = 2,
): LimitState {
  return {
    id,
    name,
    nominal,
    ref,
    phi,
    omega,
    steps: [{ label: name, symbol: "R{n}", value: nominal, quantity: "force", expr, ref }],
  };
}
export function connection(
  section: string,
  limitStates: LimitState[],
  steps: CalcStep[] = [],
  warnings: string[] = [],
): ConnectionResult {
  const gov = limitStates.reduce((a, b) => (b.nominal * (b.phi ?? 0.75) < a.nominal * (a.phi ?? 0.75) ? b : a));
  return {
    kind: "connection",
    quantity: "force",
    nominal: gov.nominal,
    phi: gov.phi ?? 0.75,
    omega: gov.omega ?? 2,
    governing: gov.id,
    section,
    limitStates,
    steps,
    warnings,
  };
}
