import { describe, expect, it } from "vitest";
import { startLater } from "./startLater";
import type { SimSettings } from "./useSimulation";

const s: SimSettings = {
  startCents: 10000,
  introRate: 0.01,
  introMonths: 0,
  ongoingRate: 0.01,
  months: 120,
  oneTimeCents: 0,
  oneTimeAfterMonths: 0,
  recurringCents: 1000,
  recurringFrequency: "monthly",
  bankApy: 0.005,
};

describe("startLater", () => {
  it("waiting costs money even though both end on the same day", () => {
    const r = startLater(s, 5, "2027-01-10")!;
    expect(r.points).toHaveLength(121);
    expect(r.points[59].later).toBeNull();
    expect(r.points[60].later).toBeGreaterThan(0);
    expect(r.points.at(-1)!.later! * 100).toBe(r.laterCents);
    expect(r.costCents).toBeGreaterThan(0);
    // Starting 5 years earlier more than doubles the result here.
    expect(r.nowCents).toBeGreaterThan(2 * r.laterCents);
  });

  it("needs a delay shorter than the plan", () => {
    expect(startLater(s, 0)).toBeNull();
    expect(startLater({ ...s, months: 24 }, 2)).toBeNull();
  });
});
