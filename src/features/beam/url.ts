import { useEffect, useRef } from "react";
import { useSettings } from "@/app/settings";
import { useSearchParams } from "react-router";
/** All numerical URL values use engine units, independent of the global display setting. */
export function useBeamUrl() {
  const [params, setParams] = useSearchParams();
  const { method, units, setMethod, setUnits } = useSettings();
  const previous = useRef({ method, units });
  // A shared URL restores the method and units; global toolbar changes update that URL.
  useEffect(() => {
    const methodChanged = previous.current.method !== method,
      unitsChanged = previous.current.units !== units;
    previous.current = { method, units };
    const queryMethod = params.get("method"),
      queryUnits = params.get("units");
    let restoring = false;
    if (!methodChanged && (queryMethod === "LRFD" || queryMethod === "ASD") && queryMethod !== method) {
      setMethod(queryMethod);
      restoring = true;
    }
    if (!unitsChanged && (queryUnits === "US" || queryUnits === "SI") && queryUnits !== units) {
      setUnits(queryUnits);
      restoring = true;
    }
    if (restoring || (queryMethod === method && queryUnits === units)) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("method", method);
        next.set("units", units);
        return next;
      },
      { replace: true },
    );
  }, [method, units, params, setMethod, setUnits, setParams]);
  const text = (key: string, fallback: string) => params.get(key) ?? fallback;
  const number = (key: string, fallback: number) => {
    const raw = params.get(key),
      n = raw === null || raw.trim() === "" ? fallback : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const set = (key: string, value: string | number | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
        return next;
      },
      { replace: true },
    );
  const update = (values: Record<string, string | number | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(values))
          if (value === undefined) next.delete(key);
          else next.set(key, String(value));
        return next;
      },
      { replace: true },
    );
  return { text, number, set, update };
}
