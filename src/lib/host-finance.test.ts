import { describe, expect, it } from "vitest";
import { MONTH_RE, monthBounds, shiftMonth, summarizeMonth } from "./host-finance";

describe("shiftMonth", () => {
  it("rolls over the year both ways", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-11", 0)).toBe("2026-11");
  });
});

describe("monthBounds", () => {
  it("is half-open and crosses into January", () => {
    expect(monthBounds("2026-12")).toEqual({
      from: "2026-12-01",
      to: "2027-01-01",
      fromTs: "2026-12-01T00:00:00+07:00",
      toTs: "2027-01-01T00:00:00+07:00",
    });
  });

  it("puts 00:30 Bangkok on the 1st in the new month, not the previous UTC one", () => {
    const paidAt = new Date("2026-11-30T17:30:00Z"); // 1 Dec 00:30 in Bangkok
    const dec = monthBounds("2026-12");
    const nov = monthBounds("2026-11");
    expect(paidAt >= new Date(dec.fromTs) && paidAt < new Date(dec.toTs)).toBe(true);
    expect(paidAt < new Date(nov.toTs)).toBe(false);
  });
});

describe("MONTH_RE", () => {
  it("accepts YYYY-MM only", () => {
    expect(MONTH_RE.test("2026-11")).toBe(true);
    for (const bad of ["2026-13", "2026-00", "2026-1", "2026-11-01", "", "abcd-ef"]) {
      expect(MONTH_RE.test(bad)).toBe(false);
    }
  });
});

describe("summarizeMonth", () => {
  it("subtracts platform charges and expenses from income", () => {
    const s = summarizeMonth({
      bookings: [{ total_price: 30000 }, { total_price: 18500 }],
      walletRows: [
        { amount: -1800, type: "commission" },
        { amount: -1110, type: "commission" },
      ],
      invoices: [],
      expenses: [
        { category: "utilities", amount: 3200 },
        { category: "wages", amount: 4000 },
        { category: "wages", amount: 2000 },
      ],
    });
    expect(s).toEqual({
      revenue: 48500,
      commission: 2910,
      planFees: 0,
      aiFees: 0,
      totalExpenses: 9200,
      net: 36390,
    });
  });

  it("counts guest AI charges as a platform fee of their own, not as commission (086)", () => {
    const s = summarizeMonth({
      bookings: [{ total_price: 10000 }],
      walletRows: [
        { amount: -600, type: "commission" },
        { amount: -3, type: "ai_usage" },
        { amount: -2, type: "ai_usage" },
      ],
      invoices: [],
      expenses: [],
    });
    expect(s.commission).toBe(600);
    expect(s.aiFees).toBe(5);
    expect(s.net).toBe(9395);
  });

  it("lets a refund lower the commission", () => {
    const s = summarizeMonth({
      bookings: [],
      walletRows: [
        { amount: -600, type: "commission" },
        { amount: 200, type: "refund" },
      ],
      invoices: [],
      expenses: [],
    });
    expect(s.commission).toBe(400);
    expect(s.net).toBe(-400);
  });

  it("counts paid plan invoices as charges", () => {
    const s = summarizeMonth({ bookings: [{ total_price: 5000 }], walletRows: [], invoices: [{ amount: 990 }], expenses: [] });
    expect(s.planFees).toBe(990);
    expect(s.net).toBe(4010);
  });

  it("keeps satang exact and never returns -0", () => {
    const s = summarizeMonth({
      bookings: [],
      walletRows: [],
      invoices: [],
      expenses: [{ category: "other", amount: 0.1 }, { category: "other", amount: 0.2 }],
    });
    expect(s.totalExpenses).toBe(0.3);
    expect(Object.is(s.commission, -0)).toBe(false);
  });

  it("reads numeric columns that arrive as strings", () => {
    const s = summarizeMonth({
      bookings: [{ total_price: "1000" as unknown as number }],
      walletRows: [],
      invoices: [],
      expenses: [{ category: "laundry", amount: "250.50" as unknown as number }],
    });
    expect(s.net).toBe(749.5);
  });
});
