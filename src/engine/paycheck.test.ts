import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPENSES,
  DEFAULT_SALARY_CENTS,
  DEFAULT_TAX_BRACKETS,
  TARGET_NET_CENTS,
  computePaycheck,
  computeTax,
  DEFAULT_SPLIT,
  splitTakeHome,
} from "./paycheck";

describe("computeTax", () => {
  it("taxes each slice of pay at its own rate", () => {
    expect(computeTax(10000, DEFAULT_TAX_BRACKETS)).toEqual([
      { label: "10% on the first $20", cents: 200 },
      { label: "15% on $20 to $60", cents: 600 },
      { label: "22% on pay above $60", cents: 880 },
    ]);
  });

  it("only uses the brackets the pay reaches", () => {
    expect(computeTax(1500, DEFAULT_TAX_BRACKETS)).toEqual([{ label: "10% on the first $20", cents: 150 }]);
    expect(computeTax(0, DEFAULT_TAX_BRACKETS)).toEqual([]);
  });

  it("accepts brackets in any order and skips 0% ones", () => {
    const t = computeTax(5000, [
      { up_to_cents: null, rate: 0.3 },
      { up_to_cents: 1000, rate: 0 },
    ]);
    expect(t).toEqual([{ label: "30% on pay above $10", cents: 1200 }]);
  });
});

describe("computePaycheck", () => {
  it("defaults leave $7.20 to keep, inside the $5 to $10 target", () => {
    const p = computePaycheck(DEFAULT_SALARY_CENTS, DEFAULT_TAX_BRACKETS, DEFAULT_EXPENSES);
    expect(p.taxCents).toBe(1680);
    expect(p.expenseCents).toBe(7600);
    expect(p.netCents).toBe(720);
    expect(p.netCents).toBeGreaterThanOrEqual(TARGET_NET_CENTS.min);
    expect(p.netCents).toBeLessThanOrEqual(TARGET_NET_CENTS.max);
    expect(p.grossCents - p.taxCents - p.expenseCents).toBe(p.netCents);
  });

  it("never pays below zero when bills are more than the pay", () => {
    const p = computePaycheck(5000, DEFAULT_TAX_BRACKETS, [{ name: "Rent", cents: 9000 }]);
    expect(p.netCents).toBe(0);
  });

  it("ignores empty bills", () => {
    const p = computePaycheck(10000, [], [{ name: "Phone", cents: 0 }]);
    expect(p.expenses).toEqual([]);
    expect(p.netCents).toBe(10000);
  });
});

describe("splitTakeHome", () => {
  it("splits $7.20 50 / 40 / 10", () => {
    expect(splitTakeHome(720, DEFAULT_SPLIT)).toEqual({ saveCents: 360, spendCents: 288, giveCents: 72 });
  });
  it("always adds up, with rounding going to savings", () => {
    for (const net of [1, 7, 333, 999, 1001]) {
      const s = splitTakeHome(net, { save_pct: 33, spend_pct: 33, give_pct: 34 });
      expect(s.saveCents + s.spendCents + s.giveCents).toBe(net);
      expect(s.saveCents).toBeGreaterThanOrEqual(0);
    }
  });
  it("never goes negative when two halves both round up", () => {
    expect(splitTakeHome(1, { save_pct: 0, spend_pct: 50, give_pct: 50 })).toEqual({ saveCents: 0, spendCents: 1, giveCents: 0 });
  });
  it("can save everything", () => {
    expect(splitTakeHome(720, { save_pct: 100, spend_pct: 0, give_pct: 0 })).toEqual({ saveCents: 720, spendCents: 0, giveCents: 0 });
  });
});
