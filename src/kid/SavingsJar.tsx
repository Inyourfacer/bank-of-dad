import { useId } from "react";
import { formatCents } from "../lib/format";

const MILESTONES = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].map((d) => d * 100);

/** The next round number above the balance: a goal a young kid can picture. */
export function nextMilestone(balanceCents: number): number {
  return MILESTONES.find((m) => m > balanceCents) ?? Math.ceil((balanceCents + 1) / 100000) * 100000;
}

interface Props {
  putInCents: number;
  interestCents: number;
}

/** A jar that fills toward the next goal: blue for money put in, green for interest. */
export function SavingsJar({ putInCents, interestCents }: Props) {
  const clipId = useId();
  const balance = Math.max(0, putInCents + interestCents);
  const goal = nextMilestone(balance);
  const inner = { x: 22, y: 40, w: 76, h: 104 };
  const putInH = (Math.max(0, putInCents) / goal) * inner.h;
  const interestH = (Math.max(0, interestCents) / goal) * inner.h;
  const bottom = inner.y + inner.h;

  return (
    <figure className="jar">
      <svg viewBox="0 0 120 160" role="img" aria-label={`Savings jar: ${formatCents(balance)} of ${formatCents(goal)}`}>
        <defs>
          <clipPath id={clipId}>
            <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} rx="14" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} fill="var(--surface-2)" />
          <rect x={inner.x} y={bottom - putInH} width={inner.w} height={putInH} fill="var(--series-putin)" opacity="0.85" />
          <rect x={inner.x} y={bottom - putInH - interestH} width={inner.w} height={interestH} fill="var(--series-interest)" />
        </g>
        <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} rx="14" fill="none" stroke="var(--text-secondary)" strokeWidth="3" />
        <rect x="30" y="22" width="60" height="16" rx="5" fill="var(--accent)" stroke="var(--text-secondary)" strokeWidth="3" />
      </svg>
      <figcaption className="hint center">Next goal: {formatCents(goal).replace(".00", "")}</figcaption>
    </figure>
  );
}
