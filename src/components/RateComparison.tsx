import { type ComparableRate, fromAnnual, fromMonthly, timesMore } from "../engine/rates";
import { formatCents, formatPercent } from "../lib/format";

/** One Bank of Dad rate to compare, e.g. a starter rate and a regular rate. */
export interface DadRate {
  label: string;
  /** Short label for the bar chart. */
  short: string;
  detail: string;
  monthly: number;
}

interface Props {
  dad: DadRate[];
  bankApy: number;
  title?: string;
  /** Which Bank of Dad rate the "N× more" line uses (default: the last). */
  headlineIndex?: number;
}

/** Rates for the simulator's starter + regular plan. */
export function planRates(introRate: number, introMonths: number, ongoingRate: number): DadRate[] {
  const out: DadRate[] = [];
  if (introMonths > 0 && introRate !== ongoingRate) {
    out.push({
      label: "Bank of Dad",
      short: "Dad: starter",
      detail: `Starter rate, first ${introMonths} month${introMonths === 1 ? "" : "s"}`,
      monthly: introRate,
    });
  }
  out.push({
    label: "Bank of Dad",
    short: out.length ? "Dad: regular" : "Bank of Dad",
    detail: out.length ? "Regular rate, after that" : "Every month",
    monthly: ongoingRate,
  });
  return out;
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

export function RateComparison({ dad, bankApy, title = "Comparing interest rates", headlineIndex }: Props) {
  const rows: Row[] = dad.map((d, i) => ({
    key: `dad-${i}`,
    name: d.label,
    short: d.short,
    detail: d.detail,
    rate: fromMonthly(d.monthly),
    color: "var(--series-interest)",
  }));
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
  const ratio = timesMore(rows[headlineIndex ?? rows.length - 2].rate, bank);
  const many = dad.length > 1;

  return (
    <section className="rate-compare" aria-labelledby="rate-compare-title">
      <h2 id="rate-compare-title">{title}</h2>
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
          {many && headlineIndex === undefined ? "Even after the starter months, the" : "The"} Bank of Dad pays about{" "}
          {Math.round(ratio)}× more than a regular bank.
        </p>
      )}
    </section>
  );
}
