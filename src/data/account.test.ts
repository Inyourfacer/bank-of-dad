import { describe, expect, it } from "vitest";
import { computeKidAccount } from "./account";
import type { RatePeriodRow, TransactionRow } from "./types";

const txn = (id: string, occurred_on: string, amount_cents: number, kind: TransactionRow["kind"] = "deposit"): TransactionRow => ({
  id,
  kid_id: "k",
  kind,
  amount_cents,
  occurred_on,
  note: null,
  created_at: `${occurred_on}T12:00:00Z`,
});
const rate = (effective_from: string, monthly_rate: number): RatePeriodRow => ({ id: effective_from, kid_id: "k", effective_from, monthly_rate });

describe("computeKidAccount", () => {
  it("holds money without interest until the first login", () => {
    const a = computeKidAccount({ account_opened_on: null }, [], [txn("a", "2027-01-05", 5000), txn("b", "2027-02-01", 2500)], "2027-03-10");
    expect(a).toMatchObject({ opened: false, balanceCents: 7500, interestPaidCents: 0, accruingCents: 0, nextPayday: null });
    expect(a.activity.map((x) => x.id)).toEqual(["b", "a"]);
    expect(a.activity.every((x) => x.deletable)).toBe(true);
  });

  it("pays interest from the open date and lists Paydays", () => {
    const a = computeKidAccount(
      { account_opened_on: "2027-04-01" },
      [rate("2027-04-01", 0.02), rate("2027-07-01", 0.01)],
      [txn("a", "2027-03-20", 10000), txn("b", "2027-04-16", 5000)],
      "2027-05-15",
    );
    // April: $100 × 15 days + $150 × 15 days at 2% → $2.50 (design doc example).
    const payday = a.activity.find((x) => x.kind === "interest");
    expect(payday).toMatchObject({ date: "2027-04-30", amountCents: 250, balanceAfterCents: 15250, deletable: false });
    expect(a.balanceCents).toBe(15250);
    expect(a.interestPaidCents).toBe(250);
    // May 1–15 at 2% on $152.50 ≈ 147.58¢
    expect(a.accruingCents).toBe(148);
    expect(a.nextPayday).toBe("2027-05-31");
  });

  it("only allows deleting this month's entries once open", () => {
    const a = computeKidAccount(
      { account_opened_on: "2027-04-01" },
      [rate("2027-04-01", 0.01)],
      [txn("old", "2027-04-10", 1000), txn("new", "2027-05-02", 1000)],
      "2027-05-15",
    );
    const del = Object.fromEntries(a.activity.map((x) => [x.id, x.deletable]));
    expect(del).toMatchObject({ old: false, new: true });
  });

  it("ignores posted interest rows and derives interest itself", () => {
    const a = computeKidAccount(
      { account_opened_on: "2027-04-01" },
      [rate("2027-04-01", 0.01)],
      [txn("a", "2027-04-01", 10000), { ...txn("i", "2027-04-30", 100, "interest") }],
      "2027-05-01",
    );
    expect(a.balanceCents).toBe(10100);
    expect(a.activity.filter((x) => x.kind === "interest")).toHaveLength(1);
  });

  it("shows nothing accruing on Payday itself", () => {
    const a = computeKidAccount({ account_opened_on: "2027-04-01" }, [rate("2027-04-01", 0.01)], [txn("a", "2027-04-01", 10000)], "2027-04-30");
    expect(a.accruingCents).toBe(0);
    expect(a.balanceCents).toBe(10100);
  });
});
