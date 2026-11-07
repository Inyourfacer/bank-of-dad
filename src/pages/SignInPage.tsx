import { useState, type FormEvent } from "react";
import { ErrorMessage, Field } from "../components/Field";
import { useAction, useApp } from "../data/AppContext";
import { enterDemo } from "../data/backend";
import type { DemoApi } from "../data/demoApi";

type Tab = "parent" | "device";

export function SignInPage() {
  const { api, status } = useApp();
  const [tab, setTab] = useState<Tab>("parent");

  if (status === "unconfigured" || !api) return <NotConfigured />;

  return (
    <div className="narrow">
      <div className="panel stack">
        <h1 className="page-title">Sign in</h1>
        <div className="segmented" role="tablist" aria-label="Who is signing in?">
          {(["parent", "device"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t === "parent" ? "Parent" : "Family device"}
            </button>
          ))}
        </div>
        {api.kind === "demo" ? <DemoSignIn api={api as DemoApi} tab={tab} /> : tab === "parent" ? <ParentSignIn /> : <DeviceSignIn />}
      </div>
    </div>
  );
}

function ParentSignIn() {
  const [useCode, setUseCode] = useState(false);
  return useCode ? <EmailCodeSignIn onBack={() => setUseCode(false)} /> : <PasswordSignIn kind="parent" onUseCode={() => setUseCode(true)} />;
}

function PasswordSignIn({ kind, onUseCode }: { kind: Tab; onUseCode?: () => void }) {
  const [run, busy, error] = useAction();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await run((api) => api.signInWithPassword(email.trim(), password));
  };
  return (
    <form className="stack" onSubmit={submit}>
      {kind === "device" && (
        <p className="muted">
          Set up this phone or tablet for the kids. It uses the shared family-device login, which can see balances but
          can't move money.
        </p>
      )}
      <Field
        label={kind === "device" ? "Device email" : "Email"}
        type="email"
        inputMode="email"
        autoComplete="username"
        value={email}
        onChange={setEmail}
        required
      />
      <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} required />
      <ErrorMessage error={error} />
      <button className="btn btn-primary" disabled={busy || !email.includes("@") || !password}>
        {busy ? "Signing in…" : kind === "device" ? "Set up this device" : "Sign in"}
      </button>
      {onUseCode && (
        <button type="button" className="link-button" onClick={onUseCode}>
          Email me a sign-in code instead
        </button>
      )}
    </form>
  );
}

function EmailCodeSignIn({ onBack }: { onBack: () => void }) {
  const [run, busy, error] = useAction();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (await run((api) => api.sendEmailCode(email.trim()))) setSent(true);
  };
  const verify = async (e: FormEvent) => {
    e.preventDefault();
    await run((api) => api.verifyEmailCode(email.trim(), code));
  };

  if (!sent) {
    return (
      <form className="stack" onSubmit={send}>
        <p className="muted">
          We'll email you a sign-in link (and a code, if your family set that up). This needs the optional email setup
          in <code>docs/SETUP.md</code>.
        </p>
        <Field label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} required />
        <ErrorMessage error={error} />
        <button className="btn btn-primary" disabled={busy || !email.includes("@")}>
          {busy ? "Sending…" : "Email me"}
        </button>
        <button type="button" className="link-button" onClick={onBack}>
          Use my password instead
        </button>
      </form>
    );
  }
  return (
    <form className="stack" onSubmit={verify}>
      <p className="muted">
        Check <strong>{email}</strong>. Tap the link in the email, or type the code here if there is one.
      </p>
      <Field label="Code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={setCode} maxLength={10} required />
      <ErrorMessage error={error} />
      <button className="btn btn-primary" disabled={busy || code.trim().length < 6}>
        {busy ? "Checking…" : "Sign in"}
      </button>
      <button type="button" className="link-button" onClick={() => setSent(false)}>
        Use a different email
      </button>
    </form>
  );
}

function DeviceSignIn() {
  return <PasswordSignIn kind="device" />;
}

function DemoSignIn({ api, tab }: { api: DemoApi; tab: Tab }) {
  return (
    <div className="stack">
      <p className="muted">This is the demo. Nothing is saved after you close the tab.</p>
      <button className="btn btn-primary" onClick={() => void api.signInAs(tab)}>
        {tab === "parent" ? "Continue as Dad (parent)" : "Continue as the kids' tablet"}
      </button>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="narrow">
      <div className="panel stack">
        <h1 className="page-title">Family accounts aren't connected yet</h1>
        <p className="muted">
          This copy of the Bank of Dad doesn't have a database connected. A parent needs to finish the one-time setup in{" "}
          <code>docs/SETUP.md</code>.
        </p>
        <p className="muted">Want to look around first? The demo uses a pretend family and saves nothing.</p>
        <button className="btn btn-primary" onClick={enterDemo}>
          Try the demo
        </button>
      </div>
    </div>
  );
}
