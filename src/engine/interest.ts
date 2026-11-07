/**
 * The Bank of Dad interest engine.
 *
 * Rules (see docs/DESIGN.md §3):
 * - Each day accrues `end_of_day_balance × monthly_rate_that_day ÷ days_in_month`.
 * - Accrued interest is paid as one "Payday" on the last day of the month.
 * - Money is whole cents; the monthly total is rounded to the cent and the
 *   rounding remainder carries into the next month.
 *
 * This module is pure (no I/O) so the same code powers live balances,
 * what-if projections and the monthly Payday job.
 */

import {
  type ISODate,
  addMonths,
  daysInMonth,
  fromDayNumber,
  isLastDayOfMonth,
  monthKey,
  toDayNumber,
} from "./dates";

export interface RatePeriod {
  /** First day this rate applies. */
  effectiveFrom: ISODate;
  /** Monthly rate as a fraction, e.g. 0.02 for 2%. */
  monthlyRate: number;
}

export type EntryKind = "deposit" | "withdrawal" | "adjustment";

export interface LedgerEntry {
  date: ISODate;
  /** Signed: deposits positive, withdrawals negative. */
  amountCents: number;
  kind: EntryKind;
  note?: string;
}

export interface Payday {
  /** `YYYY-MM` the interest was earned in. */
  month: string;
  date: ISODate;
  amountCents: number;
  balanceAfterCents: number;
}

export interface Snapshot {
  date: ISODate;
  balanceCents: number;
  /** Net money put in (deposits − withdrawals ± adjustments). */
  contributedCents: number;
  /** Total interest paid so far. */
  interestCents: number;
}

export interface AccountState {
  asOf: ISODate;
  balanceCents: number;
  contributedCents: number;
  interestPaidCents: number;
  /** Interest earned this month but not yet paid, in fractional cents. */
  accruedCents: number;
  /** Rounding remainder carried to the next Payday, in fractional cents. */
  carryCents: number;
  paydays: Payday[];
  /** One snapshot per month end, plus the start and `asOf` days. */
  snapshots: Snapshot[];
}

export interface RateScheduleOptions {
  introRate?: number;
  introMonths?: number;
  ongoingRate?: number;
}

export const DEFAULT_INTRO_RATE = 0.02;
export const DEFAULT_INTRO_MONTHS = 3;
export const DEFAULT_ONGOING_RATE = 0.01;

/** Default schedule: 2%/month for 3 months from the open date, then 1%/month. */
export function defaultRateSchedule(
  openedOn: ISODate,
  {
    introRate = DEFAULT_INTRO_RATE,
    introMonths = DEFAULT_INTRO_MONTHS,
    ongoingRate = DEFAULT_ONGOING_RATE,
  }: RateScheduleOptions = {},
): RatePeriod[] {
  if (introMonths <= 0) return [{ effectiveFrom: openedOn, monthlyRate: ongoingRate }];
  return [
    { effectiveFrom: openedOn, monthlyRate: introRate },
    { effectiveFrom: addMonths(openedOn, introMonths), monthlyRate: ongoingRate },
  ];
}

/** Rate in effect on `date` (0 before the first period). */
export function rateOn(rates: RatePeriod[], date: ISODate): number {
  let rate = 0;
  let best = "";
  for (const p of rates) {
    if (p.effectiveFrom <= date && p.effectiveFrom >= best) {
      best = p.effectiveFrom;
      rate = p.monthlyRate;
    }
  }
  return rate;
}

export interface RunAccountInput {
  /** Interest starts accruing on this day. */
  openedOn: ISODate;
  rates: RatePeriod[];
  entries: LedgerEntry[];
  /** Simulate through the end of this day (inclusive). */
  asOf: ISODate;
}

/** Replays the ledger day by day and returns the account's state on `asOf`. */
export function runAccount({ openedOn, rates, entries, asOf }: RunAccountInput): AccountState {
  const byDay = new Map<number, number>();
  let firstDay = toDayNumber(openedOn);
  for (const e of entries) {
    const n = toDayNumber(e.date);
    byDay.set(n, (byDay.get(n) ?? 0) + e.amountCents);
    firstDay = Math.min(firstDay, n);
  }

  // Look up rates in date order once instead of scanning per day.
  const sortedRates = [...rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const rateChanges = sortedRates.map((r) => ({ day: toDayNumber(r.effectiveFrom), rate: r.monthlyRate }));
  let rateIdx = -1;

  const openDay = toDayNumber(openedOn);
  const lastDay = toDayNumber(asOf);

  let balance = 0;
  let contributed = 0;
  let interestPaid = 0;
  let accrued = 0;
  let carry = 0;
  const paydays: Payday[] = [];
  const snapshots: Snapshot[] = [];
  const snap = (date: ISODate) =>
    snapshots.push({ date, balanceCents: balance, contributedCents: contributed, interestCents: interestPaid });

  for (let day = firstDay; day <= lastDay; day++) {
    const date = fromDayNumber(day);

    const delta = byDay.get(day);
    if (delta) {
      balance += delta;
      contributed += delta;
    }

    while (rateIdx + 1 < rateChanges.length && rateChanges[rateIdx + 1].day <= day) rateIdx++;

    if (day >= openDay) {
      const rate = rateIdx >= 0 ? rateChanges[rateIdx].rate : 0;
      const dim = daysInMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
      accrued += (Math.max(balance, 0) * rate) / dim;

      if (isLastDayOfMonth(date)) {
        const total = accrued + carry;
        const paid = Math.round(total);
        carry = total - paid;
        accrued = 0;
        if (paid !== 0) {
          balance += paid;
          interestPaid += paid;
          paydays.push({ month: monthKey(date), date, amountCents: paid, balanceAfterCents: balance });
        }
      }
    }

    if (day === firstDay || day === lastDay || isLastDayOfMonth(date)) snap(date);
  }

  return {
    asOf,
    balanceCents: balance,
    contributedCents: contributed,
    interestPaidCents: interestPaid,
    accruedCents: accrued,
    carryCents: carry,
    paydays,
    snapshots,
  };
}

/** Converts a bank's annual yield (APY) into the equivalent monthly rate. */
export function monthlyRateFromAnnual(apy: number): number {
  return Math.pow(1 + apy, 1 / 12) - 1;
}

/** Effective annual rate of a monthly rate compounded 12 times. */
export function annualFromMonthlyRate(monthlyRate: number): number {
  return Math.pow(1 + monthlyRate, 12) - 1;
}

/** Months for money to double at a constant monthly rate (Infinity at 0%). */
export function monthsToDouble(monthlyRate: number): number {
  if (monthlyRate <= 0) return Infinity;
  return Math.log(2) / Math.log(1 + monthlyRate);
}
