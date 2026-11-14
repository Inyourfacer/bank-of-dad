/**
 * "Start now vs. start later": the same plan, but beginning `delayYears`
 * later and ending on the same date. Shows what waiting costs.
 */

import { type SimSettings, simulate } from "./useSimulation";

export interface StartLaterPoint {
  month: number;
  now: number;
  /** null before the late start, so the chart line begins when saving does. */
  later: number | null;
}

export interface StartLaterResult {
  points: StartLaterPoint[];
  nowCents: number;
  laterCents: number;
  /** How much less you end up with by waiting. */
  costCents: number;
}

export function startLater(s: SimSettings, delayYears: number, today?: string): StartLaterResult | null {
  const delay = Math.round(delayYears * 12);
  if (delay <= 0 || delay >= s.months) return null;
  const now = simulate(s, today);
  const later = simulate({ ...s, months: s.months - delay }, today);
  const laterByMonth = new Map(later.points.map((p) => [p.month + delay, p.balance]));
  const points = now.points.map((p) => ({
    month: p.month,
    now: p.balance,
    later: p.month < delay ? null : (laterByMonth.get(p.month) ?? 0),
  }));
  const nowCents = now.scenario.balanceCents;
  const laterCents = later.scenario.balanceCents;
  return { points, nowCents, laterCents, costCents: nowCents - laterCents };
}
