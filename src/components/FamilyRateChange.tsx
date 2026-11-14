import { useState, type FormEvent } from "react";
import { useAction, useApp } from "../data/AppContext";
import { firstOfNextMonth } from "../engine/dates";
import { annualFromMonthlyRate } from "../engine/interest";
import { formatDay, formatPercent, percentToFraction } from "../lib/format";
import { ErrorMessage, Field } from "./Field";

/** Parents: schedule the same rate change, with an announcement, for every open account. */
export function FamilyRateChange() {
  const { data, today } = useApp();
  const [run, busy, error] = useAction();
  const [from, setFrom] = useState(() => firstOfNextMonth(today));
  const [rate, setRate] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState<string | null>(null);
  if (!data) return null;

  const open = data.kids.filter((k) => k.account_opened_on);
  const fraction = percentToFraction(rate);
  // Kids who already have a rate change on that date.
  const clashes = open.filter((k) => data.rates.some((r) => r.kid_id === k.id && r.effective_from === from));
  const valid = rate.trim() !== "" && fraction <= 0.2 && from >= today && open.length > 0 && clashes.length === 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setDone(null);
    const ok = await run(async (api) => {
      for (const k of open) await api.addRatePeriod(k.id, from, fraction, message);
    });
    if (ok) {
      setDone(`Scheduled for ${open.length} account${open.length === 1 ? "" : "s"} from ${formatDay(from, true)}.`);
      setRate("");
      setMessage("");
    }
  };

  return (
    <form className="panel stack" onSubmit={submit} aria-labelledby="family-rate-title">
      <h2 className="panel-title" id="family-rate-title">
        Change everyone's rate
      </h2>
      <p className="hint">
        Rates move in real life too. Schedule a change for every open account ({open.map((k) => k.name).join(", ") || "none yet"}),
        and the kids see your announcement ahead of time. To change one kid, use their page.
      </p>
      <div className="row">
        <Field label="Starting" type="date" value={from} onChange={setFrom} min={today} />
        <Field
          label="New rate"
          suffix="% / mo"
          value={rate}
          onChange={setRate}
          hint={rate.trim() ? `≈ ${formatPercent(annualFromMonthlyRate(fraction), 1)} a year` : undefined}
        />
      </div>
      <Field
        label="Announcement (optional)"
        inputMode="text"
        value={message}
        onChange={setMessage}
        maxLength={280}
        placeholder="Interest rates are going down next month, just like at real banks."
      />
      {clashes.length > 0 && (
        <p className="error-msg">
          {clashes.map((k) => k.name).join(", ")} already {clashes.length === 1 ? "has" : "have"} a rate change on{" "}
          {formatDay(from, true)}. Pick another date, or cancel it on {clashes.length === 1 ? "their" : "each kid's"} page.
        </p>
      )}
      <ErrorMessage error={error} />
      <div className="actions">
        <button className="btn btn-secondary" disabled={busy || !valid}>
          Schedule for everyone
        </button>
        {done && <span className="saved">{done}</span>}
      </div>
    </form>
  );
}
