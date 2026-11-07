/**
 * What-if projections for a real kid account: start from the kid's actual
 * ledger and rate schedule today, then add the "what if" deposits. Uses the
 * same engine as everything else, so "now" matches the balance on screen.
 */

import { type ISODate, addMonths, endOfMonth, firstOfNextMonth } from "../engine/dates";
import { type AccountState, type LedgerEntry, type RatePeriod, monthlyRateFromAnnual, runAccount } from "../engine/interest";
import { type Frequency, projectionEntries } from "../engine/projection";
import type { ChartPoint } from "../simulator/useSimulation";
import type { Kid, RatePeriodRow, TransactionRow } from "./types";

export interface KidWhatIfInput {
  kid: Pick<Kid, "account_opened_on">;
  rates: RatePeriodRow[];
  transactions: TransactionRow[];
  today: ISODate;
  /** Paydays to look ahead (1–120). */
  months: number;
  oneTimeCents?: number;
  oneTimeAfterMonths?: number;
  recurringCents?: number;
  recurringFrequency?: Frequency;
  bankApy: number;
}

export interface KidWhatIfResult {
  points: ChartPoint[];
  now: AccountState;
  scenario: AccountState;
  baseline: AccountState | null;
  bank: AccountState;
  hasExtras: boolean;
  endDate: ISODate;
  /** First month (from now) in which total interest exceeds money put in. */
  crossoverMonth: number | null;
}

const toLedger = (txns: TransactionRow[]): LedgerEntry[] =>
  txns
    .filter((t) => t.kind !== "interest")
    .map((t) => ({ date: t.occurred_on, amountCents: t.amount_cents, kind: t.kind as LedgerEntry["kind"] }));

const toRates = (rows: RatePeriodRow[]): RatePeriod[] =>
  rows.map((r) => ({ effectiveFrom: r.effective_from, monthlyRate: Number(r.monthly_rate) }));

/** End of the Nth full month after today. */
export function horizonEnd(today: ISODate, months: number): ISODate {
  return endOfMonth(addMonths(firstOfNextMonth(today), Math.max(1, months) - 1));
}

export function kidWhatIf(input: KidWhatIfInput): KidWhatIfResult {
  const { today, months } = input;
  const openedOn = input.kid.account_opened_on ?? today;
  const rates = toRates(input.rates);
  const ledger = toLedger(input.transactions);
  const endDate = horizonEnd(today, months);

  const oneTime = input.oneTimeCents ? { amountCents: input.oneTimeCents, afterMonths: input.oneTimeAfterMonths ?? 0 } : null;
  const recurring = input.recurringCents ? { amountCents: input.recurringCents, frequency: input.recurringFrequency ?? "weekly" } : null;
  const hasExtras = Boolean(oneTime || recurring);
  const extras = projectionEntries({ startDate: today, endDate, rates, startBalanceCents: 0, oneTime, recurring });

  const now = runAccount({ openedOn, rates, entries: ledger, asOf: today });
  const scenario = runAccount({ openedOn, rates, entries: [...ledger, ...extras], asOf: endDate });
  const baseline = hasExtras ? runAccount({ openedOn, rates, entries: ledger, asOf: endDate }) : null;
  // A regular bank, starting today with the same money and the same extra deposits.
  const bank = runAccount({
    openedOn: today,
    rates: [{ effectiveFrom: today, monthlyRate: monthlyRateFromAnnual(input.bankApy) }],
    entries: [{ date: today, amountCents: now.balanceCents, kind: "deposit" }, ...extras],
    asOf: endDate,
  });

  const byDate = (s: AccountState | null) => new Map(s?.snapshots.map((x) => [x.date, x.balanceCents]) ?? []);
  const baselineAt = byDate(baseline);
  const bankAt = byDate(bank);

  const future = scenario.snapshots.filter((s) => s.date > today);
  const rows = [
    { date: today, balanceCents: now.balanceCents, contributedCents: now.contributedCents, interestCents: now.interestPaidCents },
    ...future,
  ];

  let crossoverMonth: number | null = null;
  const points: ChartPoint[] = rows.map((s, month) => {
    const putIn = Math.max(0, Math.min(s.contributedCents, s.balanceCents));
    const interest = s.balanceCents - putIn;
    if (crossoverMonth === null && month > 0 && interest > putIn) crossoverMonth = month;
    return {
      month,
      date: s.date,
      putIn: putIn / 100,
      interest: interest / 100,
      balance: s.balanceCents / 100,
      baseline: baseline ? (month === 0 ? now.balanceCents : (baselineAt.get(s.date) ?? 0)) / 100 : undefined,
      bank: (month === 0 ? now.balanceCents : (bankAt.get(s.date) ?? 0)) / 100,
    };
  });

  return { points, now, scenario, baseline, bank, hasExtras, endDate, crossoverMonth };
}

/**
 * What `amountCents` would grow to if left in this kid's account instead,
 * after each of `years`, at the kid's own rates from today.
 */
export function keepItValue(amountCents: number, rates: RatePeriodRow[], today: ISODate, years: number[]): number[] {
  if (amountCents <= 0) return years.map(() => 0);
  const r = toRates(rates);
  return years.map(
    (y) =>
      runAccount({
        openedOn: today,
        rates: r,
        entries: [{ date: today, amountCents, kind: "deposit" }],
        asOf: addMonths(today, y * 12),
      }).balanceCents,
  );
}
