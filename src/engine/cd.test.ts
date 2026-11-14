import { describe, expect, it } from "vitest";
import { cdQuote, cdStatus, fullMonthsBetween, grow, loanStatus, paymentFor, payoffPlan } from "./cd";

describe("CDs", () => {
  const cd = {
    principal_cents: 2000,
    base_monthly_rate: 0.01,
    bonus_monthly_rate: 0.01,
    term_months: 6,
    opened_on: "2027-01-15",
    matures_on: "2027-07-15",
  };

  it("counts whole months by the day of the month", () => {
    expect(fullMonthsBetween("2027-01-15", "2027-02-14")).toBe(0);
    expect(fullMonthsBetween("2027-01-15", "2027-02-15")).toBe(1);
    expect(fullMonthsBetween("2027-01-31", "2027-02-28")).toBe(1);
    expect(fullMonthsBetween("2027-01-15", "2027-01-01")).toBe(0);
  });

  it("pays base + bonus at maturity", () => {
    // $20 at 2%/month for 6 months = 20 × 1.02^6 = $22.52
    const s = cdStatus(cd, "2027-07-15");
    expect(s.maturityCents).toBe(2252);
    expect(s.matured).toBe(true);
  });

  it("breaking early pays the base rate only and shows the bonus lost", () => {
    const s = cdStatus(cd, "2027-04-20"); // 3 full months
    expect(s.monthsDone).toBe(3);
    expect(s.breakNowCents).toBe(grow(2000, 0.01, 3)); // $20.61
    expect(s.breakNowCents).toBe(2061);
    expect(s.bonusLostCents).toBe(grow(2000, 0.02, 3) - 2061); // $21.22 − $20.61 = $0.61
    expect(s.matured).toBe(false);
    expect(s.daysLeft).toBe(86);
  });

  it("quotes a CD against regular savings", () => {
    expect(cdQuote(2000, 0.01, 0.01, 6)).toEqual({ cdCents: 2252, savingsCents: 2123 });
  });
});

describe("loans", () => {
  const loan = { principal_cents: 5000, monthly_rate: 0.03, started_on: "2027-03-01" };

  it("charges 3% at the end of each month", () => {
    const s = loanStatus(loan, [], "2027-04-30");
    // $50 → $51.50 (March) → $53.05 (April)
    expect(s.balanceCents).toBe(5305);
    expect(s.interestCents).toBe(305);
  });

  it("counts interest building this month as owed", () => {
    expect(loanStatus(loan, [], "2027-03-16").balanceCents).toBe(5000 + Math.round(5000 * 0.03 * (16 / 31)));
  });

  it("payments bring it down and can pay it off", () => {
    const s = loanStatus(loan, [{ amount_cents: 5000, paid_on: "2027-03-01" }], "2027-05-01");
    expect(s).toMatchObject({ balanceCents: 0, paidOff: true, paidCents: 5000 });
  });

  it("works out a payoff plan", () => {
    const p = payoffPlan(5000, 0.03, 1000);
    expect(p.months).toBe(6);
    expect(p.totalInterestCents).toBeGreaterThan(400);
    expect(p.totalInterestCents).toBeLessThan(600);
  });

  it("springs the minimum payment trap", () => {
    expect(payoffPlan(5000, 0.03, 150).months).toBe(Infinity); // $1.50 only covers interest
    expect(payoffPlan(5000, 0.03, 200).months).toBeGreaterThan(40);
  });

  it("finds the payment for a payoff time", () => {
    const pay = paymentFor(5000, 0.03, 6);
    expect(payoffPlan(5000, 0.03, pay).months).toBe(6);
    expect(payoffPlan(5000, 0.03, pay - 5).months).toBeGreaterThan(6);
  });
});
