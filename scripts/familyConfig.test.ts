import { describe, expect, it } from "vitest";
import { ConfigError, parseFamilyConfig } from "./familyConfig";

const sample = `
family: The Smiths
time_zone: America/Chicago
parents:
  - { name: Dad, username: dad, password: "correct horse" }
  - { name: Mom, username: Mom, password: "battery staple" }
tablet: { username: kids-tablet, password: "tablet-pass-1" }
kids:
  - { name: Ava, pin: "4821", picture: 🦊, view: standard }
  - name: Cora
    pin: 0427
    view: junior
    starter_rate: 3%
    starter_months: 2
    rate: 1.5%
`;

describe("parseFamilyConfig", () => {
  it("reads a full config", () => {
    const c = parseFamilyConfig(sample);
    expect(c.family).toEqual({ name: "The Smiths", time_zone: "America/Chicago" });
    expect(c.parents.map((p) => p.email)).toEqual(["dad@bankofdad.local", "mom@bankofdad.local"]);
    expect(c.tablet).toMatchObject({ name: "Kids tablet", email: "kids-tablet@bankofdad.local" });
    expect(c.kids[0]).toMatchObject({ name: "Ava", pin: "4821", avatar: "🦊", mode: "standard" });
    expect(c.kids[1]).toMatchObject({ name: "Cora", pin: "0427", mode: "junior", intro_months: 2 });
    expect(c.kids[1].intro_monthly_rate).toBeCloseTo(0.03);
    expect(c.kids[1].ongoing_monthly_rate).toBeCloseTo(0.015);
  });

  it("accepts a real email instead of a username", () => {
    const c = parseFamilyConfig(`family: X\nparents:\n  - { name: Dad, username: dad@example.com, password: "12345678" }`);
    expect(c.parents[0].email).toBe("dad@example.com");
    expect(c.family.time_zone).toBe("UTC");
    expect(c.kids).toEqual([]);
  });

  const bad: [string, string, RegExp][] = [
    ["empty", "", /empty/],
    ["broken YAML", "family: X\n  parents: [", /valid YAML/],
    ["no family", "parents: []", /family name/],
    ["no parents", "family: X", /at least one parent/],
    ["short password", `family: X\nparents:\n  - { name: Dad, username: dad, password: short }`, /at least 8/],
    ["bad username", `family: X\nparents:\n  - { name: Dad, username: "d a d", password: "12345678" }`, /letters, numbers/],
    ["duplicate login", `family: X\nparents:\n  - { name: Dad, username: dad, password: "12345678" }\n  - { name: Mom, username: dad, password: "12345678" }`, /Two logins/],
    ["bad PIN", `family: X\nparents:\n  - { name: Dad, username: dad, password: "12345678" }\nkids:\n  - { name: Ava, pin: "12a4" }`, /4 digits/],
    ["bad view", `family: X\nparents:\n  - { name: Dad, username: dad, password: "12345678" }\nkids:\n  - { name: Ava, view: teen }`, /junior or standard/],
    ["rate too high", `family: X\nparents:\n  - { name: Dad, username: dad, password: "12345678" }\nkids:\n  - { name: Ava, rate: 25% }`, /20%/],
    ["bad time zone", `family: X\ntime_zone: Mars/Base\nparents:\n  - { name: Dad, username: dad, password: "12345678" }`, /time zone/],
    ["duplicate kid", `family: X\nparents:\n  - { name: Dad, username: dad, password: "12345678" }\nkids:\n  - { name: Ava }\n  - { name: ava }`, /Two kids/],
  ];
  it.each(bad)("explains a problem: %s", (_label, text, message) => {
    expect(() => parseFamilyConfig(text)).toThrow(ConfigError);
    expect(() => parseFamilyConfig(text)).toThrow(message);
  });

  it("never puts secrets in error messages", () => {
    try {
      parseFamilyConfig(`family: X\nparents:\n  - { name: Dad, username: dad, password: "sekrit" }`);
    } catch (e) {
      expect(String(e)).not.toContain("sekrit");
    }
  });
});
