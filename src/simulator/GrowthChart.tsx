import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCents, formatDollarsWhole, formatDuration, formatMonthYear } from "../lib/format";
import type { ChartPoint } from "./useSimulation";

interface Props {
  points: ChartPoint[];
  showBaseline: boolean;
}

const SERIES = {
  putIn: { label: "Money you put in", color: "var(--series-putin)" },
  interest: { label: "Interest earned", color: "var(--series-interest)" },
  baseline: { label: "Without extra deposits", color: "var(--text-secondary)" },
  bank: { label: "Regular bank", color: "var(--series-bank)" },
} as const;

function monthTick(month: number, total: number): string {
  if (month === 0) return "Now";
  if (total > 24) return `${month / 12}y`;
  return `${month}m`;
}

interface TooltipPayload {
  payload: ChartPoint;
}

function ChartTooltip({ active, payload, showBaseline }: { active?: boolean; payload?: TooltipPayload[]; showBaseline: boolean }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const row = (key: keyof typeof SERIES, value: number, dashed = false) => (
    <div className="tt-row" key={key}>
      <span className={`swatch${dashed ? " swatch-line" : ""}`} style={{ "--swatch": SERIES[key].color } as React.CSSProperties} />
      <span className="tt-label">{SERIES[key].label}</span>
      <span className="tt-value">{formatCents(Math.round(value * 100))}</span>
    </div>
  );
  return (
    <div className="chart-tooltip" role="status">
      <div className="tt-title">
        {p.month === 0 ? "Start" : `After ${formatDuration(p.month)}`} · {formatMonthYear(p.date)}
      </div>
      <div className="tt-total">{formatCents(Math.round(p.balance * 100))}</div>
      {row("interest", p.interest)}
      {row("putIn", p.putIn)}
      {showBaseline && p.baseline !== undefined && row("baseline", p.baseline, true)}
      {row("bank", p.bank, true)}
    </div>
  );
}

export function GrowthChart({ points, showBaseline }: Props) {
  const total = points.length - 1;
  const tickStep = total > 24 ? 12 : total > 12 ? 3 : 1;
  const ticks = points.filter((p) => p.month % tickStep === 0).map((p) => p.month);

  const legend: (keyof typeof SERIES)[] = ["putIn", "interest", ...(showBaseline ? (["baseline"] as const) : []), "bank"];

  return (
    <figure className="chart">
      <ul className="legend" aria-label="Chart legend">
        {legend.map((k) => (
          <li key={k}>
            <span
              className={`swatch${k === "baseline" || k === "bank" ? " swatch-line" : ""}`}
              style={{ "--swatch": SERIES[k].color } as React.CSSProperties}
            />
            {SERIES[k].label}
          </li>
        ))}
      </ul>
      <div className="chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="month"
              type="number"
              domain={[0, total]}
              ticks={ticks}
              tickFormatter={(m: number) => monthTick(m, total)}
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
              content={<ChartTooltip showBaseline={showBaseline} />}
              cursor={{ stroke: "var(--text-secondary)", strokeDasharray: "3 3" }}
            />
            <Area
              type="monotone"
              dataKey="putIn"
              stackId="balance"
              stroke="var(--series-putin)"
              strokeWidth={2}
              fill="var(--series-putin)"
              fillOpacity={0.28}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="interest"
              stackId="balance"
              stroke="var(--series-interest)"
              strokeWidth={2}
              fill="var(--series-interest)"
              fillOpacity={0.4}
              isAnimationActive={false}
            />
            {showBaseline && (
              <Line
                type="monotone"
                dataKey="baseline"
                stroke="var(--text-secondary)"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="bank"
              stroke="var(--series-bank)"
              strokeWidth={2}
              strokeDasharray="2 4"
              strokeLinecap="round"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Balance over {formatDuration(total)}, split into money put in and interest earned, compared with a regular bank.
        A full table of Paydays is below.
      </figcaption>
    </figure>
  );
}
