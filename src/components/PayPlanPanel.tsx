import { useState, type FormEvent } from "react";
import { useAction, useApp } from "../data/AppContext";
import { duePaycheck, paycheckFor } from "../data/payroll";
import type { Kid, PayPlan } from "../data/types";
import { DEFAULT_EXPENSES, DEFAULT_SALARY_CENTS, DEFAULT_SPLIT, TARGET_NET_CENTS, splitTakeHome } from "../engine/paycheck";
import { SplitLine } from "./Jars";
import { dollarsToCents, formatCents, formatMonthYear } from "../lib/format";
import { ErrorMessage, Field } from "./Field";
import { PayStub } from "./PayStub";

interface Row {
  key: number;
  name: string;
  amount: string;
}

let rowKey = 0;
/** "40" → 40; anything else → 0 (whole percentages only). */
const pctInt = (v: string) => {
  const n = Number(v.replace("%", "").trim());
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : 0;
};
const toRows = (plan: PayPlan | undefined): Row[] =>
  (plan?.expenses ?? DEFAULT_EXPENSES).map((e) => ({ key: rowKey++, name: e.name, amount: String(e.cents / 100) }));

/** Parents: a kid's monthly salary, payday and bills, with a live pay stub preview. */
export function PayPlanPanel({ kid }: { kid: Kid }) {
  const { data, today } = useApp();
  const saved = data?.payPlans.find((p) => p.kid_id === kid.id);
  // Re-mount the form when the saved plan changes so it shows what's stored.
  return <PayPlanForm key={JSON.stringify(saved ?? null)} kid={kid} saved={saved} today={today} />;
}

function PayPlanForm({ kid, saved, today }: { kid: Kid; saved: PayPlan | undefined; today: string }) {
  const { data } = useApp();
  const [run, busy, error] = useAction();
  const [payRun, payBusy, payError] = useAction();
  const [enabled, setEnabled] = useState(saved?.enabled ?? false);
  const [salary, setSalary] = useState(String((saved?.salary_cents ?? DEFAULT_SALARY_CENTS) / 100));
  const [savePct, setSavePct] = useState(String(saved?.save_pct ?? DEFAULT_SPLIT.save_pct));
  const [spendPct, setSpendPct] = useState(String(saved?.spend_pct ?? DEFAULT_SPLIT.spend_pct));
  const [givePct, setGivePct] = useState(String(saved?.give_pct ?? DEFAULT_SPLIT.give_pct));
  const [payDay, setPayDay] = useState(String(saved?.pay_day ?? 1));
  const [rows, setRows] = useState<Row[]>(() => toRows(saved));
  const [savedMsg, setSavedMsg] = useState(false);
  if (!data) return null;

  const brackets = data.family.tax_brackets;
  const statements = data.payStatements.filter((s) => s.kid_id === kid.id);
  const day = Math.floor(Number(payDay));
  const plan: PayPlan = {
    kid_id: kid.id,
    enabled,
    salary_cents: dollarsToCents(salary),
    pay_day: Number.isInteger(day) ? day : 1,
    expenses: rows.filter((r) => r.name.trim() && dollarsToCents(r.amount) > 0).map((r) => ({ name: r.name.trim(), cents: dollarsToCents(r.amount) })),
    save_pct: pctInt(savePct),
    spend_pct: pctInt(spendPct),
    give_pct: pctInt(givePct),
  };
  const splitTotal = plan.save_pct + plan.spend_pct + plan.give_pct;
  const valid = Number.isInteger(day) && day >= 1 && day <= 28 && plan.salary_cents >= 0 && splitTotal === 100;
  const preview = paycheckFor(plan, brackets);
  const previewSplit = splitTakeHome(preview.netCents, plan);
  const inTarget = preview.netCents >= TARGET_NET_CENTS.min && preview.netCents <= TARGET_NET_CENTS.max;
  const dirty = JSON.stringify(plan) !== JSON.stringify(saved ?? null);
  const due = saved ? duePaycheck(saved, brackets, statements, today) : null;

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSavedMsg(await run((api) => api.savePayPlan(plan)));
  };

  return (
    <section className="panel stack" aria-labelledby="pay-title">
      <h2 className="panel-title" id="pay-title">
        Pay and bills
      </h2>
      <p className="hint">
        A pretend monthly salary. Taxes and bills come out of it, and only the take-home pay is deposited into{" "}
        {kid.name}'s account.
      </p>

      {due && (
        <div className="notice pay-due">
          <span>
            {formatMonthYear(due.payMonth)} pay is due: {formatCents(due.paycheck.netCents)} take-home.
          </span>
          <button type="button" className="btn btn-primary btn-sm" disabled={payBusy} onClick={() => void payRun((api) => api.postPaycheck(due))}>
            {payBusy ? "Paying…" : "Pay now"}
          </button>
        </div>
      )}
      <ErrorMessage error={payError} />

      <form className="stack" onSubmit={submit}>
        <label className="toggle">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Pay {kid.name} a monthly salary</span>
        </label>

        <div className="row">
          <Field label="Monthly salary" prefix="$" value={salary} onChange={setSalary} />
          <Field
            label="Payday"
            inputMode="numeric"
            value={payDay}
            onChange={setPayDay}
            hint="Day of the month, 1 to 28."
          />
        </div>

        <fieldset>
          <legend>Bills</legend>
          {rows.map((r) => (
            <div className="bill-row" key={r.key}>
              <Field label="Bill" inputMode="text" value={r.name} onChange={(v) => update(r.key, { name: v })} maxLength={40} />
              <Field label="Per month" prefix="$" value={r.amount} onChange={(v) => update(r.key, { amount: v })} />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${r.name || "bill"}`}
                title="Remove"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="link-button" onClick={() => setRows((rs) => [...rs, { key: rowKey++, name: "", amount: "" }])}>
            + Add a bill
          </button>
        </fieldset>

        <fieldset>
          <legend>Payday split</legend>
          <p className="hint">How take-home pay is divided. Only Savings earns interest.</p>
          <div className="split-row">
            <Field label="🏦 Save" suffix="%" inputMode="numeric" value={savePct} onChange={setSavePct} />
            <Field label="🛍️ Spend" suffix="%" inputMode="numeric" value={spendPct} onChange={setSpendPct} />
            <Field label="💝 Give" suffix="%" inputMode="numeric" value={givePct} onChange={setGivePct} />
          </div>
          {splitTotal !== 100 && <p className="error-msg">The three add up to {splitTotal}%. Make them add up to 100%.</p>}
        </fieldset>

        <div className="stack pay-preview">
          <div className="pay-preview-head">
            <h3 className="sub-title">Pay stub preview</h3>
            <span className={`chip ${inTarget ? "chip-good" : "chip-warn"}`}>
              {inTarget
                ? `Keeps ${formatCents(preview.netCents)}: in the $5–$10 target`
                : `Keeps ${formatCents(preview.netCents)}: aim for $5–$10`}
            </span>
          </div>
          <PayStub stub={preview} />
          {splitTotal === 100 && <SplitLine save={previewSplit.saveCents} spend={previewSplit.spendCents} give={previewSplit.giveCents} />}
          <p className="hint">Taxes use the family's brackets (Family settings → Taxes).</p>
        </div>

        <ErrorMessage error={error} />
        <div className="actions">
          <button className="btn btn-primary" disabled={busy || !valid || !dirty}>
            {busy ? "Saving…" : "Save pay plan"}
          </button>
          {savedMsg && !dirty && <span className="saved">Saved ✓</span>}
        </div>
      </form>

      {statements.length > 0 && (
        <div className="stack">
          <h3 className="sub-title">Past pay stubs</h3>
          <ul className="list">
            {statements.slice(0, 12).map((s) => (
              <li key={s.id}>
                <details className="stub-details">
                  <summary>
                    <span>{formatMonthYear(s.pay_month)}</span>
                    <span className="amount pos">+{formatCents(s.net_cents)}</span>
                  </summary>
                  <PayStub
                    stub={{ grossCents: s.gross_cents, taxes: s.taxes, expenses: s.expenses, netCents: s.net_cents }}
                    payMonth={s.pay_month}
                    paidOn={s.paid_on}
                  />
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
