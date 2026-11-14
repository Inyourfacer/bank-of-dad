import { useState, type FormEvent } from "react";
import { useAction, useApp } from "../data/AppContext";
import type { Jar, Kid } from "../data/types";
import { useKidMoney } from "../data/useGoals";
import { dollarsToCents, formatCents, formatDay } from "../lib/format";
import { ConfirmButton } from "./ConfirmButton";
import { ErrorMessage, Field } from "./Field";
import { GoalForm, GoalRow, JarTiles } from "./Jars";

type Action = "spent" | "gave" | "add-spend" | "add-give";

const ACTIONS: Record<Action, { label: string; jar: Jar; sign: 1 | -1; placeholder: string }> = {
  spent: { label: "Spent", jar: "spend", sign: -1, placeholder: "Toy store" },
  gave: { label: "Gave", jar: "give", sign: -1, placeholder: "Food bank" },
  "add-spend": { label: "Add to Spend", jar: "spend", sign: 1, placeholder: "Birthday cash" },
  "add-give": { label: "Add to Give", jar: "give", sign: 1, placeholder: "Matching gift" },
};

/** Parents: the Spend and Give jars (record spending and giving) and the kid's goals. */
export function JarsAdmin({ kid, savingsCents }: { kid: Kid; savingsCents: number }) {
  const { today } = useApp();
  const money = useKidMoney(kid);
  const [run, busy, error] = useAction();
  const [goalRun, goalBusy, goalError] = useAction();
  const [action, setAction] = useState<Action>("spent");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [addingGoal, setAddingGoal] = useState(false);
  if (!money) return null;

  const a = ACTIONS[action];
  const cents = dollarsToCents(amount);
  const available = a.jar === "spend" ? money.spendCents : money.giveCents;
  const tooMuch = a.sign < 0 && cents > available;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run((api) => api.addJarEntry(kid.id, a.jar, a.sign * cents, note.trim() || null, today))) {
      setDone(`${a.label} ${formatCents(cents)}.`);
      setAmount("");
      setNote("");
    }
  };

  const recent = [...money.jarEntries].reverse().slice(0, 8);

  return (
    <section className="panel stack" aria-labelledby="jarsadmin-title">
      <h2 className="panel-title" id="jarsadmin-title">
        Jars and goals
      </h2>
      <JarTiles savingsCents={savingsCents} spendCents={money.spendCents} giveCents={money.giveCents} />
      <p className="hint">
        Payday splits take-home pay into these (set the split under Pay and bills). Spend and Give don't earn interest.
        Record it here when {kid.name} spends or gives, and hand over the cash.
      </p>

      <form className="stack" onSubmit={submit}>
        <div className="segmented four" role="radiogroup" aria-label="What happened">
          {(Object.keys(ACTIONS) as Action[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={action === k}
              className={action === k ? "on" : ""}
              onClick={() => {
                setAction(k);
                setDone(null);
              }}
            >
              {ACTIONS[k].label}
            </button>
          ))}
        </div>
        <div className="row">
          <Field label="Amount" prefix="$" value={amount} onChange={(v) => (setAmount(v), setDone(null))} />
          <Field label="What for? (optional)" inputMode="text" value={note} onChange={setNote} maxLength={200} placeholder={a.placeholder} />
        </div>
        {tooMuch && <p className="error-msg">The {a.jar === "spend" ? "Spend" : "Give"} jar has {formatCents(available)}.</p>}
        <ErrorMessage error={error} />
        <div className="actions">
          <button className="btn btn-secondary" disabled={busy || cents <= 0 || tooMuch}>
            Record
          </button>
          {done && <span className="saved">{done}</span>}
        </div>
      </form>

      {recent.length > 0 && (
        <ul className="list">
          {recent.map((j) => (
            <li key={j.id} className="list-row">
              <span className="activity-main">
                <strong>{j.note ?? (j.amount_cents < 0 ? "Taken out" : "Added")}</strong>
                <span className="hint">
                  {formatDay(j.occurred_on, true)} · {j.jar === "spend" ? "Spend" : "Give"} jar
                </span>
              </span>
              <span className={`amount ${j.amount_cents < 0 ? "neg" : "pos"}`}>
                {j.amount_cents < 0 ? "−" : "+"}
                {formatCents(Math.abs(j.amount_cents))}
              </span>
              {j.statement_id ? (
                <span className="icon-spacer" />
              ) : (
                <ConfirmButton
                  label="×"
                  confirmLabel="Delete"
                  ariaLabel="Delete this entry"
                  className="icon-button"
                  disabled={busy}
                  onConfirm={() => void run((api) => api.deleteJarEntry(j.id))}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="sub-title">Goals</h3>
      {money.goals.length === 0 && !addingGoal && <p className="muted">No goals yet. {kid.name} can add them on the tablet, or you can here.</p>}
      {money.goals.length > 0 && (
        <ul className="goals">
          {money.goals.map((g) => (
            <GoalRow key={g.goal.id} g={g} busy={goalBusy} onRemove={() => void goalRun((api) => api.removeGoal(kid.id, g.goal.id))} />
          ))}
        </ul>
      )}
      {addingGoal ? (
        <GoalForm
          busy={goalBusy}
          error={goalError}
          onSubmit={async (name, emoji, target) => {
            const ok = await goalRun((api) => api.addGoal({ kid_id: kid.id, name, emoji, target_cents: target }));
            if (ok) setAddingGoal(false);
            return ok;
          }}
        />
      ) : (
        money.goals.length < 3 && (
          <button type="button" className="link-button" onClick={() => setAddingGoal(true)}>
            + Add a goal for {kid.name}
          </button>
        )
      )}
      {!addingGoal && <ErrorMessage error={goalError} />}
    </section>
  );
}
