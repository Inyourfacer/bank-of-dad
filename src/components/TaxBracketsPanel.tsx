import { useState, type FormEvent } from "react";
import { useAction, useApp } from "../data/AppContext";
import { DEFAULT_SALARY_CENTS, DEFAULT_TAX_BRACKETS, type TaxBracket, computeTax, normalizeBrackets } from "../engine/paycheck";
import { dollarsToCents, formatCents, percentToFraction } from "../lib/format";
import { ErrorMessage, Field } from "./Field";

interface Row {
  key: number;
  upTo: string;
  rate: string;
}

let rowKey = 0;
const toRows = (brackets: TaxBracket[]): Row[] =>
  normalizeBrackets(brackets).map((b) => ({
    key: rowKey++,
    upTo: b.up_to_cents === null ? "" : String(b.up_to_cents / 100),
    rate: String(+(b.rate * 100).toFixed(4)),
  }));

/** Parents: the family's tax brackets, used on every kid's pay stub. */
export function TaxBracketsPanel() {
  const { data } = useApp();
  if (!data) return null;
  return <TaxForm key={JSON.stringify(data.family.tax_brackets)} familyId={data.family.id} saved={data.family.tax_brackets} />;
}

function TaxForm({ familyId, saved }: { familyId: string; saved: TaxBracket[] }) {
  const [run, busy, error] = useAction();
  const [rows, setRows] = useState<Row[]>(() => toRows(saved));
  const [savedMsg, setSavedMsg] = useState(false);

  // Every row but the last has an upper limit; the last covers everything above.
  const brackets: TaxBracket[] = rows.map((r, i) => ({
    up_to_cents: i === rows.length - 1 ? null : dollarsToCents(r.upTo),
    rate: percentToFraction(r.rate),
  }));
  const limits = brackets.slice(0, -1).map((b) => b.up_to_cents ?? 0);
  const increasing = limits.every((l, i) => l > 0 && (i === 0 || l > limits[i - 1]));
  const ratesOk = brackets.every((b) => b.rate >= 0 && b.rate <= 0.9);
  const valid = rows.length > 0 && rows.length <= 10 && increasing && ratesOk;
  const exampleTax = valid ? computeTax(DEFAULT_SALARY_CENTS, brackets).reduce((s, l) => s + l.cents, 0) : 0;

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSavedMsg(await run((api) => api.updateFamily(familyId, { tax_brackets: brackets })));
  };

  // Where each bracket starts: the previous one's "up to" amount.
  const starts = rows.map((_, i) => (i === 0 ? 0 : dollarsToCents(rows[i - 1].upTo)));
  return (
    <form className="panel stack" onSubmit={submit} aria-labelledby="tax-title">
      <h2 className="panel-title" id="tax-title">
        Taxes
      </h2>
      <p className="hint">
        Brackets for every kid's monthly salary. Each slice of pay is taxed at its own rate, like real income tax.
      </p>
      {rows.map((r, i) => {
        const last = i === rows.length - 1;
        const from = starts[i];
        return (
          <div className="bracket-row" key={r.key}>
            {last ? (
              <div className="field">
                <span className="label">Pay above</span>
                <div className="input-wrap static">{formatCents(from)}</div>
              </div>
            ) : (
              <Field label={`From ${formatCents(from)} up to`} prefix="$" value={r.upTo} onChange={(v) => update(r.key, { upTo: v })} />
            )}
            <Field label="Rate" suffix="%" value={r.rate} onChange={(v) => update(r.key, { rate: v })} />
            <button
              type="button"
              className="icon-button"
              aria-label="Remove bracket"
              title="Remove"
              disabled={rows.length === 1}
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
            >
              ×
            </button>
          </div>
        );
      })}
      <div className="actions">
        <button
          type="button"
          className="link-button"
          disabled={rows.length >= 10}
          onClick={() =>
            setRows((rs) => {
              const prevTop = rs.length > 1 ? Number(rs[rs.length - 2].upTo) || 0 : 0;
              return [...rs.slice(0, -1), { key: rowKey++, upTo: String(prevTop + 50), rate: rs[rs.length - 1].rate }, rs[rs.length - 1]];
            })
          }
        >
          + Add a bracket
        </button>
        <button type="button" className="link-button" onClick={() => setRows(toRows(DEFAULT_TAX_BRACKETS))}>
          Reset to defaults
        </button>
      </div>
      {!increasing && <p className="error-msg">Each "up to" amount must be above zero and higher than the one before.</p>}
      {!ratesOk && <p className="error-msg">Rates must be between 0% and 90%.</p>}
      {valid && <p className="hint">On a {formatCents(DEFAULT_SALARY_CENTS)} salary, that's {formatCents(exampleTax)} in tax.</p>}
      <ErrorMessage error={error} />
      <div className="actions">
        <button className="btn btn-primary" disabled={busy || !valid}>
          {busy ? "Saving…" : "Save taxes"}
        </button>
        {savedMsg && <span className="saved">Saved ✓</span>}
      </div>
    </form>
  );
}
