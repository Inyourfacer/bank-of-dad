import { describe, expect, it } from "vitest";
import {
  annualFromMonthlyRate,
  defaultRateSchedule,
  monthlyRateFromAnnual,
  monthsToDouble,
  rateOn,
  runAccount,
  type LedgerEntry,
} from "./interest";

const deposit = (date: string, dollars: number): LedgerEntry => ({ date, amountCents: Math.round(dollars * 100), kind: "deposit" });
const withdraw = (date: string, dollars: number): LedgerEntry => ({ date, amountCents: -Math.round(dollars * 100), kind: "withdrawal" });
const flat = (from: string, monthlyRate: number) => [{ effectiveFrom: from, monthlyRate }];

describe("rate schedule", () => {
  it("defaults to 2% for 3 months from the open date, then 1%", () => {
    expect(defaultRateSchedule("2027-01-15")).toEqual([
      { effectiveFrom: "2027-01-15", monthlyRate: 0.02 },
      { effectiveFrom: "2027-04-15", monthlyRate: 0.01 },
    ]);
  });

  it("looks up the rate in effect on a day", () => {
    const rates = defaultRateSchedule("2027-01-15");
    expect(rateOn(rates, "2027-01-14")).toBe(0);
    expect(rateOn(rates, "2027-01-15")).toBe(0.02);
    expect(rateOn(rates, "2027-04-14")).toBe(0.02);
    expect(rateOn(rates, "2027-04-15")).toBe(0.01);
  });

  it("supports custom intro settings", () => {
    expect(defaultRateSchedule("2027-01-01", { introMonths: 0, ongoingRate: 0.015 })).toEqual([
      { effectiveFrom: "2027-01-01", monthlyRate: 0.015 },
    ]);
  });
});

describe("runAccount", () => {
  it("matches the design doc's worked example ($100, +$50 on day 16, 2%)", () => {
    const s = runAccount({
      openedOn: "2027-04-01",
      rates: flat("2027-04-01", 0.02),
      entries: [deposit("2027-04-01", 100), deposit("2027-04-16", 50)],
      asOf: "2027-04-30",
    });
    expect(s.paydays).toEqual([{ month: "2027-04", date: "2027-04-30", amountCents: 250, balanceAfterCents: 15250 }]);
    expect(s.balanceCents).toBe(15250);
    expect(s.contributedCents).toBe(15000);
    expect(s.interestPaidCents).toBe(250);
  });

  it("pays nothing until the last day of the month", () => {
    const s = runAccount({
      openedOn: "2027-04-01",
      rates: flat("2027-04-01", 0.02),
      entries: [deposit("2027-04-01", 100)],
      asOf: "2027-04-15",
    });
    expect(s.paydays).toEqual([]);
    expect(s.balanceCents).toBe(10000);
    expect(s.accruedCents).toBeCloseTo(100, 6); // 15/30 of $2
  });

  it("charges less interest after a withdrawal", () => {
    const s = runAccount({
      openedOn: "2027-04-01",
      rates: flat("2027-04-01", 0.02),
      entries: [deposit("2027-04-01", 100), withdraw("2027-04-16", 50)],
      asOf: "2027-04-30",
    });
    expect(s.paydays[0].amountCents).toBe(150);
  });

  it("compounds: $100 at 1%/month for a year ≈ 100 × 1.01^12", () => {
    const s = runAccount({
      openedOn: "2027-01-01",
      rates: flat("2027-01-01", 0.01),
      entries: [deposit("2027-01-01", 100)],
      asOf: "2027-12-31",
    });
    expect(s.paydays).toHaveLength(12);
    expect(Math.abs(s.balanceCents - 10000 * 1.01 ** 12)).toBeLessThanOrEqual(1);
  });

  it("handles a partial first month and the intro period ending mid-month", () => {
    const s = runAccount({
      openedOn: "2027-01-15",
      rates: defaultRateSchedule("2027-01-15"),
      entries: [deposit("2027-01-15", 100)],
      asOf: "2027-04-30",
    });
    // Jan: 17/31 of 2% on $100            = 109.68¢ → 110¢ (carry −0.32¢)
    // Feb: 2% on $101.10 = 202.2 − 0.32   = 201.88¢ → 202¢ (carry −0.12¢)
    // Mar: 2% on $103.12 = 206.24 − 0.12  = 206.12¢ → 206¢ (carry +0.12¢)
    // Apr: 14 days @2% + 16 days @1% on $105.18 = 98.17 + 56.10 + 0.12 → 154¢
    expect(s.paydays.map((p) => p.amountCents)).toEqual([110, 202, 206, 154]);
    expect(s.balanceCents).toBe(10672);
  });

  it("uses 29 days for February in a leap year", () => {
    const base = { openedOn: "2028-02-01", rates: flat("2028-02-01", 0.01), entries: [deposit("2028-02-01", 100)] };
    expect(runAccount({ ...base, asOf: "2028-02-28" }).accruedCents).toBeCloseTo((100 * 28) / 29, 6);
    expect(runAccount({ ...base, asOf: "2028-02-29" }).paydays[0]).toMatchObject({ date: "2028-02-29", amountCents: 100 });
  });

  it("carries rounding remainders instead of losing them", () => {
    // 20¢ at 2% earns 0.4¢/month: rounding alone would pay 0 forever.
    const s = runAccount({
      openedOn: "2027-01-01",
      rates: flat("2027-01-01", 0.02),
      entries: [{ date: "2027-01-01", amountCents: 20, kind: "deposit" }],
      asOf: "2027-12-31",
    });
    expect(s.interestPaidCents).toBe(5);
    expect(Math.abs(s.carryCents)).toBeLessThan(0.5);
  });

  it("does not accrue before the account opens", () => {
    const s = runAccount({
      openedOn: "2027-05-01",
      rates: flat("2027-05-01", 0.02),
      entries: [deposit("2027-04-10", 100)],
      asOf: "2027-05-31",
    });
    expect(s.paydays.map((p) => p.month)).toEqual(["2027-05"]);
    expect(s.paydays[0].amountCents).toBe(200);
  });

  it("never pays interest on a negative balance", () => {
    const s = runAccount({
      openedOn: "2027-04-01",
      rates: flat("2027-04-01", 0.02),
      entries: [withdraw("2027-04-01", 10)],
      asOf: "2027-04-30",
    });
    expect(s.interestPaidCents).toBe(0);
  });

  it("snapshots the start, each month end and the as-of day", () => {
    const s = runAccount({
      openedOn: "2027-01-15",
      rates: flat("2027-01-15", 0.01),
      entries: [deposit("2027-01-15", 100)],
      asOf: "2027-03-10",
    });
    expect(s.snapshots.map((x) => x.date)).toEqual(["2027-01-15", "2027-01-31", "2027-02-28", "2027-03-10"]);
  });
});

describe("rate math", () => {
  it("converts between monthly and annual rates", () => {
    expect(annualFromMonthlyRate(0.01)).toBeCloseTo(0.126825, 6);
    expect(annualFromMonthlyRate(monthlyRateFromAnnual(0.05))).toBeCloseTo(0.05, 10);
  });

  it("computes doubling time", () => {
    expect(monthsToDouble(0.01)).toBeCloseTo(69.66, 2);
    expect(monthsToDouble(0)).toBe(Infinity);
  });
});
