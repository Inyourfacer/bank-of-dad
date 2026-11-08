import { useState, type FormEvent } from "react";
import { ErrorMessage, Field } from "../components/Field";
import { pinMessage } from "../data/api";
import { useApp } from "../data/AppContext";
import { keepItValue } from "../data/kidProjection";
import type { Kid, RatePeriodRow } from "../data/types";
import { dollarsToCents, formatCents } from "../lib/format";
import type { DemoApi } from "../data/demoApi";
import { navigate } from "../lib/router";
import { useKidSession } from "./KidSession";

interface Props {
  kid: Kid;
  rates: RatePeriodRow[];
  availableCents: number;
  simple?: boolean;
  onClose: () => void;
}

/** Ask a parent for money, after seeing what that money would grow into. */
export function WithdrawPanel({ kid, rates, availableCents, simple, onClose }: Props) {
  const { api, refresh, today } = useApp();
  const { session, signOut } = useKidSession();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  const cents = dollarsToCents(amount);
  const tooMuch = cents > availableCents;
  const [oneYear, fiveYears] = keepItValue(cents, rates, today, [1, 5]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!api || !session || cents === 0 || tooMuch) return;
    setBusy(true);
    setError(null);
    try {
      const status = await api.requestWithdrawal(kid.id, session.pin, cents, reason);
      if (status !== "ok") {
        setError(pinMessage(status));
        if (status === "wrong" || status === "no_pin") signOut();
        return;
      }
      await refresh();
      setSent(cents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (sent !== null) {
    return (
      <div className="panel stack center">
        <p className="big-emoji" aria-hidden="true">
          📨
        </p>
        <h2 className="panel-title">Sent!</h2>
        <p className="muted">Your request for {formatCents(sent)} is waiting for a parent to say yes.</p>
        <div className="actions center-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
          {api?.kind === "demo" && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                onClose();
                await (api as DemoApi).signInAs("parent");
                navigate("/family");
                window.scrollTo(0, 0);
              }}
            >
              Demo: approve it as Dad
            </button>
          )}
        </div>
      </div>
    );
  }

  const quick = [100, 500, 1000, 2000].filter((c) => c <= availableCents);

  return (
    <form className="panel stack" onSubmit={submit} aria-labelledby="withdraw-title">
      <h2 className="panel-title" id="withdraw-title">
        Take money out
      </h2>
      <p className="muted">You can ask for up to {formatCents(availableCents)}.</p>
      {simple && quick.length > 0 && (
        <div className="quick-amounts" role="group" aria-label="Quick amounts">
          {quick.map((c) => (
            <button key={c} type="button" className={`btn btn-secondary${cents === c ? " on" : ""}`} onClick={() => setAmount(String(c / 100))}>
              {formatCents(c).replace(".00", "")}
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <Field label="How much?" prefix="$" value={amount} onChange={setAmount} />
        <Field label="What's it for?" inputMode="text" value={reason} onChange={setReason} maxLength={200} placeholder="A new book" />
      </div>
      {tooMuch && <p className="error-msg">That's more than you have. You can ask for up to {formatCents(availableCents)}.</p>}

      {cents > 0 && !tooMuch && (
        <div className="reality-check" role="status">
          <p className="reality-title">Before you decide…</p>
          <p>If you keep {formatCents(cents)} in the Bank of Dad instead, it grows to:</p>
          <div className="reality-figures">
            <div>
              <span className="reality-number">{formatCents(oneYear)}</span>
              <span className="hint">in 1 year</span>
            </div>
            <div>
              <span className="reality-number">{formatCents(fiveYears)}</span>
              <span className="hint">in 5 years</span>
            </div>
          </div>
        </div>
      )}

      <ErrorMessage error={error} />
      <div className="actions">
        <button className="btn btn-primary" disabled={busy || cents === 0 || tooMuch}>
          {busy ? "Sending…" : cents > 0 ? `Ask for ${formatCents(cents)}` : "Ask a parent"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Keep saving
        </button>
      </div>
    </form>
  );
}
