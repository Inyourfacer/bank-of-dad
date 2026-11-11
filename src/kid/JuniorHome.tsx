import { useMemo, useState } from "react";
import { kidWhatIf } from "../data/kidProjection";
import type { Kid } from "../data/types";
import { formatCents } from "../lib/format";
import { KidBar, PaydayNote, RequestList, WelcomeBanner } from "./parts";
import { JuniorPay } from "./KidPay";
import { SavingsJar } from "./SavingsJar";
import { useKidData } from "./useKidData";
import { WithdrawPanel } from "./WithdrawPanel";
import { kidDadRates } from "./kidRates";

const WAITS = [
  { months: 12, label: "1 year" },
  { months: 36, label: "3 years" },
  { months: 60, label: "5 years" },
];

/** Junior view (about 5–9): a jar, one big number, and "if you wait". */
export function JuniorHome({ kid }: { kid: Kid }) {
  const d = useKidData(kid);
  const [withdrawing, setWithdrawing] = useState(false);
  const dad = kidDadRates(d.rates, d.today);

  const future = useMemo(
    () =>
      WAITS.map((w) => ({
        ...w,
        cents: kidWhatIf({ kid, rates: d.rates, transactions: d.transactions, today: d.today, months: w.months, bankApy: d.bankApy }).scenario
          .balanceCents,
      })),
    [kid, d.rates, d.transactions, d.today, d.bankApy],
  );

  return (
    <div className="stack-lg junior">
      <KidBar kid={kid} />
      <WelcomeBanner kid={kid} rateText={dad[0] ? `${Math.round(dad[0].monthly * 100)}¢ for every dollar, every month` : "interest every month"} />

      <section className="panel junior-hero" aria-label="Your money">
        <SavingsJar putInCents={d.account.contributedCents} interestCents={d.account.balanceCents - d.account.contributedCents} />
        <div className="stack center">
          <p className="eyebrow">You have</p>
          <p className="junior-number">{formatCents(d.account.balanceCents)}</p>
          <p className="cheer">
            {d.account.interestPaidCents > 0
              ? `The Bank of Dad gave you ${formatCents(d.account.interestPaidCents)} just for saving! 🎉`
              : "Soon the Bank of Dad will add money just for saving! 🎉"}
          </p>
          <PaydayNote account={d.account} today={d.today} />
        </div>
      </section>

      <JuniorPay kid={kid} />

      <section className="stack" aria-labelledby="wait-title">
        <h2 className="section-title center" id="wait-title">
          If you wait…
        </h2>
        <ul className="wait-cards">
          {future.map((f) => (
            <li key={f.months} className="panel">
              <span className="hint">{f.label}</span>
              <span className="wait-number">{formatCents(f.cents)}</span>
            </li>
          ))}
        </ul>
      </section>

      <RequestList kid={kid} requests={d.requests} />

      {withdrawing ? (
        <WithdrawPanel kid={kid} rates={d.rates} availableCents={d.availableCents} simple onClose={() => setWithdrawing(false)} />
      ) : (
        <div className="center">
          <button type="button" className="btn btn-secondary" onClick={() => setWithdrawing(true)} disabled={d.availableCents === 0}>
            Take money out
          </button>
        </div>
      )}
    </div>
  );
}
