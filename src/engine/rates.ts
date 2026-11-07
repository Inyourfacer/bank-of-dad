/**
 * Puts Bank of Dad (monthly) and regular-bank (annual) rates on the same
 * footing so kids can compare them fairly: every rate is shown both per month
 * and per year, with monthly compounding in both directions.
 */

import { annualFromMonthlyRate, monthlyRateFromAnnual } from "./interest";

export interface ComparableRate {
  monthly: number;
  /** Effective annual rate (APY): what a year of monthly compounding yields. */
  annual: number;
  /** Interest earned on $100 left alone for a year, in cents. */
  per100PerYearCents: number;
}

export function fromMonthly(monthly: number): ComparableRate {
  const annual = annualFromMonthlyRate(monthly);
  return { monthly, annual, per100PerYearCents: Math.round(annual * 10000) };
}

export function fromAnnual(annual: number): ComparableRate {
  return { monthly: monthlyRateFromAnnual(annual), annual, per100PerYearCents: Math.round(annual * 10000) };
}

/** How many times more the first rate pays than the second, per year. */
export function timesMore(a: ComparableRate, b: ComparableRate): number {
  return b.annual > 0 ? a.annual / b.annual : Infinity;
}
