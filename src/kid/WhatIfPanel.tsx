import { useId, useMemo, useState } from "react";
import { Field } from "../components/Field";
import { kidWhatIf } from "../data/kidProjection";
import type { Kid, RatePeriodRow, TransactionRow } from "../data/types";
import type { Frequency } from "../engine/projection";
import { dollarsToCents, formatCents, formatDay, formatDuration } from "../lib/format";
import { GrowthChart } from "../simulator/GrowthChart";

interface Props {
  kid: Kid;
  rates: RatePeriodRow[];
  transactions: TransactionRow[];
  today: string;
  bankApy: number;
}

/** "What if I leave it longer / add more?" starting from the kid's real balance. */
export function WhatIfPanel({ kid, rates, transactions, today, bankApy }: Props) {
  const [months, setMonths] = useState(12);
  const [oneTime, setOneTime] = useState("");
  const [oneTimeAfter, setOneTimeAfter] = useState("0");
  const [recurring, setRecurring] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const sliderId = useId();

  const r = useMemo(
    () =>
      kidWhatIf({
        kid,
        rates,
        transactions,
        today,
        months,
        oneTimeCents: dollarsToCents(oneTime),
        oneTimeAfterMonths: Math.max(0, Math.min(120, Math.floor(Number(oneTimeAfter)) || 0)),
        recurringCents: dollarsToCents(recurring),
        recurringFrequency: frequency,
        bankApy,
      }),
    [kid, rates, transactions, today, months, oneTime, oneTimeAfter, recurring, frequency, bankApy],
  );

  const end = r.scenario;
  const extraPutIn = r.baseline ? end.contributedCents - r.baseline.contributedCents : 0;
  const extraGrowth = r.baseline ? end.balanceCents - r.baseline.balanceCents : 0;
  const earnedFromNow = end.interestPaidCents - r.now.interestPaidCents;

  return (
    <section className="panel stack" aria-labelledby="whatif-title">
      <h2 className="panel-title" id="whatif-title">
        What if…?
      </h2>

      <div className="field">
        <label htmlFor={sliderId}>
          I leave it for <strong>{formatDuration(months)}</strong>
        </label>
        <input id={sliderId} type="range" min={1} max={120} value={months} onChange={(e) => setMonths(Number(e.target.value))} />
        <div className="range-scale" aria-hidden="true">
          <span>1 month</span>
          <span>10 years</span>
        </div>
      </div>

      <div className="row">
        <Field label="I add once" prefix="$" value={oneTime} onChange={setOneTime} />
        <Field label="In how many months" inputMode="numeric" value={oneTimeAfter} onChange={setOneTimeAfter} />
      </div>
      <div className="row">
        <Field label="I add regularly" prefix="$" value={recurring} onChange={setRecurring} />
        <div className="field">
          <span className="label" id="kid-freq">
            How often
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="kid-freq">
            {(["weekly", "monthly"] as const).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={frequency === f} className={frequency === f ? "on" : ""} onClick={() => setFrequency(f)}>
                {f === "weekly" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="whatif-result" aria-live="polite">
        <p className="eyebrow">By Payday on {formatDay(r.endDate, true)} you'd have</p>
        <p className="tile-number">{formatCents(end.balanceCents)}</p>
        <p className="muted">
          Interest would add <strong>{formatCents(earnedFromNow)}</strong> between now and then.
          {r.hasExtras && extraPutIn > 0 && (
            <>
              {" "}
              Your extra {formatCents(extraPutIn)} becomes <strong>{formatCents(extraGrowth)}</strong>.
            </>
          )}
        </p>
      </div>

      <GrowthChart points={r.points} showBaseline={r.hasExtras} />

      <p className="hint">
        A regular bank would turn the same money into {formatCents(r.bank.balanceCents)}.
        {r.crossoverMonth !== null && ` After about ${formatDuration(r.crossoverMonth)}, interest has made more than you put in.`}
      </p>
    </section>
  );
}
