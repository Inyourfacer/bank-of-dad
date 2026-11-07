import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysInMonth, endOfMonth, firstOfNextMonth, isLastDayOfMonth, toDayNumber, fromDayNumber } from "./dates";

describe("dates", () => {
  it("round-trips day numbers", () => {
    expect(fromDayNumber(toDayNumber("2027-03-14"))).toBe("2027-03-14");
    expect(addDays("2027-12-31", 1)).toBe("2028-01-01");
  });

  it("knows month lengths, including leap years", () => {
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 4)).toBe(30);
    expect(daysInMonth(2027, 12)).toBe(31);
  });

  it("adds months, clamping to shorter months", () => {
    expect(addMonths("2027-01-15", 3)).toBe("2027-04-15");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2027-11-15", 3)).toBe("2028-02-15");
    expect(addMonths("2027-01-15", -1)).toBe("2026-12-15");
  });

  it("finds month ends", () => {
    expect(isLastDayOfMonth("2028-02-29")).toBe(true);
    expect(isLastDayOfMonth("2027-02-27")).toBe(false);
    expect(endOfMonth("2027-04-09")).toBe("2027-04-30");
    expect(firstOfNextMonth("2027-12-09")).toBe("2028-01-01");
  });
});
