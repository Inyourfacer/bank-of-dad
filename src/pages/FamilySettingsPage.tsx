import { useState, type FormEvent } from "react";
import { ErrorMessage, Field } from "../components/Field";
import { useAction, useApp } from "../data/AppContext";
import type { Role } from "../data/types";
import { monthlyRateFromAnnual } from "../engine/interest";
import { formatPercent, percentToFraction } from "../lib/format";

const pct = (f: number) => String(+(f * 100).toFixed(4));

export function FamilySettingsPage() {
  const { data } = useApp();
  if (!data) return null;
  return (
    <div className="stack-lg narrow-wide">
      <a className="back" href="#/family">
        ← {data.family.name}
      </a>
      <h1 className="page-title">Family settings</h1>
      <BankSettings key={JSON.stringify(data.family)} />
      <Members />
    </div>
  );
}

function BankSettings() {
  const { data } = useApp();
  const f = data!.family;
  const [run, busy, error] = useAction();
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState(f.name);
  const [tz, setTz] = useState(f.time_zone);
  const [bank, setBank] = useState(pct(f.regular_bank_apy));
  const [cd, setCd] = useState(pct(f.cd_bonus_monthly_rate));
  const [loan, setLoan] = useState(pct(f.loan_monthly_rate));

  const bankApy = percentToFraction(bank);
  const valid = name.trim() && bankApy <= 0.5 && percentToFraction(cd) <= 0.2 && percentToFraction(loan) <= 0.2 && isValidZone(tz);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const ok = await run((api) =>
      api.updateFamily(f.id, {
        name: name.trim(),
        time_zone: tz.trim(),
        regular_bank_apy: bankApy,
        cd_bonus_monthly_rate: percentToFraction(cd),
        loan_monthly_rate: percentToFraction(loan),
      }),
    );
    setSaved(ok);
  };

  return (
    <form className="panel stack" onSubmit={submit}>
      <h2 className="panel-title">Bank</h2>
      <Field label="Family name" inputMode="text" value={name} onChange={setName} required maxLength={80} />
      <Field
        label="Time zone"
        inputMode="text"
        value={tz}
        onChange={setTz}
        hint={isValidZone(tz) ? "Paydays happen at the end of the month in this time zone." : "Use a zone like America/Chicago."}
      />
      <Field
        label="Regular bank rate (for comparisons)"
        suffix="% / yr"
        value={bank}
        onChange={setBank}
        hint={`≈ ${formatPercent(monthlyRateFromAnnual(bankApy), 3)} a month. A typical savings account.`}
      />
      <div className="row">
        <Field label="CD bonus" suffix="% / mo" value={cd} onChange={setCd} hint="Added to a kid's rate for locked savings (coming later)." />
        <Field label="Loan rate" suffix="% / mo" value={loan} onChange={setLoan} hint="What kids pay to borrow (coming later)." />
      </div>
      <ErrorMessage error={error} />
      <div className="actions">
        <button className="btn btn-primary" disabled={busy || !valid}>
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="saved">Saved ✓</span>}
      </div>
    </form>
  );
}

function Members() {
  const { data } = useApp();
  const [run, busy, error] = useAction();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("parent");
  if (!data) return null;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await run((api) => api.addMember(email.trim(), role, name.trim()))) {
      setEmail("");
      setName("");
    }
  };

  return (
    <section className="panel stack" aria-labelledby="members-title">
      <h2 className="panel-title" id="members-title">
        Who can sign in
      </h2>
      <ul className="list">
        {data.members.map((m) => (
          <li key={m.user_id} className="list-row">
            <span>
              <strong>{m.display_name}</strong>
              {m.user_id === data.me.user_id && <span className="hint"> (you)</span>}
            </span>
            <span className="chip">{m.role === "parent" ? "Parent" : "Family device"}</span>
            {m.user_id !== data.me.user_id && (
              <button
                type="button"
                className="link-button danger"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Remove ${m.display_name}? They won't be able to sign in to this family.`)) {
                    void run((api) => api.removeMember(m.user_id));
                  }
                }}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <form className="stack" onSubmit={add}>
        <h3 className="sub-title">Add someone</h3>
        <p className="hint">
          First create their login in Supabase (<em>Authentication → Users</em>), then add them here by email. See{" "}
          <code>docs/SETUP.md</code>.
        </p>
        <div className="segmented" role="radiogroup" aria-label="Role">
          {(["parent", "device"] as const).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? "on" : ""} onClick={() => setRole(r)}>
              {r === "parent" ? "Parent" : "Family device"}
            </button>
          ))}
        </div>
        <div className="row">
          <Field label="Email" type="email" inputMode="email" value={email} onChange={setEmail} required />
          <Field label="Name" inputMode="text" value={name} onChange={setName} required maxLength={40} placeholder={role === "parent" ? "Mom" : "Kids tablet"} />
        </div>
        <ErrorMessage error={error} />
        <button className="btn btn-primary" disabled={busy || !email.includes("@") || !name.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}

function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return tz.trim().length > 0;
  } catch {
    return false;
  }
}
