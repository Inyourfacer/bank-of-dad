import { describe, expect, it } from "vitest";
import { fromAnnual, fromMonthly, timesMore } from "./rates";

describe("rate comparison", () => {
  it("expresses Bank of Dad monthly rates per year", () => {
    const starter = fromMonthly(0.02);
    expect(starter.annual).toBeCloseTo(0.268242, 6);
    expect(starter.per100PerYearCents).toBe(2682);
    const ongoing = fromMonthly(0.01);
    expect(ongoing.annual).toBeCloseTo(0.126825, 6);
    expect(ongoing.per100PerYearCents).toBe(1268);
  });

  it("expresses a regular bank's annual rate per month", () => {
    const bank = fromAnnual(0.005);
    expect(bank.monthly).toBeCloseTo(0.00041571, 8);
    expect(bank.per100PerYearCents).toBe(50);
  });

  it("round-trips and compares on the same (annual) basis", () => {
    expect(fromAnnual(fromMonthly(0.01).annual).monthly).toBeCloseTo(0.01, 12);
    expect(timesMore(fromMonthly(0.01), fromAnnual(0.005))).toBeCloseTo(25.37, 2);
    expect(timesMore(fromMonthly(0.01), fromAnnual(0))).toBe(Infinity);
  });
});
