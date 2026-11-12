import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DesignMethod } from "@/aisc/types";
import type { UnitSystem } from "@/lib/units";

export type Theme = "light" | "dark" | "system";

interface Settings {
  units: UnitSystem;
  method: DesignMethod;
  theme: Theme;
  setUnits: (u: UnitSystem) => void;
  setMethod: (m: DesignMethod) => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<Settings | null>(null);

function usePersisted<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => (typeof localStorage !== "undefined" && (localStorage.getItem(key) as T)) || initial);
  useEffect(() => { localStorage.setItem(key, v); }, [key, v]);
  return [v, setV];
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [units, setUnits] = usePersisted<UnitSystem>("fab.units", "US");
  const [method, setMethod] = usePersisted<DesignMethod>("fab.method", "LRFD");
  const [theme, setTheme] = usePersisted<Theme>("fab.theme", "system");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches));
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const value = useMemo(() => ({ units, method, theme, setUnits, setMethod, setTheme }), [units, method, theme, setUnits, setMethod, setTheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Global settings: unit system (US/SI), design method (LRFD/ASD), theme. */
export function useSettings(): Settings {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSettings must be used inside <SettingsProvider>");
  return s;
}
