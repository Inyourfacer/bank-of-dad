import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  message?: string | null;
  busy?: boolean;
  /** Called with the 4 digits. Return false to clear and let the kid try again. */
  onSubmit: (pin: string) => Promise<boolean>;
  onCancel: () => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export function PinPad({ title, message, busy, onSubmit, onCancel }: Props) {
  const [pin, setPin] = useState("");
  // Latest callback without re-running the submit effect on every render.
  const submitRef = useRef(onSubmit);
  useEffect(() => {
    submitRef.current = onSubmit;
  });

  // Guards against submitting the same entry twice (React re-runs effects in development).
  const submitted = useRef(false);
  useEffect(() => {
    if (pin.length !== 4) {
      submitted.current = false;
      return;
    }
    if (submitted.current) return;
    submitted.current = true;
    void submitRef.current(pin).then((ok) => {
      if (!ok) setPin("");
    });
  }, [pin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 4 ? p + e.key : p));
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const press = (k: string) => {
    if (busy) return;
    if (k === "⌫") setPin((p) => p.slice(0, -1));
    else if (k) setPin((p) => (p.length < 4 ? p + k : p));
  };

  return (
    <div className="pinpad stack center">
      <h2 className="page-title">{title}</h2>
      <div className="pin-dots" aria-label={`${pin.length} of 4 digits entered`} role="status">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < pin.length ? "on" : ""} />
        ))}
      </div>
      <p className={`pin-msg ${message ? "error-msg" : "muted"}`} role="alert">
        {message || (busy ? "Checking…" : "Enter your 4-digit PIN")}
      </p>
      <div className="keypad">
        {KEYS.map((k, i) =>
          k ? (
            <button key={i} type="button" onClick={() => press(k)} disabled={busy} aria-label={k === "⌫" ? "Delete" : k}>
              {k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      <button type="button" className="link-button" onClick={onCancel}>
        Back
      </button>
    </div>
  );
}
