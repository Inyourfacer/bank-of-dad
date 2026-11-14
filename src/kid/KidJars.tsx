import { useState, type FormEvent } from "react";
import { ErrorMessage, Field } from "../components/Field";
import { GoalForm, GoalRow, JarTiles } from "../components/Jars";
import { type BankApi, pinMessage } from "../data/api";
import { useApp } from "../data/AppContext";
import type { Kid, PinStatus } from "../data/types";
import { useKidMoney } from "../data/useGoals";
import { dollarsToCents, formatCents } from "../lib/format";
import { useKidSession } from "./KidSession";

/** Runs a kid action with the signed-in kid's PIN; signs out if the PIN stopped working. */
export function useKidAction() {
  const { api, refresh } = useApp();
  const { session, signOut } = useKidSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: (api: BankApi, pin: string) => Promise<PinStatus>) => {
    if (!api || !session) return false;
    setBusy(true);
    setError(null);
    try {
      const status = await fn(api, session.pin);
      if (status !== "ok") {
        setError(pinMessage(status));
        if (status === "wrong" || status === "no_pin") signOut();
        return false;
      }
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error };
}

/** Standard view: Savings / Spend / Give, and moving Spend money into savings. */
export function KidJars({ kid, savingsCents, junior = false }: { kid: Kid; savingsCents: number; junior?: boolean }) {
  const money = useKidMoney(kid);
  const { run, busy, error } = useKidAction();
  const [amount, setAmount] = useState("");
  const [moved, setMoved] = useState<number | null>(null);
  if (!money) return null;
  const cents = dollarsToCents(amount);
  const tooMuch = cents > money.spendCents;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run((api, pin) => api.moveToSavings(kid.id, pin, cents))) {
      setMoved(cents);
      setAmount("");
    }
  };

  return (
    <section className="panel stack" aria-labelledby="jars-title">
      <h2 className={junior ? "section-title center" : "panel-title"} id="jars-title">
        Your jars
      </h2>
      <JarTiles savingsCents={savingsCents} spendCents={money.spendCents} giveCents={money.giveCents} big={junior} />
      {money.spendCents > 0 && (
        <form className="stack move-form" onSubmit={submit}>
          <p className="muted">
            Spend money doesn't earn interest. Move some to Savings and it starts growing.
          </p>
          <div className="move-row">
            <Field label="Move to Savings" prefix="$" value={amount} onChange={(v) => (setAmount(v), setMoved(null))} />
            <button className="btn btn-secondary" disabled={busy || cents <= 0 || tooMuch}>
              Move
            </button>
          </div>
          {tooMuch && <p className="error-msg">Your Spend jar has {formatCents(money.spendCents)}.</p>}
          {moved !== null && <p className="saved">Moved {formatCents(moved)} into Savings. It earns interest now! 🌱</p>}
          <ErrorMessage error={error} />
        </form>
      )}
    </section>
  );
}

/** Goals with progress and "on track for" dates; kids can add and remove their own. */
export function KidGoals({ kid, junior = false }: { kid: Kid; junior?: boolean }) {
  const money = useKidMoney(kid);
  const { run, busy, error } = useKidAction();
  const [adding, setAdding] = useState(false);
  if (!money) return null;

  return (
    <section className="panel stack" aria-labelledby="goals-title">
      <h2 className={junior ? "section-title center" : "panel-title"} id="goals-title">
        {junior ? "Saving up for…" : "Your goals"}
      </h2>
      {money.goals.length === 0 && !adding && <p className="muted">What are you saving for? Add a goal and watch it get closer every payday.</p>}
      {money.goals.length > 0 && (
        <ul className="goals">
          {money.goals.map((g) => (
            <GoalRow key={g.goal.id} g={g} busy={busy} onRemove={() => void run((api, pin) => api.removeGoal(kid.id, g.goal.id, pin))} />
          ))}
        </ul>
      )}
      {money.goals.length > 1 && (
        <p className="hint">All your goals count the same Savings, so buying one moves the others further away.</p>
      )}
      {!junior && money.monthlySaveCents > 0 && money.goals.some((g) => !g.projection.reached) && (
        <p className="hint">Dates assume you save {formatCents(money.monthlySaveCents)} each payday and don't take money out.</p>
      )}
      {adding ? (
        <GoalForm
          busy={busy}
          error={error}
          onSubmit={async (name, emoji, cents) => {
            const ok = await run((api, pin) => api.addGoal({ kid_id: kid.id, name, emoji, target_cents: cents }, pin));
            if (ok) setAdding(false);
            return ok;
          }}
        />
      ) : (
        money.goals.length < 3 && (
          <button type="button" className="link-button" onClick={() => setAdding(true)}>
            + Add a goal
          </button>
        )
      )}
      {!adding && <ErrorMessage error={error} />}
    </section>
  );
}
