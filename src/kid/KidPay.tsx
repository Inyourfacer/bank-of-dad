import { PayBar, PayStub } from "../components/PayStub";
import { useApp } from "../data/AppContext";
import { paycheckFor, paydayFor } from "../data/payroll";
import type { Kid } from "../data/types";
import { addMonths, startOfMonth } from "../engine/dates";
import { formatCents, formatDay, formatMonthYear } from "../lib/format";

/** The kid's next payday and estimated take-home, from their pay plan. */
function useNextPay(kid: Kid) {
  const { data, today } = useApp();
  const plan = data?.payPlans.find((p) => p.kid_id === kid.id && p.enabled);
  const statements = data?.payStatements.filter((s) => s.kid_id === kid.id) ?? [];
  if (!data || !plan) return { plan: undefined, statements, next: null };
  const paidThisMonth = statements.some((s) => s.pay_month.slice(0, 10) === startOfMonth(today));
  const thisMonth = paydayFor(plan, today);
  const nextDate = !paidThisMonth && thisMonth >= today ? thisMonth : paydayFor(plan, addMonths(startOfMonth(today), 1));
  return { plan, statements, next: { date: nextDate, paycheck: paycheckFor(plan, data.family.tax_brackets) } };
}

/** Standard view: the latest pay stub, next payday, and past stubs. */
export function KidPay({ kid }: { kid: Kid }) {
  const { plan, statements, next } = useNextPay(kid);
  if (!plan && statements.length === 0) return null;
  const [latest, ...older] = statements;

  return (
    <section className="panel stack" aria-labelledby="kidpay-title">
      <h2 className="panel-title" id="kidpay-title">
        Your pay
      </h2>
      {next && (
        <p className="muted">
          Next payday: <strong>{formatDay(next.date, true)}</strong>. You'll earn {formatCents(next.paycheck.grossCents)} and keep about{" "}
          <strong>{formatCents(next.paycheck.netCents)}</strong> after taxes and bills.
        </p>
      )}
      {latest ? (
        <PayStub
          stub={{ grossCents: latest.gross_cents, taxes: latest.taxes, expenses: latest.expenses, netCents: latest.net_cents }}
          payMonth={latest.pay_month}
          paidOn={latest.paid_on}
          explain
          netLabel="You keep (deposited)"
        />
      ) : (
        next && <PayStub stub={next.paycheck} explain netLabel="You'll keep" />
      )}
      {older.length > 0 && (
        <details className="stub-details">
          <summary>
            <span>Past pay stubs ({older.length})</span>
          </summary>
          <ul className="list">
            {older.slice(0, 12).map((s) => (
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
                    netLabel="You kept"
                  />
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Junior view: big, simple numbers and one bar. */
export function JuniorPay({ kid }: { kid: Kid }) {
  const { plan, statements, next } = useNextPay(kid);
  const latest = statements[0];
  const stub = latest
    ? { gross: latest.gross_cents, taxes: latest.taxes, bills: latest.expenses, net: latest.net_cents }
    : next
      ? { gross: next.paycheck.grossCents, taxes: next.paycheck.taxes, bills: next.paycheck.expenses, net: next.paycheck.netCents }
      : null;
  if (!plan && !latest) return null;
  if (!stub) return null;
  const tax = stub.taxes.reduce((s, l) => s + l.cents, 0);
  const bills = stub.bills.reduce((s, l) => s + l.cents, 0);

  return (
    <section className="panel stack center" aria-labelledby="jpay-title">
      <h2 className="section-title" id="jpay-title">
        {latest ? `Payday! ${formatMonthYear(latest.pay_month)}` : "Your pay"}
      </h2>
      <ul className="junior-pay">
        <li>
          <span className="hint">You earned</span>
          <span className="jp-number">{formatCents(stub.gross)}</span>
        </li>
        <li>
          <span className="hint">Taxes</span>
          <span className="jp-number minus">−{formatCents(tax)}</span>
        </li>
        <li>
          <span className="hint">Bills</span>
          <span className="jp-number minus">−{formatCents(bills)}</span>
        </li>
        <li className="jp-keep">
          <span className="hint">You keep</span>
          <span className="jp-number">{formatCents(stub.net)}</span>
        </li>
      </ul>
      <PayBar gross={stub.gross} tax={tax} bills={bills} net={stub.net} />
      {next && <p className="hint">Next payday: {formatDay(next.date, true)}</p>}
    </section>
  );
}
