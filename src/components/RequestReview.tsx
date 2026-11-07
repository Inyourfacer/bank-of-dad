import { useAction, useApp } from "../data/AppContext";
import type { WithdrawalRequest } from "../data/types";
import { useAccounts } from "../data/useAccounts";
import { formatCents, formatDay } from "../lib/format";
import { ErrorMessage } from "./Field";

/** Pending withdrawal requests with Approve / Deny, for parents. */
export function RequestReview({ requests, showKid = true }: { requests: WithdrawalRequest[]; showKid?: boolean }) {
  const { data } = useApp();
  const accounts = useAccounts();
  const [run, busy, error] = useAction();
  const pending = requests.filter((r) => r.status === "pending");
  if (!data || pending.length === 0) return null;

  return (
    <section className="panel stack attention" aria-labelledby="review-title">
      <h2 className="panel-title" id="review-title">
        Waiting for you <span className="count">{pending.length}</span>
      </h2>
      <ErrorMessage error={error} />
      <ul className="list">
        {pending.map((r) => {
          const kid = data.kids.find((k) => k.id === r.kid_id);
          const balance = accounts.get(r.kid_id)?.balanceCents ?? 0;
          const short = r.amount_cents > balance;
          return (
            <li key={r.id} className="list-row request-row">
              {showKid && kid && (
                <span className="avatar" aria-hidden="true">
                  {kid.avatar}
                </span>
              )}
              <span className="activity-main">
                <strong>
                  {showKid && kid ? `${kid.name}: ` : ""}
                  {formatCents(r.amount_cents)}
                  {r.reason ? ` for “${r.reason}”` : ""}
                </strong>
                <span className={short ? "error-msg" : "hint"}>
                  Asked {formatDay(r.created_at.slice(0, 10))} · balance {formatCents(balance)}
                  {short ? " (not enough)" : ""}
                </span>
              </span>
              <span className="request-actions">
                <button type="button" className="btn btn-primary btn-sm" disabled={busy || short} onClick={() => void run((api) => api.decideWithdrawal(r.id, true))}>
                  Approve
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run((api) => api.decideWithdrawal(r.id, false))}>
                  Deny
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="hint">Approving records the withdrawal today. Hand over the cash when you approve.</p>
    </section>
  );
}
