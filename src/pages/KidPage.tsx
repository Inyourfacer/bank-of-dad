import { useState, type FormEvent } from "react";
import { ErrorMessage, Field } from "../components/Field";
import { ConfirmButton } from "../components/ConfirmButton";
import { KidForm } from "../components/KidForm";
import { RequestReview } from "../components/RequestReview";
import type { KidAccount } from "../data/account";
import { useAction, useApp } from "../data/AppContext";
import type { Kid, NewTransaction, RatePeriodRow } from "../data/types";
import { useAccounts } from "../data/useAccounts";
import { addDays, firstOfNextMonth, startOfMonth } from "../engine/dates";
import { annualFromMonthlyRate } from "../engine/interest";
import { dollarsToCents, formatCents, formatPercent, percentToFraction } from "../lib/format";
import { navigate } from "../lib/router";

const formatDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function KidPage({ kidId }: { kidId: string }) {
  const { data } = useApp();
  const accounts = useAccounts();
  if (!data) return null;
  const kid = data.kids.find((k) => k.id === kidId);
  const account = accounts.get(kidId);
  if (!kid || !account) {
    return (
      <div className="narrow">
        <div className="panel stack">
          <p>That account doesn't exist anymore.</p>
          <a href="#/family">← Back to the family</a>
        </div>
      </div>
    );
  }
  const hasPin = data.kidsWithPin.includes(kid.id);
  const rates = data.rates.filter((r) => r.kid_id === kid.id);

  return (
    <div className="stack-lg">
      <a className="back" href="#/family">
        ← {data.family.name}
      </a>

      <div className="kid-head">
        <span className="avatar xl" aria-hidden="true">
          {kid.avatar}
        </span>
        <div>
          <h1 className="page-title">{kid.name}</h1>
          <div className="chips">
            <span className="chip">{kid.mode === "junior" ? "Junior view" : "Standard view"}</span>
            {kid.account_opened_on ? (
              <span className="chip chip-good">Open since {formatDay(kid.account_opened_on)}</span>
            ) : (
              <span className="chip">Opens at first login</span>
            )}
            {!hasPin && <span className="chip chip-warn">No PIN yet</span>}
          </div>
        </div>
      </div>

      <div className="kid-layout">
        <div className="stack">
          <BalancePanel kid={kid} account={account} />
          <RecordMoney kid={kid} account={account} />
          <Activity account={account} />
        </div>
        <div className="stack">
          <RequestReview requests={data.withdrawalRequests.filter((r) => r.kid_id === kid.id)} showKid={false} />
          <RatesPanel kid={kid} rates={rates} />
          <ProfilePanel kid={kid} hasPin={hasPin} />
          <DangerZone kid={kid} />
        </div>
      </div>
    </div>
  );
}

function BalancePanel({ kid, account }: { kid: Kid; account: KidAccount }) {
  return (
    <section className="panel hero" aria-label="Balance">
      <p className="eyebrow">Balance</p>
      <p className="hero-number">{formatCents(account.balanceCents)}</p>
      <div className="split">
        <div>
          <span className="swatch" style={{ "--swatch": "var(--series-putin)" } as React.CSSProperties} />
          <span className="split-label">Put in</span>
          <span className="split-value">{formatCents(account.contributedCents)}</span>
        </div>
        <div>
          <span className="swatch" style={{ "--swatch": "var(--series-interest)" } as React.CSSProperties} />
          <span className="split-label">Interest paid</span>
          <span className="split-value">{formatCents(account.interestPaidCents)}</span>
        </div>
      </div>
      <p className="cheer">
        {account.opened && account.nextPayday
          ? `${formatCents(account.accruingCents)} earned so far this month, paid on ${formatDay(account.nextPayday)}.`
          : `Interest starts on ${kid.name}'s first login.`}
      </p>
    </section>
  );
}

type MoneyKind = "deposit" | "withdrawal" | "add" | "subtract";

function RecordMoney({ kid, account }: { kid: Kid; account: KidAccount }) {
  const { today } = useApp();
  const [run, busy, error] = useAction();
  const [kind, setKind] = useState<MoneyKind>("deposit");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const cents = dollarsToCents(amount);
  const minDate = kid.account_opened_on ? startOfMonth(today) : undefined;
  const takesMoney = kind === "withdrawal" || kind === "subtract";
  const tooMuch = takesMoney && cents > account.balanceCents;
  const dateOk = date <= today && (!minDate || date >= minDate);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t: NewTransaction = {
      kid_id: kid.id,
      kind: kind === "deposit" || kind === "withdrawal" ? kind : "adjustment",
      amount_cents: takesMoney ? -cents : cents,
      occurred_on: date,
      note: note.trim() || null,
    };
    if (await run((api) => api.addTransaction(t))) {
      setDone(`${takesMoney ? "Took out" : "Added"} ${formatCents(cents)}.`);
      setAmount("");
      setNote("");
    }
  };

  const labels: Record<MoneyKind, string> = { deposit: "Deposit", withdrawal: "Withdrawal", add: "Correction +", subtract: "Correction −" };

  return (
    <form className="panel stack" onSubmit={submit} aria-labelledby="record-title">
      <h2 className="panel-title" id="record-title">
        Record money
      </h2>
      <div className="segmented four" role="radiogroup" aria-label="Type">
        {(Object.keys(labels) as MoneyKind[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            className={kind === k ? "on" : ""}
            onClick={() => {
              setKind(k);
              setDone(null);
            }}
          >
            {labels[k]}
          </button>
        ))}
      </div>
      <div className="row">
        <Field label="Amount" prefix="$" value={amount} onChange={(v) => (setAmount(v), setDone(null))} />
        <Field
          label="Date"
          type="date"
          value={date}
          onChange={setDate}
          min={minDate}
          max={today}
          hint={minDate ? "This month only: earlier Paydays are final." : undefined}
        />
      </div>
      <Field
        label="Note (optional)"
        inputMode="text"
        value={note}
        onChange={setNote}
        maxLength={200}
        placeholder={kind === "deposit" ? "Birthday money" : kind === "withdrawal" ? "Toy store" : "Fixing a mistake"}
      />
      {tooMuch && <p className="error-msg">{kid.name} only has {formatCents(account.balanceCents)}.</p>}
      {!dateOk && <p className="error-msg">Pick a date {minDate ? "in this month, " : ""}not in the future.</p>}
      <ErrorMessage error={error} />
      <div className="actions">
        <button className="btn btn-primary" disabled={busy || cents === 0 || tooMuch || !dateOk}>
          {busy ? "Saving…" : takesMoney ? "Take out" : "Add"}
        </button>
        {done && <span className="saved">{done}</span>}
      </div>
    </form>
  );
}

function Activity({ account }: { account: KidAccount }) {
  const [run, busy, error] = useAction();
  const label = { deposit: "Deposit", withdrawal: "Withdrawal", interest: "Payday 🎉", adjustment: "Correction" } as const;
  return (
    <section className="panel stack" aria-labelledby="activity-title">
      <h2 className="panel-title" id="activity-title">
        Activity
      </h2>
      <ErrorMessage error={error} />
      {account.activity.length === 0 ? (
        <p className="muted">Nothing yet.</p>
      ) : (
        <ul className="list">
          {account.activity.map((a) => (
            <li key={a.id} className={`list-row activity ${a.kind}`}>
              <span className="activity-main">
                <strong>{a.note && a.kind !== "interest" ? a.note : label[a.kind]}</strong>
                <span className="hint">
                  {formatDay(a.date)}
                  {a.note && a.kind !== "interest" ? ` · ${label[a.kind]}` : ""}
                </span>
              </span>
              <span className={`amount ${a.amountCents < 0 ? "neg" : "pos"}`}>
                {a.amountCents < 0 ? "−" : "+"}
                {formatCents(Math.abs(a.amountCents))}
              </span>
              {a.deletable ? (
                <ConfirmButton
                  label="×"
                  confirmLabel="Delete"
                  ariaLabel="Delete this entry"
                  className="icon-button"
                  disabled={busy}
                  onConfirm={() => void run((api) => api.deleteTransaction(a.id))}
                />
              ) : (
                <span className="icon-spacer" />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RatesPanel({ kid, rates }: { kid: Kid; rates: RatePeriodRow[] }) {
  const { today } = useApp();
  const [run, busy, error] = useAction();
  const [from, setFrom] = useState(firstOfNextMonth(today));
  const [rate, setRate] = useState("");

  const rows = (
    <tbody>
      {rates.map((r, i) => {
        const next = rates[i + 1];
        const status = r.effective_from > today ? "Scheduled" : next && next.effective_from <= today ? "Past" : "Now";
        return (
          <tr key={r.id} className={status === "Now" ? "current" : undefined}>
            <td>{formatDay(r.effective_from)}</td>
            <td>{formatPercent(r.monthly_rate, 3)}</td>
            <td>{formatPercent(annualFromMonthlyRate(r.monthly_rate), 1)}</td>
            <td>
              {status}
              {status === "Scheduled" && (
                <button
                  type="button"
                  className="link-button danger inline"
                  disabled={busy}
                  onClick={() => void run((api) => api.deleteRatePeriod(r.id))}
                >
                  Cancel
                </button>
              )}
            </td>
          </tr>
        );
      })}
    </tbody>
  );

  if (!kid.account_opened_on) {
    return (
      <section className="panel stack" aria-labelledby="rates-title">
        <h2 className="panel-title" id="rates-title">
          Interest rates
        </h2>
        <p className="muted">Starting on {kid.name}'s first login:</p>
        <ul className="rate-plan">
          {kid.intro_months > 0 && (
            <li>
              <strong>{formatPercent(kid.intro_monthly_rate, 3)} a month</strong> for {kid.intro_months} month
              {kid.intro_months === 1 ? "" : "s"}{" "}
              <span className="hint">(≈ {formatPercent(annualFromMonthlyRate(kid.intro_monthly_rate), 1)} a year)</span>
            </li>
          )}
          <li>
            <strong>{formatPercent(kid.ongoing_monthly_rate, 3)} a month</strong>
            {kid.intro_months > 0 ? " after that" : ""}{" "}
            <span className="hint">(≈ {formatPercent(annualFromMonthlyRate(kid.ongoing_monthly_rate), 1)} a year)</span>
          </li>
        </ul>
        <p className="hint">Change these under Profile below.</p>
      </section>
    );
  }

  const rateFraction = percentToFraction(rate);
  const valid = rate.trim() !== "" && rateFraction <= 0.2 && from >= today;

  return (
    <section className="panel stack" aria-labelledby="rates-title">
      <h2 className="panel-title" id="rates-title">
        Interest rates
      </h2>
      <div className="table-wrap flat">
        <table>
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col">Per month</th>
              <th scope="col">Per year</th>
              <th scope="col"></th>
            </tr>
          </thead>
          {rows}
        </table>
      </div>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run((api) => api.addRatePeriod(kid.id, from, rateFraction))) setRate("");
        }}
      >
        <h3 className="sub-title">Change the rate</h3>
        <div className="row">
          <Field label="Starting" type="date" value={from} onChange={setFrom} min={today} max={addDays(today, 3650)} />
          <Field
            label="New rate"
            suffix="% / mo"
            value={rate}
            onChange={setRate}
            hint={rate.trim() ? `≈ ${formatPercent(annualFromMonthlyRate(rateFraction), 1)} a year` : undefined}
          />
        </div>
        <ErrorMessage error={error} />
        <button className="btn btn-secondary" disabled={busy || !valid}>
          Schedule change
        </button>
      </form>
    </section>
  );
}

function ProfilePanel({ kid, hasPin }: { kid: Kid; hasPin: boolean }) {
  const [run, busy, error] = useAction();
  const [pinRun, pinBusy, pinError] = useAction();
  const [saved, setSaved] = useState(false);
  const [pin, setPin] = useState("");
  const [pinSaved, setPinSaved] = useState(false);

  return (
    <section className="panel stack" aria-labelledby="profile-title">
      <h2 className="panel-title" id="profile-title">
        Profile
      </h2>
      <KidForm
        key={JSON.stringify(kid)}
        initial={kid}
        showRates={!kid.account_opened_on}
        submitLabel="Save profile"
        busy={busy}
        error={error}
        onSubmit={async (changes) => setSaved(await run((api) => api.updateKid(kid.id, changes)))}
      />
      {saved && <span className="saved">Saved ✓</span>}

      <form
        className="stack pin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await pinRun((api) => api.setKidPin(kid.id, pin))) {
            setPin("");
            setPinSaved(true);
          }
        }}
      >
        <h3 className="sub-title">{hasPin ? "Change PIN" : "Set a PIN"}</h3>
        <Field
          label="4-digit PIN"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(v) => (setPin(v.replace(/\D/g, "").slice(0, 4)), setPinSaved(false))}
          maxLength={4}
          hint={`${kid.name} enters this on the family device.`}
        />
        <ErrorMessage error={pinError} />
        <div className="actions">
          <button className="btn btn-secondary" disabled={pinBusy || pin.length !== 4}>
            {hasPin ? "Change PIN" : "Set PIN"}
          </button>
          {pinSaved && <span className="saved">PIN saved ✓</span>}
        </div>
      </form>
    </section>
  );
}

function DangerZone({ kid }: { kid: Kid }) {
  const [run, busy, error] = useAction();
  const [confirmName, setConfirmName] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <section className="panel stack danger-zone" aria-labelledby="danger-title">
      <h2 className="panel-title" id="danger-title">
        Delete account
      </h2>
      {!open ? (
        <button type="button" className="btn btn-ghost danger" onClick={() => setOpen(true)}>
          Delete {kid.name}'s account…
        </button>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run((api) => api.deleteKid(kid.id))) navigate("/family");
          }}
        >
          <p className="muted">This permanently deletes {kid.name}'s account and all its history. Type their name to confirm.</p>
          <Field label="Name" inputMode="text" value={confirmName} onChange={setConfirmName} />
          <ErrorMessage error={error} />
          <div className="actions">
            <button className="btn btn-danger" disabled={busy || confirmName.trim() !== kid.name}>
              Delete forever
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
