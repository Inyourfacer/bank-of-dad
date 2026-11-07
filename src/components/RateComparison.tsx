import { type ComparableRate, fromAnnual, fromMonthly, timesMore } from "../engine/rates";
import { formatCents, formatPercent } from "../lib/format";

interface Props {
  introRate: number;
  introMonths: number;
  ongoingRate: number;
  bankApy: number;
}

interface Row {
  key: string;
  name: string;
  /** Label for the bar chart. */
  short: string;
  detail: string;
  rate: ComparableRate;
  color: string;
}

/** Small rates need more decimals to be honest (0.04%, not 0%). */
const pct = (x: number) => formatPercent(x, x > 0 && x < 0.01 ? 3 : 2);

export function RateComparison({ introRate, introMonths, ongoingRate, bankApy }: Props) {
  const rows: Row[] = [];
  if (introMonths > 0 && introRate !== ongoingRate) {
    rows.push({
      key: "intro",
      name: "Bank of Dad",
      short: "Dad: starter",
      detail: `Starter rate, first ${introMonths} month${introMonths === 1 ? "" : "s"}`,
      rate: fromMonthly(introRate),
      color: "var(--series-interest)",
    });
  }
  rows.push({
    key: "ongoing",
    name: "Bank of Dad",
    short: rows.length ? "Dad: regular" : "Bank of Dad",
    detail: rows.length ? "Regular rate, after that" : "Every month",
    rate: fromMonthly(ongoingRate),
    color: "var(--series-interest)",
  });
  const bank = fromAnnual(bankApy);
  rows.push({
    key: "bank",
    name: "Regular bank",
    short: "Regular bank",
    detail: "Typical savings account",
    rate: bank,
    color: "var(--series-bank)",
  });

  const maxAnnual = Math.max(...rows.map((r) => r.rate.annual), 1e-9);
  const ratio = timesMore(rows[rows.length - 2].rate, bank);

  return (
    <section className="rate-compare" aria-labelledby="rate-compare-title">
      <h2 id="rate-compare-title">Comparing interest rates</h2>
      <p className="muted">
        The Bank of Dad quotes rates <strong>per month</strong>; regular banks quote them <strong>per year</strong>. Here
        they are side by side, both ways, with interest added monthly.
      </p>

      <div className="table-wrap flat">
        <table>
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Per month</th>
              <th scope="col">Per year</th>
              <th scope="col">$100 for a year earns</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">
                  <span className="rate-name">
                    <span className="swatch" style={{ "--swatch": r.color } as React.CSSProperties} />
                    {r.name}
                  </span>
                  <span className="rate-detail">{r.detail}</span>
                </th>
                <td>{pct(r.rate.monthly)}</td>
                <td>{pct(r.rate.annual)}</td>
                <td className="strong">{formatCents(r.rate.per100PerYearCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rate-bars" aria-hidden="true">
        <span className="rate-bars-title">Per year, on the same scale</span>
        {rows.map((r) => (
          <div className="rate-bar-row" key={r.key}>
            <span className="rate-bar-label">{r.short}</span>
            <div className="rate-bar-track">
              <div
                className="rate-bar"
                style={{ width: `${Math.max((r.rate.annual / maxAnnual) * 100, 0.75)}%`, background: r.color }}
              />
            </div>
            <span className="rate-bar-value">{pct(r.rate.annual)}</span>
          </div>
        ))}
      </div>

      {Number.isFinite(ratio) && ratio > 1 && (
        <p className="cheer">
          Even after the starter months, the Bank of Dad pays about {Math.round(ratio)}× more than a regular bank.
        </p>
      )}
    </section>
  );
}
