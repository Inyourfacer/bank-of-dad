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

/**
 * Demo only: the kid signed in on the "tablet", kept while the viewer flips to
 * the parent view and back. In memory only, never with a real database.
 */
let demoResume: Session | null = null;

export function KidSessionProvider({ children, remember = false }: { children: ReactNode; remember?: boolean }) {
  const [session, setSessionState] = useState<Session | null>(() => (remember ? demoResume : null));
  const setSession = useCallback(
    (s: Session | null) => {
      if (remember) demoResume = s && { ...s, firstLogin: false };
      setSessionState(s);
    },
    [remember],
  );
  const signOut = useCallback(() => setSession(null), [setSession]);

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

  const value = useMemo(() => ({ session, signIn: setSession, signOut }), [session, setSession, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useKidSession(): KidSessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useKidSession must be used inside KidSessionProvider");
  return v;
}
