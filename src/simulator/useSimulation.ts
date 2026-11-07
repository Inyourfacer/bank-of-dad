import { useMemo } from "react";
import { addDays, addMonths, firstOfNextMonth, todayISO } from "../engine/dates";
import { type AccountState, defaultRateSchedule, monthlyRateFromAnnual, monthsToDouble } from "../engine/interest";
import { type Frequency, type ProjectionInput, project } from "../engine/projection";

export interface SimSettings {
  startCents: number;
  introRate: number;
  introMonths: number;
  ongoingRate: number;
  months: number;
  oneTimeCents: number;
  oneTimeAfterMonths: number;
  recurringCents: number;
  recurringFrequency: Frequency;
  bankApy: number;
}

export interface ChartPoint {
  month: number;
  date: string;
  /** Dollars. Money put in, capped at the balance (withdrawals can eat into it). */
  putIn: number;
  /** Dollars. Balance minus `putIn`. */
  interest: number;
  balance: number;
  /** Same plan without the extra deposits (only when extras are set). */
  baseline?: number;
  /** Same deposits at a regular bank. */
  bank: number;
}

export interface SimResult {
  points: ChartPoint[];
  scenario: AccountState;
  baseline: AccountState | null;
  bank: AccountState;
  hasExtras: boolean;
  /** First month in which interest earned exceeds money put in, if any. */
  crossoverMonth: number | null;
  doublingMonths: number;
  startDate: string;
}

export function simulate(s: SimSettings, today = todayISO()): SimResult {
  // Start on the 1st of next month so every month is a full Payday cycle.
  const startDate = firstOfNextMonth(today);
  const endDate = addDays(addMonths(startDate, s.months), -1);
  const rates = defaultRateSchedule(startDate, {
    introRate: s.introRate,
    introMonths: s.introMonths,
    ongoingRate: s.ongoingRate,
  });

  const oneTime = s.oneTimeCents > 0 ? { amountCents: s.oneTimeCents, afterMonths: s.oneTimeAfterMonths } : null;
  const recurring = s.recurringCents > 0 ? { amountCents: s.recurringCents, frequency: s.recurringFrequency } : null;
  const hasExtras = Boolean(oneTime || recurring);

  const base: ProjectionInput = { startDate, endDate, rates, startBalanceCents: s.startCents };
  const scenario = project({ ...base, oneTime, recurring });
  const baseline = hasExtras ? project(base) : null;
  const bank = project({
    ...base,
    oneTime,
    recurring,
    rates: [{ effectiveFrom: startDate, monthlyRate: monthlyRateFromAnnual(s.bankApy) }],
  });

  const byDate = (st: AccountState | null) => new Map(st?.snapshots.map((x) => [x.date, x.balanceCents]) ?? []);
  const baselineByDate = byDate(baseline);
  const bankByDate = byDate(bank);

  let crossoverMonth: number | null = null;
  const points: ChartPoint[] = scenario.snapshots.map((snap, month) => {
    const putInCents = Math.max(0, Math.min(snap.contributedCents, snap.balanceCents));
    const interestCents = snap.balanceCents - putInCents;
    if (crossoverMonth === null && month > 0 && interestCents > putInCents) crossoverMonth = month;
    return {
      month,
      date: snap.date,
      putIn: putInCents / 100,
      interest: interestCents / 100,
      balance: snap.balanceCents / 100,
      baseline: baseline ? (baselineByDate.get(snap.date) ?? 0) / 100 : undefined,
      bank: (bankByDate.get(snap.date) ?? 0) / 100,
    };
  });

  return {
    points,
    scenario,
    baseline,
    bank,
    hasExtras,
    crossoverMonth,
    doublingMonths: monthsToDouble(s.ongoingRate),
    startDate,
  };
}

export function useSimulation(s: SimSettings): SimResult {
  return useMemo(() => simulate(s), [s]);
}
