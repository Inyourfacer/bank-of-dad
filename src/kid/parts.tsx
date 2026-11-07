import { useState } from "react";
import { ErrorMessage } from "../components/Field";
import type { KidAccount } from "../data/account";
import { pinMessage } from "../data/api";
import { useApp } from "../data/AppContext";
import type { Kid, WithdrawalRequest } from "../data/types";
import { addDays, toDayNumber } from "../engine/dates";
import { formatCents, formatDay } from "../lib/format";
import { useKidSession } from "./KidSession";

export function KidBar({ kid }: { kid: Kid }) {
  const { signOut } = useKidSession();
  return (
    <div className="kid-bar">
      <span className="avatar lg" aria-hidden="true">
        {kid.avatar}
      </span>
      <h1 className="page-title">Hi, {kid.name}!</h1>
      <button type="button" className="btn btn-ghost" onClick={signOut}>
        Switch kid
      </button>
    </div>
  );
}

export function WelcomeBanner({ kid, rateText }: { kid: Kid; rateText: string }) {
  const { session } = useKidSession();
  const [hidden, setHidden] = useState(false);
  if (!session?.firstLogin || hidden) return null;
  return (
    <div className="welcome" role="status">
      <p className="big-emoji" aria-hidden="true">
        🎉
      </p>
      <div>
        <h2 className="panel-title">Your account is open, {kid.name}!</h2>
        <p>Starting today, the Bank of Dad pays you {rateText}. Interest is paid on the last day of every month.</p>
      </div>
      <button type="button" className="link-button" onClick={() => setHidden(true)}>
        Got it
      </button>
    </div>
  );
}

export function daysUntil(today: string, date: string): number {
  return toDayNumber(date) - toDayNumber(today);
}

export function PaydayNote({ account, today }: { account: KidAccount; today: string }) {
  if (!account.nextPayday) return null;
  const days = daysUntil(today, account.nextPayday);
  return (
    <p className="payday-note">
      <span className="chip chip-good">{days === 0 ? "Payday is today! 🎉" : `Payday in ${days} day${days === 1 ? "" : "s"}`}</span>
      <span className="muted">
        {formatCents(account.accruingCents)} earned so far this month
      </span>
    </p>
  );
}

export function RequestList({ kid, requests }: { kid: Kid; requests: WithdrawalRequest[] }) {
  const { api, refresh, today } = useApp();
  const { session, signOut } = useKidSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Pending requests, plus anything decided in the last week.
  const weekAgo = addDays(today, -7);
  const shown = requests.filter((r) => r.status === "pending" || (r.decided_at && r.decided_at.slice(0, 10) >= weekAgo));
  if (shown.length === 0) return null;

  const cancel = async (id: string) => {
    if (!api || !session) return;
    setBusy(true);
    setError(null);
    try {
      const s = await api.cancelWithdrawal(kid.id, session.pin, id);
      if (s !== "ok") {
        setError(pinMessage(s));
        if (s === "wrong" || s === "no_pin") signOut();
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const label = { pending: "Waiting for a parent", approved: "Approved", denied: "Not this time", cancelled: "You cancelled" } as const;
  return (
    <section className="panel stack" aria-labelledby="req-title">
      <h2 className="panel-title" id="req-title">
        Your requests
      </h2>
      <ErrorMessage error={error} />
      <ul className="list">
        {shown.map((r) => (
          <li key={r.id} className="list-row">
            <span className="activity-main">
              <strong>{r.reason ?? "Withdrawal"}</strong>
              <span className="hint">{formatDay(r.created_at.slice(0, 10))}</span>
            </span>
            <span className="amount">{formatCents(r.amount_cents)}</span>
            <span className={`chip ${r.status === "approved" ? "chip-good" : r.status === "pending" ? "chip-warn" : ""}`}>{label[r.status]}</span>
            {r.status === "pending" && (
              <button type="button" className="link-button" disabled={busy} onClick={() => void cancel(r.id)}>
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RecentActivity({ account }: { account: KidAccount }) {
  const items = account.activity.slice(0, 8);
  const label = { deposit: "Deposit", withdrawal: "Took out", interest: "Payday 🎉", adjustment: "Correction" } as const;
  return (
    <section className="panel stack" aria-labelledby="recent-title">
      <h2 className="panel-title" id="recent-title">
        Recent activity
      </h2>
      {items.length === 0 ? (
        <p className="muted">Nothing yet.</p>
      ) : (
        <ul className="list">
          {items.map((a) => (
            <li key={a.id} className={`list-row activity ${a.kind}`}>
              <span className="activity-main">
                <strong>{a.kind === "interest" ? label.interest : (a.note ?? label[a.kind])}</strong>
                <span className="hint">{formatDay(a.date, true)}</span>
              </span>
              <span className={`amount ${a.amountCents < 0 ? "neg" : "pos"}`}>
                {a.amountCents < 0 ? "−" : "+"}
                {formatCents(Math.abs(a.amountCents))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
