import { describe, expect, it } from "vitest";
import { dollarsToCents, formatCents, formatDuration, formatPercent, percentToFraction } from "./format";

describe("format", () => {
  it("formats money and percents", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatPercent(0.02)).toBe("2%");
    expect(formatPercent(0.126825, 1)).toBe("12.7%");
  });

  it("formats durations", () => {
    expect(formatDuration(8)).toBe("8 months");
    expect(formatDuration(12)).toBe("1 year");
    expect(formatDuration(27)).toBe("2 years 3 months");
  });

  it("parses user input safely", () => {
    expect(dollarsToCents("$1,250.50")).toBe(125050);
    expect(dollarsToCents("abc")).toBe(0);
    expect(dollarsToCents("-5")).toBe(0);
    expect(percentToFraction("1.5")).toBe(0.015);
  });
});
