import { useState, type FormEvent } from "react";
import type { GoalWithProjection } from "../data/useGoals";
import { dollarsToCents, formatCents, formatMonthYear } from "../lib/format";
import { ErrorMessage, Field } from "./Field";

/** Savings / Spend / Give at a glance. */
export function JarTiles({ savingsCents, spendCents, giveCents, big = false }: { savingsCents: number; spendCents: number; giveCents: number; big?: boolean }) {
  const tiles = [
    { key: "save", emoji: "🏦", label: "Savings", cents: savingsCents, note: "earns interest", color: "var(--pay-keep)" },
    { key: "spend", emoji: "🛍️", label: "Spend", cents: spendCents, note: "no interest", color: "var(--pay-bills)" },
    { key: "give", emoji: "💝", label: "Give", cents: giveCents, note: "for others", color: "var(--pay-tax)" },
  ];
  return (
    <ul className={`jar-tiles${big ? " big" : ""}`}>
      {tiles.map((t) => (
        <li key={t.key} style={{ "--jar": t.color } as React.CSSProperties}>
          <span className="jar-emoji" aria-hidden="true">
            {t.emoji}
          </span>
          <span className="jar-label">{t.label}</span>
          <span className="jar-amount">{formatCents(t.cents)}</span>
          <span className="hint">{t.note}</span>
        </li>
      ))}
    </ul>
  );
}

/** Where a payday's take-home went. */
export function SplitLine({ save, spend, give }: { save: number; spend: number; give: number }) {
  return (
    <p className="split-line">
      <span>🏦 Save {formatCents(save)}</span>
      <span>🛍️ Spend {formatCents(spend)}</span>
      <span>💝 Give {formatCents(give)}</span>
    </p>
  );
}

/** One goal: progress bar and when it'll be reached. */
export function GoalRow({ g, onRemove, busy }: { g: GoalWithProjection; onRemove?: () => void; busy?: boolean }) {
  const { goal, projection: p } = g;
  return (
    <li className="goal">
      <span className="goal-emoji" aria-hidden="true">
        {goal.emoji}
      </span>
      <div className="goal-body">
        <div className="goal-head">
          <strong>{goal.name}</strong>
          <span className="goal-amounts">
            {formatCents(Math.min(p.balanceCents, goal.target_cents))} of {formatCents(goal.target_cents)}
          </span>
        </div>
        <div
          className="goal-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(p.progress * 100)}
          aria-label={`${goal.name}: ${Math.round(p.progress * 100)}% saved`}
        >
          <span style={{ width: `${Math.max(p.progress * 100, 2)}%` }} />
        </div>
        <span className={p.reached ? "goal-when reached" : "goal-when"}>
          {p.reached
            ? "🎉 You have enough!"
            : p.byDate
              ? `On track for ${formatMonthYear(p.byDate)}`
              : "Add savings to get there"}
        </span>
      </div>
      {onRemove && (
        <button type="button" className="icon-button" aria-label={`Remove ${goal.name}`} title="Remove" disabled={busy} onClick={onRemove}>
          ×
        </button>
      )}
    </li>
  );
}

const GOAL_EMOJIS = ["🎯", "🚲", "🎮", "📚", "🧸", "⚽", "🎧", "🛹", "🎨", "⛺", "🐶", "🎁"];

/** Name, picture and amount for a new goal. */
export function GoalForm({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (name: string, emoji: string, cents: number) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(GOAL_EMOJIS[0]);
  const [amount, setAmount] = useState("");
  const cents = dollarsToCents(amount);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await onSubmit(name.trim(), emoji, cents)) {
      setName("");
      setAmount("");
    }
  };
  return (
    <form className="stack goal-form" onSubmit={submit}>
      <div className="avatar-picker" role="radiogroup" aria-label="Goal picture">
        {GOAL_EMOJIS.map((e) => (
          <button key={e} type="button" role="radio" aria-checked={emoji === e} aria-label={e} className={emoji === e ? "on" : ""} onClick={() => setEmoji(e)}>
            {e}
          </button>
        ))}
      </div>
      <div className="row">
        <Field label="What for?" inputMode="text" value={name} onChange={setName} maxLength={40} placeholder="New bike" />
        <Field label="How much?" prefix="$" value={amount} onChange={setAmount} />
      </div>
      <ErrorMessage error={error} />
      <button className="btn btn-secondary" disabled={busy || !name.trim() || cents <= 0}>
        Add goal
      </button>
    </form>
  );
}
