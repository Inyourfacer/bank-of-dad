import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Kids are signed out of the shared device after this long without a tap. */
export const IDLE_MS = 5 * 60_000;

interface Session {
  kidId: string;
  /** Kept in memory only, to re-check on the server for each kid action. */
  pin: string;
  firstLogin: boolean;
}

interface KidSessionState {
  session: Session | null;
  signIn: (s: Session) => void;
  signOut: () => void;
}

const Ctx = createContext<KidSessionState | null>(null);

export function KidSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const signOut = useCallback(() => setSession(null), []);

  useEffect(() => {
    if (!session) return;
    let timer = window.setTimeout(signOut, IDLE_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(signOut, IDLE_MS);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session, signOut]);

  const value = useMemo(() => ({ session, signIn: setSession, signOut }), [session, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useKidSession(): KidSessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useKidSession must be used inside KidSessionProvider");
  return v;
}
