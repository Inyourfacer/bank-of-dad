import { useState } from "react";
import { RateComparison } from "../components/RateComparison";
import type { Kid } from "../data/types";
import { formatCents, formatPercent } from "../lib/format";
import { KidPay } from "./KidPay";
import { kidDadRates } from "./kidRates";
import { KidBar, PaydayNote, RecentActivity, RequestList, WelcomeBanner } from "./parts";
import { useKidData } from "./useKidData";
import { WhatIfPanel } from "./WhatIfPanel";
import { WithdrawPanel } from "./WithdrawPanel";

/** Standard view (about 10–18): numbers, charts and what-ifs. */
export function KidHome({ kid }: { kid: Kid }) {
  const d = useKidData(kid);
  const [withdrawing, setWithdrawing] = useState(false);
  const dad = kidDadRates(d.rates, d.today);

  return (
    <div className="stack-lg">
      <KidBar kid={kid} />
      <WelcomeBanner kid={kid} rateText={dad[0] ? `${formatPercent(dad[0].monthly)} every month` : "interest every month"} />

      <section className="panel hero" aria-label="Your money">
        <p className="eyebrow">Your balance</p>
        <p className="hero-number">{formatCents(d.account.balanceCents)}</p>
        <p className="cheer">
          {d.account.interestPaidCents > 0
            ? `The Bank of Dad has paid you ${formatCents(d.account.interestPaidCents)} so far. 🎉`
            : "Your first Payday is coming. The Bank of Dad pays you just for saving! 🎉"}
        </p>
        <PaydayNote account={d.account} today={d.today} />
        {d.pendingCents > 0 && <p className="hint">{formatCents(d.pendingCents)} is waiting for a parent to approve.</p>}
        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={() => setWithdrawing(true)} disabled={d.availableCents === 0}>
            Take money out
          </button>
        </div>
      </section>

      {withdrawing && <WithdrawPanel kid={kid} rates={d.rates} availableCents={d.availableCents} onClose={() => setWithdrawing(false)} />}

      <div className="kid-layout">
        <div className="stack">
          <WhatIfPanel kid={kid} rates={d.rates} transactions={d.transactions} today={d.today} bankApy={d.bankApy} />
        </div>
        <div className="stack">
          <RequestList kid={kid} requests={d.requests} />
          <KidPay kid={kid} />
          <div className="panel">
            <RateComparison dad={dad} bankApy={d.bankApy} title="Your rate vs. a regular bank" headlineIndex={dad.length - 1} />
          </div>
          <RecentActivity account={d.account} />
        </div>
      </div>
    </div>
  );
}
