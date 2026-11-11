import type { PayLine } from "../engine/paycheck";
import { formatCents, formatDay, formatMonthYear } from "../lib/format";

export interface StubData {
  grossCents: number;
  taxes: PayLine[];
  expenses: PayLine[];
  netCents: number;
}

interface Props {
  stub: StubData;
  /** e.g. "November 2026" heading; omit for a preview. */
  payMonth?: string;
  paidOn?: string;
  /** Kid-friendly explanations under each section. */
  explain?: boolean;
  /** Label for the bottom line. */
  netLabel?: string;
}

const sum = (lines: PayLine[]) => lines.reduce((s, l) => s + l.cents, 0);

/** A pay stub: salary, taxes, bills, and what's left to keep. */
export function PayStub({ stub, payMonth, paidOn, explain = false, netLabel = "Take-home pay" }: Props) {
  const tax = sum(stub.taxes);
  const bills = sum(stub.expenses);
  return (
    <div className="paystub">
      {payMonth && (
        <div className="paystub-head">
          <span className="paystub-title">Pay stub · {formatMonthYear(payMonth)}</span>
          {paidOn && <span className="hint">Paid {formatDay(paidOn, true)}</span>}
        </div>
      )}

      <PayBar gross={stub.grossCents} tax={tax} bills={bills} net={stub.netCents} />

      <table className="paystub-table">
        <tbody>
          <tr className="paystub-gross">
            <th scope="row">Monthly salary</th>
            <td>{formatCents(stub.grossCents)}</td>
          </tr>

          <tr className="paystub-section">
            <th scope="row" colSpan={2}>
              <span className="swatch" style={{ "--swatch": "var(--pay-tax)" } as React.CSSProperties} /> Taxes
              {explain && <span className="hint"> · pay for roads, schools and parks</span>}
            </th>
          </tr>
          {stub.taxes.length === 0 && (
            <tr>
              <th scope="row" className="paystub-line">
                No tax
              </th>
              <td>{formatCents(0)}</td>
            </tr>
          )}
          {stub.taxes.map((l) => (
            <tr key={l.label}>
              <th scope="row" className="paystub-line">
                {l.label}
              </th>
              <td>−{formatCents(l.cents)}</td>
            </tr>
          ))}

          <tr className="paystub-section">
            <th scope="row" colSpan={2}>
              <span className="swatch" style={{ "--swatch": "var(--pay-bills)" } as React.CSSProperties} /> Bills
              {explain && <span className="hint"> · what it costs to live</span>}
            </th>
          </tr>
          {stub.expenses.length === 0 && (
            <tr>
              <th scope="row" className="paystub-line">
                No bills
              </th>
              <td>{formatCents(0)}</td>
            </tr>
          )}
          {stub.expenses.map((l) => (
            <tr key={l.label}>
              <th scope="row" className="paystub-line">
                {l.label}
              </th>
              <td>−{formatCents(l.cents)}</td>
            </tr>
          ))}

          <tr className="paystub-net">
            <th scope="row">
              <span className="swatch" style={{ "--swatch": "var(--pay-keep)" } as React.CSSProperties} /> {netLabel}
            </th>
            <td>{formatCents(stub.netCents)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Where the salary went, as one bar: taxes, bills, and what you keep. */
export function PayBar({ gross, tax, bills, net }: { gross: number; tax: number; bills: number; net: number }) {
  if (gross <= 0) return null;
  const parts = [
    { key: "tax", label: "Taxes", cents: tax, color: "var(--pay-tax)" },
    { key: "bills", label: "Bills", cents: Math.min(bills, gross - tax), color: "var(--pay-bills)" },
    { key: "keep", label: "You keep", cents: net, color: "var(--pay-keep)" },
  ].filter((p) => p.cents > 0);
  return (
    <div className="paybar-wrap">
      <div
        className="paybar"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${formatCents(p.cents)}`).join(", ") + ` of ${formatCents(gross)}`}
      >
        {parts.map((p) => (
          <span key={p.key} style={{ flexGrow: p.cents, background: p.color }} />
        ))}
      </div>
      <ul className="paybar-legend" aria-hidden="true">
        {parts.map((p) => (
          <li key={p.key}>
            <span className="swatch" style={{ "--swatch": p.color } as React.CSSProperties} />
            {p.label} {Math.round((p.cents / gross) * 100)}%
          </li>
        ))}
      </ul>
    </div>
  );
}
