/**
 * Plans which Payday (interest) rows to post. Pure, so it can be tested and
 * run anywhere: the daily job calls it with everything in the database.
 *
 * A month's Payday is posted once that month has ended in the family's own
 * time zone. Missed months are caught up. Already-posted months are skipped,
 * so running it twice is harmless.
 */

import { addDays, startOfMonth, todayInZone } from "../engine/dates";
import { runAccount } from "../engine/interest";
import type { Family, Kid, RatePeriodRow, TransactionRow } from "./types";

export interface PaydayRow {
  kid_id: string;
  kind: "interest";
  amount_cents: number;
  occurred_on: string;
  /** First day of the month the interest was earned in. */
  period_month: string;
  note: string;
}

export interface PaydayPlan {
  toPost: PaydayRow[];
  /** Posted amounts that no longer match the ledger (should never happen). */
  mismatches: { kid_id: string; period_month: string; posted: number; expected: number }[];
}

export interface PaydayInput {
  families: Pick<Family, "id" | "time_zone">[];
  kids: Pick<Kid, "id" | "family_id" | "account_opened_on">[];
  rates: RatePeriodRow[];
  /** All transactions, including already-posted interest (with period_month). */
  transactions: (TransactionRow & { period_month?: string | null })[];
  now?: Date;
}

export function planPaydays({ families, kids, rates, transactions, now = new Date() }: PaydayInput): PaydayPlan {
  const plan: PaydayPlan = { toPost: [], mismatches: [] };
  const tzByFamily = new Map(families.map((f) => [f.id, f.time_zone]));

  for (const kid of kids) {
    if (!kid.account_opened_on) continue;
    const today = todayInZone(tzByFamily.get(kid.family_id) ?? "UTC", now);
    const lastClosedDay = addDays(startOfMonth(today), -1);
    if (lastClosedDay < kid.account_opened_on) continue;

    const mine = transactions.filter((t) => t.kid_id === kid.id);
    const posted = new Map(
      mine.filter((t) => t.kind === "interest" && t.period_month).map((t) => [t.period_month!.slice(0, 10), Number(t.amount_cents)]),
    );

    const state = runAccount({
      openedOn: kid.account_opened_on,
      rates: rates
        .filter((r) => r.kid_id === kid.id)
        .map((r) => ({ effectiveFrom: r.effective_from, monthlyRate: Number(r.monthly_rate) })),
      entries: mine
        .filter((t) => t.kind !== "interest")
        .map((t) => ({ date: t.occurred_on, amountCents: Number(t.amount_cents), kind: t.kind as "deposit" })),
      asOf: lastClosedDay,
    });

    for (const p of state.paydays) {
      const period = `${p.month}-01`;
      const already = posted.get(period);
      if (already === undefined) {
        plan.toPost.push({
          kid_id: kid.id,
          kind: "interest",
          amount_cents: p.amountCents,
          occurred_on: p.date,
          period_month: period,
          note: "Payday",
        });
      } else if (already !== p.amountCents) {
        plan.mismatches.push({ kid_id: kid.id, period_month: period, posted: already, expected: p.amountCents });
      }
    }
  }
  return plan;
}
