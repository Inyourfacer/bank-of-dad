import { describe, expect, it } from "vitest";
import { forecastLiability } from "./forecast";
import type { FamilyData, Kid } from "./types";

const kid = (id: string, opened: string | null): Kid => ({
  id,
  family_id: "f",
  name: id,
  avatar: "🐷",
  mode: "standard",
  intro_monthly_rate: 0.02,
  intro_months: 3,
  ongoing_monthly_rate: 0.01,
  account_opened_on: opened,
  created_at: "",
});

const data = {
  kids: [kid("a", "2027-01-01"), kid("b", null)],
  rates: [
    { id: "1", kid_id: "a", effective_from: "2027-01-01", monthly_rate: 0.02 },
    { id: "2", kid_id: "a", effective_from: "2027-04-01", monthly_rate: 0.01 },
  ],
  transactions: [
    { id: "t1", kid_id: "a", kind: "deposit", amount_cents: 10000, occurred_on: "2027-01-01", note: null, created_at: "" },
    { id: "t2", kid_id: "b", kind: "deposit", amount_cents: 10000, occurred_on: "2027-05-01", note: null, created_at: "" },
  ],
} as unknown as FamilyData;

describe("forecastLiability", () => {
  it("grows each balance at the kid's rates with no new money", () => {
    const [a, b] = forecastLiability(data, "2027-06-15");
    expect(a.nowCents).toBeGreaterThan(10000);
    expect(a.futureCents[0]).toBeGreaterThan(a.nowCents);
    expect(a.futureCents[2]).toBeGreaterThan(a.futureCents[1]);
    // Unopened: treated as opening today with its starting rates.
    expect(b.nowCents).toBe(10000);
    expect(b.futureCents[0]).toBeGreaterThan(11268); // > 1 year at 1% thanks to the 2% start
  });
});
