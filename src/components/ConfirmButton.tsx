import { useState } from "react";

interface Props {
  /** Label before confirming, e.g. "Remove". */
  label: string;
  /** Label on the confirming click, e.g. "Remove Mom?". */
  confirmLabel: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  onConfirm: () => void;
}

/** Two-step button: the first click asks, the second does it. No browser dialogs. */
export function ConfirmButton({ label, confirmLabel, ariaLabel, className = "link-button danger", disabled, onConfirm }: Props) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={className} aria-label={ariaLabel} title={ariaLabel} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm-inline">
      <button type="button" className="btn btn-danger btn-sm" disabled={disabled} onClick={() => (setAsking(false), onConfirm())}>
        {confirmLabel}
      </button>
      <button type="button" className="link-button" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  );
}
