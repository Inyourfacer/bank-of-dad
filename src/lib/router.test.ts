import { describe, expect, it } from "vitest";
import { match } from "./router";

describe("match", () => {
  it("extracts params", () => {
    expect(match("/family/kid/:id", "/family/kid/abc-123")).toEqual({ id: "abc-123" });
    expect(match("/family", "/family")).toEqual({});
    expect(match("/family/kid/:id", "/family")).toBeNull();
    expect(match("/family", "/simulator")).toBeNull();
  });
});
