import { describe, expect, it } from "vitest";
import { planPaydays } from "./payday";
import type { RatePeriodRow, TransactionRow } from "./types";

const fam = { id: "f", time_zone: "America/Chicago" };
const kid = { id: "k", family_id: "f", account_opened_on: "2027-04-01" };
const rates: RatePeriodRow[] = [{ id: "r", kid_id: "k", effective_from: "2027-04-01", monthly_rate: 0.02 }];
const dep = (occurred_on: string, amount_cents: number): TransactionRow => ({
  id: occurred_on,
  kid_id: "k",
  kind: "deposit",
  amount_cents,
  occurred_on,
  note: null,
  created_at: occurred_on,
});
const ledger = [dep("2027-04-01", 10000), dep("2027-04-16", 5000)];

describe("planPaydays", () => {
  it("posts every finished month, catching up missed ones", () => {
    const plan = planPaydays({ families: [fam], kids: [kid], rates, transactions: ledger, now: new Date("2027-06-10T15:00:00Z") });
    expect(plan.toPost.map((p) => [p.period_month, p.occurred_on])).toEqual([
      ["2027-04-01", "2027-04-30"],
      ["2027-05-01", "2027-05-31"],
    ]);
    expect(plan.toPost[0].amount_cents).toBe(250); // the design doc's worked example
  });

  it("skips months already posted (safe to run every day)", () => {
    const posted = { ...dep("2027-04-30", 250), id: "i", kind: "interest" as const, period_month: "2027-04-01" };
    const plan = planPaydays({ families: [fam], kids: [kid], rates, transactions: [...ledger, posted], now: new Date("2027-05-02T15:00:00Z") });
    expect(plan.toPost).toEqual([]);
    expect(plan.mismatches).toEqual([]);
  });

  it("waits for the month to end in the family's time zone", () => {
    // 03:00 UTC on May 1 is still April 30 in Chicago.
    const early = planPaydays({ families: [fam], kids: [kid], rates, transactions: ledger, now: new Date("2027-05-01T03:00:00Z") });
    expect(early.toPost).toEqual([]);
    const later = planPaydays({ families: [fam], kids: [kid], rates, transactions: ledger, now: new Date("2027-05-01T08:00:00Z") });
    expect(later.toPost).toHaveLength(1);
  });

  it("ignores accounts that haven't opened", () => {
    const plan = planPaydays({
      families: [fam],
      kids: [{ ...kid, account_opened_on: null }],
      rates,
      transactions: ledger,
      now: new Date("2027-08-01T12:00:00Z"),
    });
    expect(plan.toPost).toEqual([]);
  });

  it("reports a posted amount that no longer matches", () => {
    const wrong = { ...dep("2027-04-30", 999), id: "i", kind: "interest" as const, period_month: "2027-04-01" };
    const plan = planPaydays({ families: [fam], kids: [kid], rates, transactions: [...ledger, wrong], now: new Date("2027-05-02T15:00:00Z") });
    expect(plan.mismatches).toEqual([{ kid_id: "k", period_month: "2027-04-01", posted: 999, expected: 250 }]);
  });
});
