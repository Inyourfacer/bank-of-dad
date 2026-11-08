import { describe, expect, it } from "vitest";
import { displayLogin, loginEmail } from "./login";

describe("login", () => {
  it("turns a username into the login Supabase stores", () => {
    expect(loginEmail(" Dad ")).toBe("dad@bankofdad.local");
    expect(loginEmail("Mom@Example.com")).toBe("mom@example.com");
  });
  it("shows usernames without the made-up domain", () => {
    expect(displayLogin("dad@bankofdad.local")).toBe("dad");
    expect(displayLogin("mom@example.com")).toBe("mom@example.com");
  });
});
