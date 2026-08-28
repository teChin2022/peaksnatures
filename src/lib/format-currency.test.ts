import { describe, expect, it } from "vitest";
import { fmtTHB } from "@/lib/format-currency";

describe("fmtTHB", () => {
  it("prefixes the baht sign and groups thousands", () => {
    expect(fmtTHB(1234)).toBe("฿1,234");
    expect(fmtTHB(1234567)).toBe("฿1,234,567");
  });

  it("formats small and zero amounts without grouping", () => {
    expect(fmtTHB(0)).toBe("฿0");
    expect(fmtTHB(999)).toBe("฿999");
  });

  it("keeps a fractional part when there is one", () => {
    expect(fmtTHB(1234.5)).toBe("฿1,234.5");
  });

  it("puts the sign after the baht symbol for a negative amount", () => {
    expect(fmtTHB(-500)).toBe("฿-500");
  });
});
