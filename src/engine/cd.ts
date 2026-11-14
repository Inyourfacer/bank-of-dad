/**
 * CDs (locked savings) and loans from Dad. Pure math, shared by the app and
 * the demo; the database computes the same CD payouts when a CD closes.
 */

import { type ISODate, addMonths, toDayNumber } from "./dates";
import { runAccount } from "./interest";

export const CD_TERMS = [3, 6, 12] as const;
export type CdTerm = (typeof CD_TERMS)[number];

/** Whole months from `from` to `to` (a month counts once its day comes round). */
export function fullMonthsBetween(from: ISODate, to: ISODate): number {
  if (to <= from) return 0;
  let months = 0;
  while (addMonths(from, months + 1) <= to) months++;
  return months;
}

/** Principal compounded monthly, rounded to the cent. */
export function grow(principalCents: number, monthlyRate: number, months: number): number {
  return Math.round(principalCents * Math.pow(1 + monthlyRate, months));
}

export interface CdTerms {
  principal_cents: number;
  base_monthly_rate: number;
  bonus_monthly_rate: number;
  term_months: number;
  opened_on: ISODate;
  matures_on: ISODate;
}

export interface CdStatus {
  /** Paid at maturity (base + bonus for the full term). */
  maturityCents: number;
  /** Paid if broken today (base rate only, full months so far). */
  breakNowCents: number;
  /** The bonus you'd give up by breaking today. */
  bonusLostCents: number;
  matured: boolean;
  monthsDone: number;
  daysLeft: number;
}

export function cdStatus(cd: CdTerms, today: ISODate): CdStatus {
  const total = Number(cd.base_monthly_rate) + Number(cd.bonus_monthly_rate);
  const maturityCents = grow(cd.principal_cents, total, cd.term_months);
  const monthsDone = Math.min(fullMonthsBetween(cd.opened_on, today), cd.term_months);
  const breakNowCents = grow(cd.principal_cents, Number(cd.base_monthly_rate), monthsDone);
  const earnedWithBonus = grow(cd.principal_cents, total, monthsDone);
  return {
    maturityCents,
    breakNowCents,
    bonusLostCents: Math.max(0, earnedWithBonus - breakNowCents),
    matured: today >= cd.matures_on,
    monthsDone,
    daysLeft: Math.max(0, toDayNumber(cd.matures_on) - toDayNumber(today)),
  };
}

/** What locking `principal` would pay, versus leaving it in regular savings. */
export function cdQuote(principalCents: number, baseRate: number, bonusRate: number, months: number) {
  return {
    cdCents: grow(principalCents, baseRate + bonusRate, months),
    savingsCents: grow(principalCents, baseRate, months),
  };
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

export interface LoanTerms {
  principal_cents: number;
  monthly_rate: number;
  started_on: ISODate | null;
}

export interface LoanPayment {
  amount_cents: number;
  paid_on: ISODate;
}

export interface LoanStatus {
  balanceCents: number;
  paidCents: number;
  interestCents: number;
  paidOff: boolean;
}

/**
 * Loan balance today: the same daily-accrual, month-end engine as savings,
 * run on what's owed. Interest is charged on the last day of each month.
 */
export function loanStatus(loan: LoanTerms, payments: LoanPayment[], today: ISODate): LoanStatus {
  const paidCents = payments.reduce((s, p) => s + p.amount_cents, 0);
  if (!loan.started_on) return { balanceCents: loan.principal_cents, paidCents: 0, interestCents: 0, paidOff: false };
  const run = runAccount({
    openedOn: loan.started_on,
    rates: [{ effectiveFrom: loan.started_on, monthlyRate: Number(loan.monthly_rate) }],
    entries: [
      { date: loan.started_on, amountCents: loan.principal_cents, kind: "deposit" },
      ...payments.map((p) => ({ date: p.paid_on, amountCents: -p.amount_cents, kind: "withdrawal" as const })),
    ],
    asOf: today,
  });
  // Interest building this month is owed too (charged at month end).
  const balanceCents = Math.max(0, run.balanceCents + Math.round(run.accruedCents + run.carryCents));
  return { balanceCents, paidCents, interestCents: run.interestPaidCents, paidOff: balanceCents <= 0 };
}

export interface PayoffPlan {
  /** Months until paid off; Infinity if the payment never catches up. */
  months: number;
  totalInterestCents: number;
  totalPaidCents: number;
}

/** Paying `payment` every month on `balance` at `monthlyRate`. */
export function payoffPlan(balanceCents: number, monthlyRate: number, paymentCents: number): PayoffPlan {
  let balance = balanceCents;
  let interest = 0;
  let paid = 0;
  for (let month = 1; month <= 600; month++) {
    const charge = Math.round(balance * monthlyRate);
    if (paymentCents <= charge) return { months: Infinity, totalInterestCents: Infinity, totalPaidCents: Infinity };
    balance += charge;
    interest += charge;
    const pay = Math.min(paymentCents, balance);
    balance -= pay;
    paid += pay;
    if (balance <= 0) return { months: month, totalInterestCents: interest, totalPaidCents: paid };
  }
  return { months: Infinity, totalInterestCents: Infinity, totalPaidCents: Infinity };
}

/** The monthly payment that pays a loan off in `months` (rounded up to the cent). */
export function paymentFor(balanceCents: number, monthlyRate: number, months: number): number {
  if (monthlyRate === 0) return Math.ceil(balanceCents / months);
  const r = monthlyRate;
  return Math.ceil((balanceCents * r) / (1 - Math.pow(1 + r, -months)));
}
