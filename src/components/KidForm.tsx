import { useState, type FormEvent } from "react";
import { annualFromMonthlyRate } from "../engine/interest";
import { formatPercent, percentToFraction } from "../lib/format";
import type { KidMode, KidTemplate } from "../data/types";
import { AVATARS } from "./avatars";
import { ErrorMessage, Field } from "./Field";

interface Props {
  initial?: Partial<KidTemplate>;
  /** Hide the rate template (e.g. once the account is open). */
  showRates?: boolean;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (kid: KidTemplate) => void;
  onCancel?: () => void;
}

const pctText = (f: number | undefined, fallback: string) => (f === undefined ? fallback : String(+(f * 100).toFixed(4)));

export function KidForm({ initial = {}, showRates = true, submitLabel, busy, error, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial.name ?? "");
  const [avatar, setAvatar] = useState(initial.avatar ?? AVATARS[0]);
  const [mode, setMode] = useState<KidMode>(initial.mode ?? "standard");
  const [intro, setIntro] = useState(pctText(initial.intro_monthly_rate, "2"));
  const [introMonths, setIntroMonths] = useState(String(initial.intro_months ?? 3));
  const [ongoing, setOngoing] = useState(pctText(initial.ongoing_monthly_rate, "1"));

  const introRate = percentToFraction(intro);
  const ongoingRate = percentToFraction(ongoing);
  const months = Math.floor(Number(introMonths));
  const valid =
    name.trim().length > 0 && introRate <= 0.2 && ongoingRate <= 0.2 && Number.isFinite(months) && months >= 0 && months <= 24;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit({
      name: name.trim(),
      avatar,
      mode,
      intro_monthly_rate: introRate,
      intro_months: months,
      ongoing_monthly_rate: ongoingRate,
    });
  };

  return (
    <form className="stack" onSubmit={submit}>
      <Field label="Name" inputMode="text" value={name} onChange={setName} required maxLength={40} />

      <div className="field">
        <span className="label" id="avatar-label">
          Picture
        </span>
        <div className="avatar-picker" role="radiogroup" aria-labelledby="avatar-label">
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={avatar === a} aria-label={a} className={avatar === a ? "on" : ""} onClick={() => setAvatar(a)}>
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label" id="mode-label">
          View
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="mode-label">
          {(["junior", "standard"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {m === "junior" ? "Junior (5–9)" : "Standard (10+)"}
            </button>
          ))}
        </div>
      </div>

      {showRates && (
        <fieldset>
          <legend>Starting rates</legend>
          <p className="hint">These begin on the kid's first login.</p>
          <div className="row">
            <Field label="Starter rate" suffix="% / mo" value={intro} onChange={setIntro} hint={`≈ ${formatPercent(annualFromMonthlyRate(introRate), 1)} a year`} />
            <Field label="For" suffix="months" inputMode="numeric" value={introMonths} onChange={setIntroMonths} />
          </div>
          <Field label="Then" suffix="% / mo" value={ongoing} onChange={setOngoing} hint={`≈ ${formatPercent(annualFromMonthlyRate(ongoingRate), 1)} a year`} />
          {(introRate > 0.2 || ongoingRate > 0.2) && <p className="error-msg">Rates are capped at 20% a month.</p>}
        </fieldset>
      )}

      <ErrorMessage error={error} />
      <div className="actions">
        <button className="btn btn-primary" disabled={busy || !valid}>
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
