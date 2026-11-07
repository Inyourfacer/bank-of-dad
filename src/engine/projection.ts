/**
 * What-if projections built on the same engine as real accounts, so a
 * projection and the account it came from can never disagree.
 */

import { type ISODate, addDays, addMonths, toDayNumber } from "./dates";
import { type AccountState, type LedgerEntry, type RatePeriod, runAccount } from "./interest";

export type Frequency = "weekly" | "monthly";

export interface RecurringDeposit {
  amountCents: number;
  frequency: Frequency;
}

export interface OneTimeDeposit {
  amountCents: number;
  /** Deposited this many months after the start (0 = on the start day). */
  afterMonths: number;
}

export interface ProjectionInput {
  /** First day of the projection. */
  startDate: ISODate;
  /** Last day of the projection (inclusive). */
  endDate: ISODate;
  /** When the account opened (rate schedule anchor). Defaults to `startDate`. */
  openedOn?: ISODate;
  rates: RatePeriod[];
  /** Money already in the account (or the starting deposit) on `startDate`. */
  startBalanceCents: number;
  /** Past ledger, if projecting a real account forward. */
  history?: LedgerEntry[];
  oneTime?: OneTimeDeposit | null;
  recurring?: RecurringDeposit | null;
}

/** Ledger entries a projection adds on top of history. */
export function projectionEntries(input: ProjectionInput): LedgerEntry[] {
  const { startDate, endDate, startBalanceCents, oneTime, recurring } = input;
  const entries: LedgerEntry[] = [];
  const end = toDayNumber(endDate);

  if (startBalanceCents !== 0) {
    entries.push({ date: startDate, amountCents: startBalanceCents, kind: "deposit", note: "Starting amount" });
  }

  if (oneTime && oneTime.amountCents > 0) {
    const date = addMonths(startDate, oneTime.afterMonths);
    if (toDayNumber(date) <= end) {
      entries.push({ date, amountCents: oneTime.amountCents, kind: "deposit", note: "Extra deposit" });
    }
  }

  if (recurring && recurring.amountCents > 0) {
    // The first recurring deposit lands one period after the start.
    for (let i = 1; ; i++) {
      const date = recurring.frequency === "weekly" ? addDays(startDate, 7 * i) : addMonths(startDate, i);
      if (toDayNumber(date) > end) break;
      entries.push({ date, amountCents: recurring.amountCents, kind: "deposit", note: "Recurring deposit" });
    }
  }

  return entries;
}

export function project(input: ProjectionInput): AccountState {
  return runAccount({
    openedOn: input.openedOn ?? input.startDate,
    rates: input.rates,
    entries: [...(input.history ?? []), ...projectionEntries(input)],
    asOf: input.endDate,
  });
}
