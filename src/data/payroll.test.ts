import { describe, expect, it } from "vitest";
import { DEFAULT_EXPENSES, DEFAULT_TAX_BRACKETS } from "../engine/paycheck";
import { duePaycheck, paydayFor, planPayroll } from "./payroll";
import type { PayPlan } from "./types";

const plan: PayPlan = { kid_id: "k", enabled: true, salary_cents: 10000, pay_day: 1, expenses: DEFAULT_EXPENSES };

describe("payroll", () => {
  it("pays on payday with the default $7.20 take-home", () => {
    const due = duePaycheck(plan, DEFAULT_TAX_BRACKETS, [], "2027-03-01");
    expect(due).toMatchObject({ kid_id: "k", payMonth: "2027-03-01", paidOn: "2027-03-01" });
    expect(due!.paycheck.netCents).toBe(720);
  });

  it("waits for payday, then pays later in the month if missed", () => {
    const p = { ...plan, pay_day: 15 };
    expect(duePaycheck(p, DEFAULT_TAX_BRACKETS, [], "2027-03-14")).toBeNull();
    expect(duePaycheck(p, DEFAULT_TAX_BRACKETS, [], "2027-03-20")?.paidOn).toBe("2027-03-15");
  });

  it("pays each month once, and not when switched off", () => {
    expect(duePaycheck(plan, DEFAULT_TAX_BRACKETS, [{ kid_id: "k", pay_month: "2027-03-01" }], "2027-03-09")).toBeNull();
    expect(duePaycheck({ ...plan, enabled: false }, DEFAULT_TAX_BRACKETS, [], "2027-03-09")).toBeNull();
  });

  it("clamps payday to short months", () => {
    expect(paydayFor({ pay_day: 28 }, "2027-02-10")).toBe("2027-02-28");
  });

  it("plans payroll in each family's time zone", () => {
    const input = {
      families: [{ id: "f", time_zone: "America/Chicago", tax_brackets: DEFAULT_TAX_BRACKETS }],
      kids: [{ id: "k", family_id: "f" }],
      plans: [plan],
      statements: [{ kid_id: "k", pay_month: "2027-02-01" }],
    };
    // 03:00 UTC on March 1 is still February 28 in Chicago: February is paid.
    expect(planPayroll({ ...input, now: new Date("2027-03-01T03:00:00Z") })).toEqual([]);
    expect(planPayroll({ ...input, now: new Date("2027-03-01T12:00:00Z") })).toHaveLength(1);
  });
});
