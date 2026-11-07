import { describe, expect, it } from "vitest";
import { project, projectionEntries } from "./projection";

const rates = [{ effectiveFrom: "2027-01-01", monthlyRate: 0.01 }];

describe("projections", () => {
  it("adds weekly deposits starting one week in", () => {
    const e = projectionEntries({
      startDate: "2027-01-01",
      endDate: "2027-03-31",
      rates,
      startBalanceCents: 0,
      recurring: { amountCents: 500, frequency: "weekly" },
    });
    expect(e).toHaveLength(12);
    expect(e[0].date).toBe("2027-01-08");
    expect(e[11].date).toBe("2027-03-26");
  });

  it("adds monthly deposits and a one-time deposit", () => {
    const e = projectionEntries({
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      rates,
      startBalanceCents: 10000,
      oneTime: { amountCents: 5000, afterMonths: 2 },
      recurring: { amountCents: 2000, frequency: "monthly" },
    });
    expect(e.filter((x) => x.note === "Recurring deposit")).toHaveLength(11);
    expect(e.find((x) => x.note === "Extra deposit")?.date).toBe("2027-03-01");
    expect(e.find((x) => x.note === "Starting amount")?.amountCents).toBe(10000);
  });

  it("skips a one-time deposit past the end", () => {
    const e = projectionEntries({
      startDate: "2027-01-01",
      endDate: "2027-02-28",
      rates,
      startBalanceCents: 0,
      oneTime: { amountCents: 5000, afterMonths: 6 },
    });
    expect(e).toHaveLength(0);
  });

  it("extra deposits grow the final balance by more than their face value", () => {
    const base = { startDate: "2027-01-01", endDate: "2031-12-31", rates, startBalanceCents: 10000 };
    const without = project(base);
    const withExtra = project({ ...base, recurring: { amountCents: 1000, frequency: "monthly" } });
    const added = withExtra.contributedCents - without.contributedCents;
    expect(added).toBe(59 * 1000);
    expect(withExtra.balanceCents - without.balanceCents).toBeGreaterThan(added);
  });
});
