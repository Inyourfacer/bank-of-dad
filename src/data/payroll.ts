/**
 * Payroll: which kids are due this month's pay, and what their stub says.
 * Pure and shared by the app ("Pay now"), the demo and the daily job.
 *
 * Only the current month is ever paid: earlier months are final in the ledger,
 * so a missed payday isn't back-filled.
 */

import { daysInMonth, startOfMonth, todayInZone } from "../engine/dates";
import { type Paycheck, type TaxBracket, computePaycheck } from "../engine/paycheck";
import type { PayPlan, PayStatement } from "./types";

export interface DuePaycheck {
  kid_id: string;
  payMonth: string;
  paidOn: string;
  paycheck: Paycheck;
}

/** This month's payday for a plan (clamped to the month's length). */
export function paydayFor(plan: Pick<PayPlan, "pay_day">, today: string): string {
  const [y, m] = today.split("-").map(Number);
  const day = Math.min(plan.pay_day, daysInMonth(y, m));
  return `${today.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

/** The stub a plan produces with the family's tax brackets. */
export function paycheckFor(plan: Pick<PayPlan, "salary_cents" | "expenses">, brackets: TaxBracket[]): Paycheck {
  return computePaycheck(plan.salary_cents, brackets, plan.expenses);
}

/** This month's paycheck if the plan is on, payday has come, and it isn't paid yet. */
export function duePaycheck(plan: PayPlan, brackets: TaxBracket[], statements: Pick<PayStatement, "kid_id" | "pay_month">[], today: string): DuePaycheck | null {
  if (!plan.enabled) return null;
  const payMonth = startOfMonth(today);
  const paidOn = paydayFor(plan, today);
  if (today < paidOn) return null;
  if (statements.some((s) => s.kid_id === plan.kid_id && s.pay_month.slice(0, 10) === payMonth)) return null;
  return { kid_id: plan.kid_id, payMonth, paidOn, paycheck: paycheckFor(plan, brackets) };
}

export interface PayrollInput {
  families: { id: string; time_zone: string; tax_brackets: TaxBracket[] }[];
  kids: { id: string; family_id: string }[];
  plans: PayPlan[];
  statements: Pick<PayStatement, "kid_id" | "pay_month">[];
  now?: Date;
}

/** Every paycheck due right now, each in its own family's time zone. */
export function planPayroll({ families, kids, plans, statements, now = new Date() }: PayrollInput): DuePaycheck[] {
  const familyOf = new Map(kids.map((k) => [k.id, families.find((f) => f.id === k.family_id)]));
  const out: DuePaycheck[] = [];
  for (const plan of plans) {
    const family = familyOf.get(plan.kid_id);
    if (!family) continue;
    const due = duePaycheck(plan, family.tax_brackets, statements, todayInZone(family.time_zone, now));
    if (due) out.push(due);
  }
  return out;
}
