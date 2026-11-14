import { useState, type FormEvent } from "react";
import type { BankApi } from "../data/api";
import { useApp } from "../data/AppContext";
import type { Kid, PinStatus } from "../data/types";
import { useKidMoney } from "../data/useGoals";
import { CD_TERMS, type CdTerm, cdQuote, cdStatus, loanStatus, paymentFor, payoffPlan } from "../engine/cd";
import { addMonths } from "../engine/dates";
import { dollarsToCents, formatCents, formatDay, formatPercent } from "../lib/format";
import { ConfirmButton } from "./ConfirmButton";
import { ErrorMessage, Field } from "./Field";

/** Runs an action as the kid (with their PIN) or as a parent (no PIN). */
export type Act = (fn: (api: BankApi, pin: string | undefined) => Promise<PinStatus | void>) => Promise<boolean>;

interface Props {
  kid: Kid;
  savingsCents: number;
  act: Act;
  busy: boolean;
  error: string | null;
  /** Kid view (true) or parent view (false). */
  asKid: boolean;
}

/** Money in the ledger (what the bank lets you lock or spend right now). */
function useLedgerCents(kidId: string) {
  const { data } = useApp();
  return data?.transactions.filter((t) => t.kid_id === kidId).reduce((s, t) => s + t.amount_cents, 0) ?? 0;
}

function useCurrentRate(kidId: string) {
  const { data, today } = useApp();
  const rates = (data?.rates ?? []).filter((r) => r.kid_id === kidId && r.effective_from <= today);
  return rates.sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.monthly_rate ?? 0;
}

// ---------------------------------------------------------------------------
// CDs
// ---------------------------------------------------------------------------

export function CdsPanel({ kid, savingsCents, act, busy, error, asKid }: Props) {
  const { data, today } = useApp();
  const ledger = useLedgerCents(kid.id);
  const base = useCurrentRate(kid.id);
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState<CdTerm>(6);
  const [opened, setOpened] = useState(false);
  if (!data) return null;

  const bonus = data.family.cd_bonus_monthly_rate;
  const cds = data.cds.filter((c) => c.kid_id === kid.id);
  const open = cds.filter((c) => c.status === "open");
  const closed = cds.filter((c) => c.status !== "open").slice(-3).reverse();
  const available = Math.max(0, Math.min(savingsCents, ledger));
  const cents = dollarsToCents(amount);
  const quote = cdQuote(cents, base, bonus, term);
  const tooMuch = cents > available;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await act((api, pin) => api.openCd(kid.id, cents, term, pin))) {
      setOpened(true);
      setAmount("");
    }
  };

  return (
    <section className="panel stack" aria-labelledby={`cds-title-${asKid ? "k" : "p"}`}>
      <h2 className="panel-title" id={`cds-title-${asKid ? "k" : "p"}`}>
        {asKid ? "Lock it up: CDs" : "CDs (locked savings)"}
      </h2>
      <p className="muted">
        Lock savings for 3, 6 or 12 months and earn a bonus of {formatPercent(bonus)} a month on top of the{" "}
        {formatPercent(base)} rate. Take it out early and the bonus is gone.
      </p>

      {open.length > 0 && (
        <ul className="list">
          {open.map((c) => {
            const s = cdStatus(c, today);
            return (
              <li key={c.id} className="list-row cd-row">
                <span className="activity-main">
                  <strong>
                    🔒 {formatCents(c.principal_cents)} for {c.term_months} months
                  </strong>
                  <span className="hint">
                    {s.matured ? "Ready!" : `Unlocks ${formatDay(c.matures_on, true)} (${s.daysLeft} days)`} · pays{" "}
                    {formatCents(s.maturityCents)}
                  </span>
                </span>
                {!s.matured && (
                  <ConfirmButton
                    label="Break early"
                    confirmLabel={`Get ${formatCents(s.breakNowCents)}, lose ${formatCents(s.bonusLostCents)} bonus`}
                    className="link-button danger"
                    disabled={busy}
                    onConfirm={() => void act((api, pin) => api.breakCd(kid.id, c.id, pin))}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form className="stack" onSubmit={submit}>
        <div className="row">
          <Field label="Amount to lock" prefix="$" value={amount} onChange={(v) => (setAmount(v), setOpened(false))} hint={`Up to ${formatCents(available)}`} />
          <div className="field">
            <span className="label" id={`cd-term-${kid.id}`}>
              For
            </span>
            <div className="segmented three" role="radiogroup" aria-labelledby={`cd-term-${kid.id}`}>
              {CD_TERMS.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={term === t} className={term === t ? "on" : ""} onClick={() => setTerm(t)}>
                  {t} mo
                </button>
              ))}
            </div>
          </div>
        </div>
        {cents > 0 && !tooMuch && (
          <div className="reality-check">
            <p>
              Lock {formatCents(cents)} for {term} months at {formatPercent(base + bonus)} a month →{" "}
              <strong>{formatCents(quote.cdCents)}</strong> on {formatDay(addMonths(today, term), true)}.
            </p>
            <p className="hint">In regular savings it would be {formatCents(quote.savingsCents)}. The CD earns {formatCents(quote.cdCents - quote.savingsCents)} more.</p>
          </div>
        )}
        {tooMuch && <p className="error-msg">You can lock up to {formatCents(available)} right now.</p>}
        <ErrorMessage error={error} />
        <div className="actions">
          <button className="btn btn-secondary" disabled={busy || cents <= 0 || tooMuch || !kid.account_opened_on}>
            🔒 Lock it
          </button>
          {opened && <span className="saved">Locked! It unlocks on {formatDay(addMonths(today, term), true)}.</span>}
        </div>
      </form>

      {closed.length > 0 && (
        <ul className="list">
          {closed.map((c) => (
            <li key={c.id} className="list-row">
              <span className="activity-main">
                <strong>
                  {c.status === "matured" ? "✅ Matured" : "🔓 Broken early"}: {formatCents(c.principal_cents)} → {formatCents(c.payout_cents ?? 0)}
                </strong>
                <span className="hint">{c.closed_on ? formatDay(c.closed_on, true) : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

function PayoffTable({ balanceCents, rate }: { balanceCents: number; rate: number }) {
  const trap = Math.round(balanceCents * rate);
  return (
    <div className="stack">
      <div className="table-wrap flat">
        <table>
          <thead>
            <tr>
              <th scope="col">Pay it off in</th>
              <th scope="col">Pay each month</th>
              <th scope="col">Interest you pay</th>
            </tr>
          </thead>
          <tbody>
            {[3, 6, 12].map((m) => {
              const pay = paymentFor(balanceCents, rate, m);
              const plan = payoffPlan(balanceCents, rate, pay);
              return (
                <tr key={m}>
                  <th scope="row">{m} months</th>
                  <td>{formatCents(pay)}</td>
                  <td>{formatCents(plan.totalInterestCents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {trap > 0 && (
        <p className="trap">
          ⚠️ The trap: pay only {formatCents(trap)} a month and you'd only cover the interest. You'd pay forever and never
          finish.
        </p>
      )}
    </div>
  );
}

export function LoanPanel({ kid, savingsCents, act, busy, error, asKid }: Props) {
  const { data, today } = useApp();
  const money = useKidMoney(kid);
  const ledger = useLedgerCents(kid.id);
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [source, setSource] = useState<"savings" | "spend" | "cash">(asKid ? "spend" : "cash");
  const [tryPay, setTryPay] = useState("");
  if (!data || !money) return null;

  const rate = data.family.loan_monthly_rate;
  const loans = data.loans.filter((l) => l.kid_id === kid.id);
  const withStatus = loans.map((l) => ({ loan: l, s: loanStatus(l, data.loanPayments.filter((p) => p.loan_id === l.id), today) }));
  const active = withStatus.find((x) => x.loan.status === "active" && !x.s.paidOff);
  const pending = loans.find((l) => l.status === "pending");
  const cents = dollarsToCents(amount);
  const payCents = dollarsToCents(payAmount);
  const sourceMax = source === "savings" ? Math.min(savingsCents, ledger) : source === "spend" ? money.spendCents : Infinity;
  const tryCents = dollarsToCents(tryPay);

  // Parents don't see an empty loan panel.
  if (!asKid && !active && !pending) {
    const paid = withStatus.filter((x) => x.loan.status === "active" && x.s.paidOff);
    if (paid.length === 0) return null;
  }

  return (
    <section className="panel stack" aria-labelledby={`loan-title-${asKid ? "k" : "p"}`}>
      <h2 className="panel-title" id={`loan-title-${asKid ? "k" : "p"}`}>
        {asKid ? "Borrow from Dad" : "Loans"}
      </h2>

      {active ? (
        <>
          <div className="loan-summary">
            <div>
              <span className="hint">{asKid ? "You owe" : `${kid.name} owes`}</span>
              <span className="tile-number">{formatCents(active.s.balanceCents)}</span>
            </div>
            <div>
              <span className="hint">Borrowed</span>
              <strong>{formatCents(active.loan.principal_cents)}</strong>
            </div>
            <div>
              <span className="hint">Paid back</span>
              <strong>{formatCents(active.s.paidCents)}</strong>
            </div>
            <div>
              <span className="hint">Interest so far</span>
              <strong className="danger">{formatCents(active.s.interestCents)}</strong>
            </div>
          </div>
          <p className="hint">
            {active.loan.purpose ? `For “${active.loan.purpose}”. ` : ""}It grows {formatPercent(Number(active.loan.monthly_rate))} every month until it's
            paid off.
          </p>

          <div className="stack payoff-try">
            <Field label="If I pay each month…" prefix="$" value={tryPay} onChange={setTryPay} />
            {tryCents > 0 &&
              (() => {
                const p = payoffPlan(active.s.balanceCents, Number(active.loan.monthly_rate), tryCents);
                return Number.isFinite(p.months) ? (
                  <p>
                    Paid off in <strong>{p.months} month{p.months === 1 ? "" : "s"}</strong>, with{" "}
                    <strong>{formatCents(p.totalInterestCents)}</strong> more in interest.
                  </p>
                ) : (
                  <p className="trap">⚠️ That doesn't even cover the interest. The loan would never be paid off.</p>
                );
              })()}
          </div>

          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act((api, pin) => api.payLoan(kid.id, active.loan.id, payCents, source, pin))) setPayAmount("");
            }}
          >
            <div className={`segmented ${asKid ? "" : "three"}`} role="radiogroup" aria-label="Pay from">
              {(asKid ? (["spend", "savings"] as const) : (["cash", "spend", "savings"] as const)).map((src) => (
                <button key={src} type="button" role="radio" aria-checked={source === src} className={source === src ? "on" : ""} onClick={() => setSource(src)}>
                  {src === "spend" ? `Spend jar (${formatCents(money.spendCents)})` : src === "savings" ? "Savings" : "Cash"}
                </button>
              ))}
            </div>
            <div className="move-row">
              <Field label="Pay back" prefix="$" value={payAmount} onChange={setPayAmount} />
              <button className="btn btn-primary" disabled={busy || payCents <= 0 || payCents > active.s.balanceCents || payCents > sourceMax}>
                Pay
              </button>
            </div>
            {payCents > active.s.balanceCents && <p className="error-msg">That's more than is owed ({formatCents(active.s.balanceCents)}).</p>}
            {payCents > 0 && payCents <= active.s.balanceCents && payCents > sourceMax && (
              <p className="error-msg">There's only {formatCents(sourceMax)} there.</p>
            )}
            <ErrorMessage error={error} />
          </form>
        </>
      ) : pending ? (
        <div className="stack">
          <p>
            {asKid ? "You asked" : `${kid.name} asked`} to borrow <strong>{formatCents(pending.principal_cents)}</strong>
            {pending.purpose ? ` for “${pending.purpose}”` : ""}. Waiting for a parent.
          </p>
          {asKid && (
            <button type="button" className="link-button" disabled={busy} onClick={() => void act((api, pin) => api.cancelLoan(kid.id, pin!, pending.id))}>
              Cancel request
            </button>
          )}
          <ErrorMessage error={error} />
        </div>
      ) : asKid ? (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act((api, pin) => api.requestLoan(kid.id, pin!, cents, purpose))) {
              setAmount("");
              setPurpose("");
            }
          }}
        >
          <p className="muted">
            Need something now? Dad can lend it, but loans cost {formatPercent(rate)} a month. That's compounding working{" "}
            <em>against</em> you.
          </p>
          <div className="row">
            <Field label="Borrow" prefix="$" value={amount} onChange={setAmount} />
            <Field label="What for?" inputMode="text" value={purpose} onChange={setPurpose} maxLength={200} placeholder="Skateboard" />
          </div>
          {cents > 0 && <PayoffTable balanceCents={cents} rate={rate} />}
          <ErrorMessage error={error} />
          <button className="btn btn-secondary" disabled={busy || cents <= 0}>
            Ask to borrow {cents > 0 ? formatCents(cents) : ""}
          </button>
        </form>
      ) : null}

      {withStatus.some((x) => x.loan.status === "active" && x.s.paidOff) && (
        <p className="saved">✅ {asKid ? "You paid off" : `${kid.name} paid off`} a loan. Nice work!</p>
      )}
    </section>
  );
}
