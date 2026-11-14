import { describe, expect, it } from "vitest";
import { jarBalance, monthsBetween, projectGoal } from "./goals";
import type { JarEntry, RatePeriodRow, TransactionRow } from "./types";

const rates: RatePeriodRow[] = [{ id: "r", kid_id: "k", effective_from: "2027-01-01", monthly_rate: 0.01 }];
const dep = (occurred_on: string, amount_cents: number): TransactionRow => ({
  id: occurred_on + amount_cents,
  kid_id: "k",
  kind: "deposit",
  amount_cents,
  occurred_on,
  note: null,
  created_at: occurred_on,
});
const base = {
  openedOn: "2027-01-01",
  rates,
  transactions: [dep("2027-01-01", 5000)],
  today: "2027-03-10",
  monthlySaveCents: 1000,
  payDay: 1,
  paidThisMonth: true,
};

describe("projectGoal", () => {
  it("shows progress and when the goal is reached", () => {
    const p = projectGoal({ ...base, targetCents: 10000 });
    expect(p.balanceCents).toBe(5100); // two 1% Paydays on $50
    expect(p.progress).toBeCloseTo(0.51, 2);
    expect(p.reached).toBe(false);
    // March's pay is in; $10 arrives Apr 1 … Aug 1 (+1% interest each month):
    // $94.62 at the end of July, past $100 on the August payday.
    expect(p.byDate).toBe("2027-08-31");
  });

  it("is reached already when savings cover it", () => {
    expect(projectGoal({ ...base, targetCents: 4000 })).toMatchObject({ reached: true, progress: 1 });
  });

  it("taking money out pushes the goal back", () => {
    const now = projectGoal({ ...base, targetCents: 10000 });
    const after = projectGoal({ ...base, targetCents: 10000, withdrawCents: 2000 });
    expect(monthsBetween(now.byDate!, after.byDate!)).toBe(2);
  });

  it("counts this month's payday if it hasn't come yet", () => {
    const later = projectGoal({ ...base, targetCents: 10000, paidThisMonth: false, payDay: 20 });
    expect(later.byDate! < "2027-08-31").toBe(true);
  });

  it("can't promise a date with no savings coming in", () => {
    const p = projectGoal({ ...base, rates: [], monthlySaveCents: 0, targetCents: 10000 });
    expect(p.byDate).toBeNull();
  });
});

describe("jarBalance", () => {
  it("adds up one kid's jar", () => {
    const e = (kid_id: string, jar: "spend" | "give", amount_cents: number): JarEntry => ({
      id: String(Math.random()),
      kid_id,
      jar,
      amount_cents,
      occurred_on: "2027-01-01",
      note: null,
      statement_id: null,
      created_at: "",
    });
    const entries = [e("k", "spend", 288), e("k", "spend", -100), e("k", "give", 72), e("x", "spend", 999)];
    expect(jarBalance(entries, "k", "spend")).toBe(188);
    expect(jarBalance(entries, "k", "give")).toBe(72);
  });
});
