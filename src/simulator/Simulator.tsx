import { useId, useMemo, useState } from "react";
import { Field } from "../components/Field";
import { annualFromMonthlyRate } from "../engine/interest";
import type { Frequency } from "../engine/projection";
import {
  dollarsToCents,
  formatCents,
  formatDuration,
  formatMonthYear,
  formatPercent,
  percentToFraction,
} from "../lib/format";
import { RateComparison, planRates } from "../components/RateComparison";
import { GrowthChart } from "./GrowthChart";
import { type SimSettings, useSimulation } from "./useSimulation";

interface Form {
  start: string;
  introRate: string;
  introMonths: string;
  ongoingRate: string;
  months: number;
  oneTime: string;
  oneTimeAfter: string;
  recurring: string;
  recurringFrequency: Frequency;
  bankApy: string;
}

const DEFAULTS: Form = {
  start: "100",
  introRate: "2",
  introMonths: "3",
  ongoingRate: "1",
  months: 60,
  oneTime: "",
  oneTimeAfter: "6",
  recurring: "",
  recurringFrequency: "weekly",
  bankApy: "0.5",
};

const clampInt = (text: string, min: number, max: number) => {
  const n = Math.floor(Number(text));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

function toSettings(f: Form): SimSettings {
  return {
    startCents: dollarsToCents(f.start),
    introRate: Math.min(percentToFraction(f.introRate), 0.2),
    introMonths: clampInt(f.introMonths, 0, 120),
    ongoingRate: Math.min(percentToFraction(f.ongoingRate), 0.2),
    months: f.months,
    oneTimeCents: dollarsToCents(f.oneTime),
    oneTimeAfterMonths: clampInt(f.oneTimeAfter, 0, 120),
    recurringCents: dollarsToCents(f.recurring),
    recurringFrequency: f.recurringFrequency,
    bankApy: Math.min(percentToFraction(f.bankApy), 0.5),
  };
}

export function Simulator() {
  const [form, setForm] = useState<Form>(DEFAULTS);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const settings = useMemo(() => toSettings(form), [form]);
  const r = useSimulation(settings);
  const yearsId = useId();

  const { scenario, baseline, bank } = r;
  const extraPutIn = baseline ? scenario.contributedCents - baseline.contributedCents : 0;
  const extraGrowth = baseline ? scenario.balanceCents - baseline.balanceCents : 0;
  const vsBank = scenario.balanceCents - bank.balanceCents;
  const interestShare = scenario.balanceCents > 0 ? scenario.interestPaidCents / scenario.balanceCents : 0;

  return (
    <div className="sim">
      <section className="panel controls" aria-labelledby="controls-title">
        <h2 id="controls-title">Your plan</h2>

        <Field label="Starting amount" prefix="$" value={form.start} onChange={set("start")} />

        <div className="field">
          <label htmlFor={yearsId}>
            Leave it for <strong>{formatDuration(form.months)}</strong>
          </label>
          <input
            id={yearsId}
            type="range"
            min={1}
            max={120}
            value={form.months}
            onChange={(e) => set("months")(Number(e.target.value))}
          />
          <div className="range-scale" aria-hidden="true">
            <span>1 month</span>
            <span>10 years</span>
          </div>
        </div>

        <fieldset>
          <legend>What if I add more?</legend>
          <div className="row">
            <Field label="One-time deposit" prefix="$" value={form.oneTime} onChange={set("oneTime")} />
            <Field
              label="Months from now"
              value={form.oneTimeAfter}
              onChange={set("oneTimeAfter")}
              inputMode="numeric"
            />
          </div>
          <div className="row">
            <Field label="Regular deposit" prefix="$" value={form.recurring} onChange={set("recurring")} />
            <div className="field">
              <span className="label" id="freq-label">
                How often
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby="freq-label">
                {(["weekly", "monthly"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={form.recurringFrequency === f}
                    className={form.recurringFrequency === f ? "on" : ""}
                    onClick={() => set("recurringFrequency")(f)}
                  >
                    {f === "weekly" ? "Weekly" : "Monthly"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </fieldset>

        <details className="rates">
          <summary>Interest rates</summary>
          <div className="row">
            <Field
              label="Starter rate"
              suffix="% / mo"
              value={form.introRate}
              onChange={set("introRate")}
              hint={`≈ ${formatPercent(annualFromMonthlyRate(settings.introRate), 1)} a year`}
            />
            <Field
              label="For the first"
              suffix="months"
              value={form.introMonths}
              onChange={set("introMonths")}
              inputMode="numeric"
            />
          </div>
          <Field
            label="Then"
            suffix="% / mo"
            value={form.ongoingRate}
            onChange={set("ongoingRate")}
            hint={`≈ ${formatPercent(annualFromMonthlyRate(settings.ongoingRate), 1)} a year`}
          />
          <Field
            label="Regular bank rate"
            suffix="% / yr"
            value={form.bankApy}
            onChange={set("bankApy")}
            hint="A typical savings account, for comparison."
          />
        </details>

        <button type="button" className="link-button" onClick={() => setForm(DEFAULTS)}>
          Reset to Bank of Dad defaults
        </button>
      </section>

      <section className="results" aria-labelledby="results-title" aria-live="polite">
        <div className="panel hero">
          <h2 id="results-title" className="eyebrow">
            After {formatDuration(form.months)} you'd have
          </h2>
          <p className="hero-number">{formatCents(scenario.balanceCents)}</p>
          <div className="split">
            <div>
              <span className="swatch" style={{ "--swatch": "var(--series-putin)" } as React.CSSProperties} />
              <span className="split-label">You put in</span>
              <span className="split-value">{formatCents(scenario.contributedCents)}</span>
            </div>
            <div>
              <span className="swatch" style={{ "--swatch": "var(--series-interest)" } as React.CSSProperties} />
              <span className="split-label">Interest earned</span>
              <span className="split-value">{formatCents(scenario.interestPaidCents)}</span>
            </div>
          </div>
          {scenario.interestPaidCents > 0 && (
            <p className="cheer">
              {formatPercent(interestShare, 0)} of that is money you didn't have to earn. 🎉
            </p>
          )}
        </div>

        <div className="panel">
          <GrowthChart points={r.points} showBaseline={r.hasExtras} />
        </div>

        <div className="panel">
          <RateComparison
            dad={planRates(settings.introRate, settings.introMonths, settings.ongoingRate)}
            bankApy={settings.bankApy}
          />
        </div>

        <div className="insights">
          <div className="panel insight">
            <h3>vs. a regular bank</h3>
            <p className="insight-number">+{formatCents(Math.max(vsBank, 0))}</p>
            <p>
              The same plan at {formatPercent(settings.bankApy)} a year ends at {formatCents(bank.balanceCents)}.
            </p>
          </div>

          {r.hasExtras && (
            <div className="panel insight">
              <h3>Your extra deposits</h3>
              <p className="insight-number">+{formatCents(extraGrowth)}</p>
              <p>
                You'd add {formatCents(extraPutIn)}, and interest turns it into {formatCents(extraGrowth)}.
              </p>
            </div>
          )}

          <div className="panel insight">
            <h3>Doubling time</h3>
            <p className="insight-number">
              {Number.isFinite(r.doublingMonths) ? formatDuration(r.doublingMonths) : "Never"}
            </p>
            <p>
              {Number.isFinite(r.doublingMonths)
                ? `At ${formatPercent(settings.ongoingRate)} a month, money left alone doubles about every ${formatDuration(r.doublingMonths)}.`
                : "At 0% interest, money just sits there."}
            </p>
          </div>

          <div className="panel insight">
            <h3>The tipping point</h3>
            {r.crossoverMonth !== null ? (
              <>
                <p className="insight-number">{formatDuration(r.crossoverMonth)}</p>
                <p>That's when interest has made more money than you put in.</p>
              </>
            ) : (
              <>
                <p className="insight-number">Keep going</p>
                <p>Leave it longer and interest will eventually make more than you put in.</p>
              </>
            )}
          </div>
        </div>

        <details className="panel paydays">
          <summary>See every Payday ({scenario.paydays.length})</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Interest paid</th>
                  <th scope="col">Balance after</th>
                </tr>
              </thead>
              <tbody>
                {scenario.paydays.map((p) => (
                  <tr key={p.month}>
                    <td>{formatMonthYear(p.date)}</td>
                    <td>{formatCents(p.amountCents)}</td>
                    <td>{formatCents(p.balanceAfterCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}
