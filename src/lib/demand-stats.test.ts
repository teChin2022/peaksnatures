import { describe, expect, it } from "vitest";
import { parseDemandDays } from "@/lib/demand-stats";

describe("parseDemandDays", () => {
  it("accepts the two supported non-default windows", () => {
    expect(parseDemandDays("7")).toBe(7);
    expect(parseDemandDays("90")).toBe(90);
  });

  it("falls back to 30 days for anything else", () => {
    for (const value of ["30", "1", "365", "0", "-7", "abc", "", "7.5"]) {
      expect(parseDemandDays(value)).toBe(30);
    }
  });

  it("falls back to 30 days when the parameter is absent", () => {
    expect(parseDemandDays(null)).toBe(30);
  });
});
