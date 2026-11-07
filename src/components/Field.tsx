import { useId, type ReactNode } from "react";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "decimal" | "numeric" | "email" | "text";
  type?: "text" | "email" | "password" | "date";
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  min?: string;
  max?: string;
  maxLength?: number;
}

export function Field({
  label,
  hint,
  prefix,
  suffix,
  value,
  onChange,
  inputMode = "decimal",
  type = "text",
  placeholder = type === "text" && inputMode !== "text" ? "0" : undefined,
  autoComplete,
  required,
  min,
  max,
  maxLength,
}: FieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        {prefix && <span className="affix">{prefix}</span>}
        <input
          id={id}
          type={type}
          inputMode={type === "text" ? inputMode : undefined}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          min={min}
          max={max}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        {suffix && <span className="affix">{suffix}</span>}
      </div>
      {hint && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function ErrorMessage({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="error-msg" role="alert">
      {error}
    </p>
  );
}
