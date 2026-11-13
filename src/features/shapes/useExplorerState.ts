import { useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { parseExplorerState, serializeExplorerState, toQueryString, type ExplorerState } from "./logic";

type Patch = Partial<ExplorerState> | ((s: ExplorerState) => Partial<ExplorerState>);

/** Explorer state lives entirely in the URL query; updates replace the history entry. */
export function useExplorerState(): [ExplorerState, (patch: Patch) => void] {
  const { search, pathname } = useLocation();
  const navigate = useNavigate();
  const state = useMemo(() => parseExplorerState(new URLSearchParams(search)), [search]);
  // Several updates may fire before the router re-renders (e.g. typing fast); chain them.
  const latest = useRef(state);
  latest.current = state;
  const update = useCallback((patch: Patch) => {
    const cur = latest.current;
    const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
    latest.current = next;
    navigate({ pathname, search: toQueryString(serializeExplorerState(next)) }, { replace: true, preventScrollReset: true });
  }, [navigate, pathname]);
  return [state, update];
}
