import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { todayInZone } from "../engine/dates";
import { ApiError, type BankApi, type SessionUser } from "./api";
import { getApi } from "./backend";
import type { FamilyData } from "./types";

export type AppStatus = "unconfigured" | "loading" | "signed-out" | "no-family" | "ready" | "error";

interface AppState {
  api: BankApi | null;
  status: AppStatus;
  user: SessionUser | null;
  data: FamilyData | null;
  /** Today in the family's time zone. */
  today: string;
  error: string | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const api = getApi();
  const [status, setStatus] = useState<AppStatus>(api ? "loading" : "unconfigured");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [data, setData] = useState<FamilyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      const u = await api.currentUser();
      setUser(u);
      if (!u) {
        setData(null);
        setStatus("signed-out");
        return;
      }
      const d = await api.loadFamily();
      setData(d);
      setStatus(d ? "ready" : "no-family");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;
    void refresh();
    return api.onAuthChange(() => void refresh());
  }, [api, refresh]);

  const tz = data?.family.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const value = useMemo<AppState>(
    () => ({ api, status, user, data, today: todayInZone(tz), error, refresh }),
    [api, status, user, data, tz, error, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}

/**
 * Runs a backend call, then reloads family data. Returns [run, busy, error].
 * `run` resolves to true on success.
 */
export function useAction(): [(fn: (api: BankApi) => Promise<unknown>) => Promise<boolean>, boolean, string | null, () => void] {
  const { api, refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (fn: (api: BankApi) => Promise<unknown>) => {
      if (!api) return false;
      setBusy(true);
      setError(null);
      try {
        await fn(api);
        await refresh();
        return true;
      } catch (e) {
        setError(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [api, refresh],
  );
  return [run, busy, error, () => setError(null)];
}
