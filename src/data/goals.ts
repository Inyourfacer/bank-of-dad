/**
 * Jar balances and savings-goal projections ("you'll reach your bike around
 * March"). Pure; built on the same interest engine as everything else.
 */

import { type ISODate, addMonths, startOfMonth } from "../engine/dates";
import { type LedgerEntry, runAccount } from "../engine/interest";
import type { Jar, JarEntry, RatePeriodRow, TransactionRow } from "./types";

export function jarBalance(entries: JarEntry[], kidId: string, jar: Jar): number {
  return entries.filter((e) => e.kid_id === kidId && e.jar === jar).reduce((s, e) => s + e.amount_cents, 0);
}

export interface GoalInput {
  openedOn: ISODate | null;
  rates: RatePeriodRow[];
  transactions: TransactionRow[];
  today: ISODate;
  targetCents: number;
  /** What payday adds to savings each month (0 if no pay plan). */
  monthlySaveCents: number;
  /** Day of the month savings arrive (pay plan payday). */
  payDay: number;
  /** Paydays already received this month (so this month's isn't counted twice). */
  paidThisMonth: boolean;
  /** Take this much out today first ("what if I withdraw?"). */
  withdrawCents?: number;
}

export interface GoalProjection {
  balanceCents: number;
  /** 0–1, how much of the target is saved now. */
  progress: number;
  reached: boolean;
  /** Month-end by which the goal is reached (null: not within 10 years). */
  byDate: ISODate | null;
}

const HORIZON_MONTHS = 120;

export function projectGoal(input: GoalInput): GoalProjection {
  const { today, targetCents, monthlySaveCents, payDay, paidThisMonth, withdrawCents = 0 } = input;
  const openedOn = input.openedOn ?? today;
  const rates = input.rates.map((r) => ({ effectiveFrom: r.effective_from, monthlyRate: Number(r.monthly_rate) }));
  const ledger: LedgerEntry[] = input.transactions
    .filter((t) => t.kind !== "interest")
    .map((t) => ({ date: t.occurred_on, amountCents: t.amount_cents, kind: t.kind as LedgerEntry["kind"] }));
  if (withdrawCents > 0) ledger.push({ date: today, amountCents: -withdrawCents, kind: "withdrawal" });

  const balanceCents = runAccount({ openedOn, rates, entries: ledger, asOf: today }).balanceCents;
  const progress = Math.max(0, Math.min(1, balanceCents / targetCents));
  if (balanceCents >= targetCents) return { balanceCents, progress: 1, reached: true, byDate: today };

  const future: LedgerEntry[] = [];
  if (monthlySaveCents > 0) {
    for (let i = 0; i < HORIZON_MONTHS; i++) {
      const month = addMonths(startOfMonth(today), i);
      const day = `${month.slice(0, 8)}${String(Math.min(payDay, 28)).padStart(2, "0")}`;
      if (i === 0 && (paidThisMonth || day < today)) continue;
      future.push({ date: day, amountCents: monthlySaveCents, kind: "deposit" });
    }
  }
  const run = runAccount({
    openedOn,
    rates,
    entries: [...ledger, ...future],
    asOf: addMonths(startOfMonth(today), HORIZON_MONTHS),
  });
  const hit = run.snapshots.find((s) => s.date > today && s.balanceCents >= targetCents);
  return { balanceCents, progress, reached: false, byDate: hit?.date ?? null };
}

/** Whole months between two dates' months (for "about 2 months later"). */
export function monthsBetween(from: ISODate, to: ISODate): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}
