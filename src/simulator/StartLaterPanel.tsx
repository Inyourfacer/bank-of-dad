import { useId, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCents, formatDollarsWhole, formatDuration } from "../lib/format";
import { startLater } from "./startLater";
import type { SimSettings } from "./useSimulation";

const NOW = { label: "Start now", color: "var(--series-putin)" };
const LATER = { label: "Start later", color: "var(--series-bank)" };

/** "Start now vs. start later": same plan, same end date, less time to grow. */
export function StartLaterPanel({ settings }: { settings: SimSettings }) {
  const maxDelay = Math.floor((settings.months - 1) / 12);
  const [delay, setDelay] = useState(2);
  const years = Math.min(delay, Math.max(1, maxDelay));
  const sliderId = useId();
  const r = useMemo(() => (maxDelay >= 1 ? startLater(settings, years) : null), [settings, years, maxDelay]);

  return (
    <section className="panel stack" aria-labelledby="later-title">
      <h2 className="panel-title" id="later-title">
        Start now or start later?
      </h2>
      {!r ? (
        <p className="muted">Slide "Leave it for" to more than a year to compare starting now with starting later.</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor={sliderId}>
              What if you waited <strong>{formatDuration(years * 12)}</strong> to start?
            </label>
            <input id={sliderId} type="range" min={1} max={maxDelay} value={years} onChange={(e) => setDelay(Number(e.target.value))} />
          </div>
          <div className="later-compare">
            <div>
              <span className="swatch" style={{ "--swatch": NOW.color } as React.CSSProperties} />
              <span className="hint">Start now</span>
              <span className="tile-number">{formatCents(r.nowCents)}</span>
            </div>
            <div>
              <span className="swatch" style={{ "--swatch": LATER.color } as React.CSSProperties} />
              <span className="hint">Start in {formatDuration(years * 12)}</span>
              <span className="tile-number">{formatCents(r.laterCents)}</span>
            </div>
          </div>
          <p className="cheer">
            Waiting {formatDuration(years * 12)} costs you {formatCents(r.costCents)}. Time is the secret ingredient.
          </p>
          <ul className="legend" aria-label="Chart legend">
            {[NOW, LATER].map((s) => (
              <li key={s.label}>
                <span className="swatch swatch-line" style={{ "--swatch": s.color } as React.CSSProperties} />
                {s.label}
              </li>
            ))}
          </ul>
          <div className="chart-canvas small">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={r.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis
                  dataKey="month"
                  type="number"
                  domain={[0, settings.months]}
                  tickFormatter={(m: number) => (m === 0 ? "Now" : m % 12 === 0 ? `${m / 12}y` : `${m}m`)}
                  ticks={r.points.filter((p) => p.month % (settings.months > 24 ? 12 : 3) === 0).map((p) => p.month)}
                  stroke="var(--axis)"
                  tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => formatDollarsWhole(v)}
                  stroke="var(--axis)"
                  tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                />
                <Tooltip
                  formatter={(v, name) => [formatCents(Math.round(Number(v) * 100)), name === "now" ? NOW.label : LATER.label]}
                  labelFormatter={(m) => (Number(m) === 0 ? "Start" : `After ${formatDuration(Number(m))}`)}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}
                />
                <Line type="monotone" dataKey="now" stroke={NOW.color} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="later" stroke={LATER.color} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}
