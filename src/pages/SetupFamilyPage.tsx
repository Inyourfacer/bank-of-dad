import { useState, type FormEvent } from "react";
import { ErrorMessage, Field } from "../components/Field";
import { useAction, useApp } from "../data/AppContext";

export function SetupFamilyPage() {
  const { user } = useApp();
  const [run, busy, error] = useAction();
  const [familyName, setFamilyName] = useState("");
  const [yourName, setYourName] = useState("Dad");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await run((api) => api.createFamily(familyName.trim(), yourName.trim(), tz));
  };

  return (
    <div className="narrow">
      <form className="panel stack" onSubmit={submit}>
        <h1 className="page-title">Welcome to the Bank of Dad</h1>
        <p className="muted">
          You're signed in as <strong>{user?.email}</strong>. Set up your family bank. You can add the other parent, the
          family device and the kids next.
        </p>
        <Field label="Family name" inputMode="text" placeholder="The Smiths" value={familyName} onChange={setFamilyName} required maxLength={80} />
        <Field label="Your name" inputMode="text" value={yourName} onChange={setYourName} required maxLength={40} hint="What the kids call you." />
        <p className="hint">
          Time zone: <strong>{tz}</strong>. Paydays happen at the end of the month in this time zone.
        </p>
        <ErrorMessage error={error} />
        <button className="btn btn-primary" disabled={busy || !familyName.trim() || !yourName.trim()}>
          {busy ? "Creating…" : "Create family bank"}
        </button>
      </form>
    </div>
  );
}
