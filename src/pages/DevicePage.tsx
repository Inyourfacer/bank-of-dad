import { useApp } from "../data/AppContext";

/** Placeholder until kid profiles (Phase 3). */
export function DevicePage() {
  const { data } = useApp();
  if (!data) return null;
  return (
    <div className="narrow">
      <div className="panel stack center">
        <h1 className="page-title">This device is set up 🎉</h1>
        <p className="muted">
          It's signed in to <strong>{data.family.name}</strong>. Kid profiles with PINs arrive in the next update.
        </p>
        <ul className="avatar-row" aria-label="Kids">
          {data.kids.map((k) => (
            <li key={k.id}>
              <span className="avatar lg" aria-hidden="true">
                {k.avatar}
              </span>
              {k.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
