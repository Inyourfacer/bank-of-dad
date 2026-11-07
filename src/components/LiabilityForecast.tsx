import { useMemo } from "react";
import { useApp } from "../data/AppContext";
import { FORECAST_YEARS, forecastLiability } from "../data/forecast";
import { formatCents } from "../lib/format";

/** "What the Bank of Dad will owe": every account grown at today's rates. */
export function LiabilityForecast() {
  const { data, today } = useApp();
  const rows = useMemo(() => (data ? forecastLiability(data, today) : []), [data, today]);
  if (!data || rows.length === 0) return null;

  const totalNow = rows.reduce((s, r) => s + r.nowCents, 0);
  const totals = FORECAST_YEARS.map((_, i) => rows.reduce((s, r) => s + r.futureCents[i], 0));

  return (
    <section className="panel stack" aria-labelledby="forecast-title">
      <div>
        <h2 className="panel-title" id="forecast-title">
          What the Bank of Dad will owe
        </h2>
        <p className="hint">At today's rates, if nobody adds or takes out money. Deposits you add later grow this.</p>
      </div>
      <div className="table-wrap flat">
        <table className="forecast">
          <thead>
            <tr>
              <th scope="col">Kid</th>
              <th scope="col">Now</th>
              {FORECAST_YEARS.map((y) => (
                <th scope="col" key={y}>
                  In {y} year{y === 1 ? "" : "s"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.kid.id}>
                <th scope="row">
                  <span className="rate-name">
                    <span aria-hidden="true">{r.kid.avatar}</span>
                    {r.kid.name}
                  </span>
                </th>
                <td>{formatCents(r.nowCents)}</td>
                {r.futureCents.map((c, i) => (
                  <td key={i}>{formatCents(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{formatCents(totalNow)}</td>
              {totals.map((c, i) => (
                <td key={i}>{formatCents(c)}</td>
              ))}
            </tr>
            <tr className="forecast-interest">
              <th scope="row">Interest</th>
              <td>—</td>
              {totals.map((c, i) => (
                <td key={i}>+{formatCents(c - totalNow)}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
