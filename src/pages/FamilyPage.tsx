import { useState } from "react";
import { KidForm } from "../components/KidForm";
import { LiabilityForecast } from "../components/LiabilityForecast";
import { RequestReview } from "../components/RequestReview";
import { useAction, useApp } from "../data/AppContext";
import { useAccounts } from "../data/useAccounts";
import { loanStatus } from "../engine/cd";
import { formatCents, formatMonthYear } from "../lib/format";

const formatDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function FamilyPage() {
  const { data, today } = useApp();
  const accounts = useAccounts();
  const [adding, setAdding] = useState(false);
  const [run, busy, error] = useAction();
  if (!data) return null;

  const all = [...accounts.values()];
  // Savings plus the Spend and Give jars: all of it is owed to the kids.
  const jars = data.jarEntries.reduce((s, j) => s + j.amount_cents, 0);
  // Money locked in CDs is still the kids' (counted at what they put in).
  const locked = data.cds.filter((c) => c.status === "open").reduce((s, c) => s + c.principal_cents, 0);
  const owed = all.reduce((s, a) => s + a.balanceCents, 0) + jars + locked;
  // What the kids owe the Bank of Dad on loans.
  const loansOwed = data.loans
    .filter((l) => l.status === "active")
    .reduce((s, l) => s + loanStatus(l, data.loanPayments.filter((p) => p.loan_id === l.id), today).balanceCents, 0);
  const accruing = all.reduce((s, a) => s + a.accruingCents, 0);
  const paid = all.reduce((s, a) => s + a.interestPaidCents, 0);
  const missingPin = data.kids.filter((k) => !data.kidsWithPin.includes(k.id));
  const anyOpen = all.some((a) => a.opened);
  const payday = all.find((a) => a.nextPayday)?.nextPayday;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <p className="eyebrow">Hi, {data.me.display_name}</p>
          <h1 className="page-title">{data.family.name}</h1>
        </div>
        <a className="btn btn-ghost" href="#/family/settings">
          Family settings
        </a>
      </div>

      <RequestReview requests={data.withdrawalRequests} loans={data.loans} />

      <div className="tiles">
        <div className="panel tile">
          <h2>The Bank of Dad owes</h2>
          <p className="tile-number">{formatCents(owed)}</p>
          <p className="hint">
            across {data.kids.length} account{data.kids.length === 1 ? "" : "s"}
            {jars > 0 ? `, including ${formatCents(jars)} in Spend and Give jars` : ""}
            {locked > 0 ? ` and ${formatCents(locked)} locked in CDs` : ""}
          </p>
          {loansOwed > 0 && <p className="hint">The kids owe you {formatCents(loansOwed)} on loans.</p>}
        </div>
        <div className="panel tile">
          <h2>Interest this month</h2>
          <p className="tile-number">{formatCents(accruing)}</p>
          <p className="hint">{anyOpen && payday ? `so far, paid ${formatDay(payday)}` : "starts when accounts open"}</p>
        </div>
        <div className="panel tile">
          <h2>Interest paid to date</h2>
          <p className="tile-number">{formatCents(paid)}</p>
          <p className="hint">money the kids didn't have to earn</p>
        </div>
      </div>

      {missingPin.length > 0 && (
        <p className="notice" role="status">
          {missingPin.map((k) => k.name).join(", ")} {missingPin.length === 1 ? "needs" : "need"} a PIN before they can sign in.
        </p>
      )}

      <section aria-labelledby="kids-title" className="stack">
        <div className="section-head">
          <h2 id="kids-title">Kids</h2>
          {!adding && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              Add a kid
            </button>
          )}
        </div>

        {adding && (
          <div className="panel">
            <h3 className="panel-title">New account</h3>
            <KidForm
              submitLabel="Add kid"
              busy={busy}
              error={error}
              onCancel={() => setAdding(false)}
              onSubmit={async (kid) => {
                if (await run((api) => api.addKid(data.family.id, kid))) setAdding(false);
              }}
            />
          </div>
        )}

        {data.kids.length === 0 && !adding ? (
          <div className="panel empty">
            <p>No kids yet. Add each kid to give them a Bank of Dad account.</p>
          </div>
        ) : (
          <ul className="kid-grid">
            {data.kids.map((k) => {
              const a = accounts.get(k.id)!;
              return (
                <li key={k.id}>
                  <a className="panel kid-card" href={`#/family/kid/${k.id}`}>
                    <span className="avatar lg" aria-hidden="true">
                      {k.avatar}
                    </span>
                    <span className="kid-card-body">
                      <span className="kid-name">{k.name}</span>
                      <span className="kid-balance">{formatCents(a.balanceCents)}</span>
                      {a.opened ? (
                        <span className="chip chip-good">+{formatCents(a.accruingCents)} this month</span>
                      ) : (
                        <span className="chip">Opens at first login</span>
                      )}
                      {data.withdrawalRequests.some((r) => r.kid_id === k.id && r.status === "pending") && (
                        <span className="chip chip-warn">Request waiting</span>
                      )}
                    </span>
                    <span className="kid-meta">
                      {k.account_opened_on ? `Since ${formatMonthYear(k.account_opened_on)}` : k.mode === "junior" ? "Junior" : "Standard"}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <LiabilityForecast />
    </div>
  );
}
