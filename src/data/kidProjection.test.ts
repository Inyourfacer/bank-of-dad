import { describe, expect, it } from "vitest";
import { horizonEnd, keepItValue, kidWhatIf } from "./kidProjection";
import type { RatePeriodRow, TransactionRow } from "./types";

const rate = (effective_from: string, monthly_rate: number): RatePeriodRow => ({ id: effective_from, kid_id: "k", effective_from, monthly_rate });
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
  kid: { account_opened_on: "2027-01-01" },
  rates: [rate("2027-01-01", 0.01)],
  transactions: [dep("2027-01-01", 10000)],
  today: "2027-03-15",
  bankApy: 0.005,
};

describe("kidWhatIf", () => {
  it("starts from today's real balance", () => {
    const r = kidWhatIf({ ...base, months: 12 });
    expect(r.points[0]).toMatchObject({ month: 0, date: "2027-03-15" });
    expect(r.points[0].balance * 100).toBe(r.now.balanceCents);
    expect(r.now.balanceCents).toBe(10201); // two Paydays at 1%
  });

  it("looks ahead N full months, one point per Payday", () => {
    const r = kidWhatIf({ ...base, months: 12 });
    expect(r.endDate).toBe("2028-03-31");
    expect(r.points).toHaveLength(14); // now + March (partial) + 12 full months
    expect(r.points.at(-1)!.date).toBe("2028-03-31");
  });

  it("adds extra deposits and keeps a no-extras baseline", () => {
    const r = kidWhatIf({ ...base, months: 24, recurringCents: 500, recurringFrequency: "weekly" });
    expect(r.hasExtras).toBe(true);
    const last = r.points.at(-1)!;
    expect(last.balance).toBeGreaterThan(last.baseline!);
    expect(r.scenario.contributedCents - r.baseline!.contributedCents).toBeGreaterThan(0);
  });

  it("compares with a regular bank from today", () => {
    const r = kidWhatIf({ ...base, months: 60 });
    expect(r.points[0].bank).toBe(r.points[0].balance);
    expect(r.points.at(-1)!.bank).toBeLessThan(r.points.at(-1)!.balance);
  });

  it("finds the end of the horizon on Payday", () => {
    expect(horizonEnd("2027-03-31", 1)).toBe("2027-04-30");
    expect(horizonEnd("2027-01-15", 12)).toBe("2028-01-31");
  });
});

describe("keepItValue", () => {
  it("shows what money would grow to at the kid's rate", () => {
    const [oneYear, fiveYears] = keepItValue(1000, [rate("2027-01-01", 0.01)], "2027-03-15", [1, 5]);
    // About $10 × 1.01^12 and × 1.01^60 (partial first month).
    expect(oneYear).toBeGreaterThanOrEqual(1121);
    expect(oneYear).toBeLessThanOrEqual(1128);
    expect(fiveYears).toBeGreaterThanOrEqual(1805);
    expect(fiveYears).toBeLessThanOrEqual(1818);
  });
  it("is zero for nothing", () => {
    expect(keepItValue(0, [], "2027-01-01", [1])).toEqual([0]);
  });
});
