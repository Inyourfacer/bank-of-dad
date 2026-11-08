import { useState } from "react";
import { pinMessage } from "../data/api";
import { useApp } from "../data/AppContext";
import { demoPinFor } from "../data/demoPin";
import type { Kid } from "../data/types";
import { JuniorHome } from "./JuniorHome";
import { KidHome } from "./KidHome";
import { KidSessionProvider, useKidSession } from "./KidSession";
import { PinPad } from "./PinPad";

/** What the shared family device shows: pick your profile, enter your PIN. */
export function KidsApp() {
  const { api } = useApp();
  return (
    <KidSessionProvider remember={api?.kind === "demo"}>
      <KidsRouter />
    </KidSessionProvider>
  );
}

function KidsRouter() {
  const { data } = useApp();
  const { session } = useKidSession();
  const kid = session && data?.kids.find((k) => k.id === session.kidId);
  if (!kid) return <KidPicker />;
  return kid.mode === "junior" ? <JuniorHome kid={kid} /> : <KidHome kid={kid} />;
}

function KidPicker() {
  const { data, api, refresh } = useApp();
  const { signIn } = useKidSession();
  const [picked, setPicked] = useState<Kid | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data || !api) return null;

  if (picked) {
    return (
      <div className="narrow">
        <div className="panel">
          <div className="center">
            <span className="avatar xl" aria-hidden="true">
              {picked.avatar}
            </span>
          </div>
          <PinPad
            title={`Hi, ${picked.name}!`}
            hint={demoPinFor(api, picked.id) && `Demo PIN: ${demoPinFor(api, picked.id)}`}
            message={message}
            busy={busy}
            onCancel={() => {
              setPicked(null);
              setMessage(null);
            }}
            onSubmit={async (pin) => {
              setBusy(true);
              setMessage(null);
              try {
                const r = await api.kidSignIn(picked.id, pin);
                if (r.status !== "ok") {
                  setMessage(pinMessage(r.status));
                  return false;
                }
                await refresh();
                signIn({ kidId: picked.id, pin, firstLogin: r.firstLogin });
                return true;
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "Something went wrong.");
                return false;
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <div className="center">
        <p className="eyebrow">{data.family.name}</p>
        <h1 className="page-title">Who's saving today?</h1>
      </div>
      {data.kids.length === 0 ? (
        <p className="muted center">No accounts yet. Ask a parent to add you.</p>
      ) : (
        <ul className="profile-grid">
          {data.kids.map((k) => (
            <li key={k.id}>
              <button type="button" className="profile" onClick={() => setPicked(k)}>
                <span className="avatar xl" aria-hidden="true">
                  {k.avatar}
                </span>
                <span className="profile-name">{k.name}</span>
                {demoPinFor(api, k.id) && <span className="demo-pin">PIN {demoPinFor(api, k.id)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint center">You'll be signed out after 5 minutes without a tap.</p>
    </div>
  );
}
