import { describe, expect, it } from "vitest";
import { LESSONS, type LessonContext, hasRateChange, rateAnnouncements } from "./lessons";
import type { RatePeriodRow } from "../data/types";

const base: LessonContext = {
  name: "Ava",
  today: "2027-06-10",
  rate: 0.01,
  paydays: 0,
  interestPaidCents: 0,
  firstPaydayCents: null,
  hasPayStub: false,
  taxCents: 0,
  billsCents: 0,
  hasJarMoney: false,
  hasGoal: false,
  hasCd: false,
  hasLoan: false,
  rateChanged: false,
};
const unlocked = (c: LessonContext) => LESSONS.filter((l) => l.unlocked(c)).map((l) => l.id);

describe("lessons", () => {
  it("start locked", () => {
    expect(unlocked(base)).toEqual([]);
  });

  it("unlock as things happen", () => {
    expect(unlocked({ ...base, paydays: 1, firstPaydayCents: 110 })).toEqual(["interest"]);
    expect(unlocked({ ...base, paydays: 3, interestPaidCents: 150 })).toEqual(["interest", "compound", "rule-of-72"]);
    expect(unlocked({ ...base, hasPayStub: true })).toEqual(["taxes", "needs-wants"]);
    expect(unlocked({ ...base, hasCd: true, hasLoan: true })).toEqual(["cds", "loans"]);
  });

  it("use the kid's own numbers", () => {
    const interest = LESSONS.find((l) => l.id === "interest")!.body({ ...base, paydays: 1, firstPaydayCents: 110 });
    expect(interest.join(" ")).toContain("$1.10");
    const compound = LESSONS.find((l) => l.id === "compound")!.body(base).join(" ");
    // $100 for 5 years at 1%: simple $160.00, compound $181.67.
    expect(compound).toContain("$160.00");
    expect(compound).toContain("$181.67");
    const rule = LESSONS.find((l) => l.id === "rule-of-72")!.body(base).join(" ");
    expect(rule).toContain("12.7% a year");
    expect(rule).toContain("5.7 years"); // 72 ÷ 12.7
    expect(rule).toContain("5.8 years"); // exact
  });

  it("every lesson has a title, a hint and text", () => {
    for (const l of LESSONS) {
      expect(l.title.length).toBeGreaterThan(0);
      expect(l.unlockHint).toMatch(/^Unlocks/);
      expect(l.body({ ...base, hasPayStub: true, taxCents: 1680, billsCents: 7600 }).length).toBeGreaterThan(1);
    }
  });
});

const r = (effective_from: string, monthly_rate: number, message: string | null = null): RatePeriodRow => ({
  id: effective_from,
  kid_id: "k",
  effective_from,
  monthly_rate,
  message,
});

describe("rate announcements", () => {
  const opening = [r("2027-01-01", 0.02), r("2027-04-01", 0.01)];

  it("announce a scheduled change, and for two weeks after it starts", () => {
    const rates = [...opening, r("2027-07-01", 0.015, "Great saving!")];
    expect(rateAnnouncements(rates, "2027-01-01", "2027-06-10")).toMatchObject([{ fromRate: 0.01, upcoming: true }]);
    expect(rateAnnouncements(rates, "2027-01-01", "2027-07-10")).toMatchObject([{ upcoming: false }]);
    expect(rateAnnouncements(rates, "2027-01-01", "2027-07-20")).toEqual([]);
  });

  it("mentions the end of the starter rate when it happens", () => {
    expect(rateAnnouncements(opening, "2027-01-01", "2027-04-05")).toMatchObject([{ fromRate: 0.02, upcoming: false }]);
    expect(rateAnnouncements(opening, "2027-01-01", "2027-03-20")).toMatchObject([{ upcoming: true }]);
  });

  it("knows when a kid has seen a rate change", () => {
    expect(hasRateChange(opening, "2027-01-01", "2027-03-01")).toBe(false);
    expect(hasRateChange(opening, "2027-01-01", "2027-04-01")).toBe(true);
    expect(hasRateChange([r("2027-01-01", 0.01), r("2027-09-01", 0.02, "Up!")], "2027-01-01", "2027-02-01")).toBe(true);
    expect(hasRateChange(opening, null, "2027-06-01")).toBe(false);
  });
});
