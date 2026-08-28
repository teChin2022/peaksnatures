import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOW_WALLET_THRESHOLD,
  blockingInvoiceFilter,
  computeFixedRateInvoice,
  getEffectiveCommissionPct,
  getEffectiveFixedRate,
  getFixedRateDiscount,
  isValidTermMonths,
  utcToday,
} from "@/lib/billing";
import { makeBillingConfig } from "../../test/fixtures/db";

/** period_start is serialised via toISOString(), so build start dates in UTC. */
const utc = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

afterEach(() => {
  vi.useRealTimers();
});

describe("getEffectiveCommissionPct", () => {
  it("uses the platform rate when the host has no override", () => {
    const config = makeBillingConfig({ commission_pct: 12 });
    expect(getEffectiveCommissionPct({ commission_pct_override: null }, config)).toBe(12);
  });

  it("prefers the host's override", () => {
    const config = makeBillingConfig({ commission_pct: 12 });
    expect(getEffectiveCommissionPct({ commission_pct_override: 5 }, config)).toBe(5);
  });

  // KNOWN GAP: the fallback is `||`, not `??`, so a deliberate zero-commission
  // override is indistinguishable from "not set" and silently bills the host the
  // platform rate. Pinned deliberately — flagged for review.
  it("ignores a zero override and charges the platform rate instead", () => {
    const config = makeBillingConfig({ commission_pct: 12 });
    expect(getEffectiveCommissionPct({ commission_pct_override: 0 }, config)).toBe(12);
  });
});

describe("getEffectiveFixedRate", () => {
  it("uses the platform rate when the host has no override", () => {
    const config = makeBillingConfig({ fixed_rate_amount: 1500 });
    expect(getEffectiveFixedRate({ fixed_rate_override: null }, config)).toBe(1500);
  });

  it("prefers the host's override", () => {
    const config = makeBillingConfig({ fixed_rate_amount: 1500 });
    expect(getEffectiveFixedRate({ fixed_rate_override: 900 }, config)).toBe(900);
  });

  // KNOWN GAP: same `||` fallback as getEffectiveCommissionPct — a free fixed-rate
  // host cannot be expressed as an override of 0.
  it("ignores a zero override and charges the platform rate instead", () => {
    const config = makeBillingConfig({ fixed_rate_amount: 1500 });
    expect(getEffectiveFixedRate({ fixed_rate_override: 0 }, config)).toBe(1500);
  });
});

describe("getFixedRateDiscount", () => {
  const config = makeBillingConfig();

  it("finds the discount for a configured term", () => {
    expect(getFixedRateDiscount(1, config)).toBe(0);
    expect(getFixedRateDiscount(6, config)).toBe(10);
    expect(getFixedRateDiscount(12, config)).toBe(20);
  });

  it("returns no discount for a term that is not offered", () => {
    expect(getFixedRateDiscount(3, config)).toBe(0);
    expect(getFixedRateDiscount(0, config)).toBe(0);
  });

  it("compares terms numerically, so a string month still matches", () => {
    const stringy = makeBillingConfig({
      fixed_rate_term_tiers: [{ months: "12", discount_pct: "25" }] as never,
    });
    expect(getFixedRateDiscount(12, stringy)).toBe(25);
  });

  it("returns no discount when the tier list is missing or malformed", () => {
    expect(getFixedRateDiscount(12, makeBillingConfig({ fixed_rate_term_tiers: [] }))).toBe(0);
    expect(getFixedRateDiscount(12, makeBillingConfig({ fixed_rate_term_tiers: null as never }))).toBe(0);
  });
});

describe("isValidTermMonths", () => {
  const config = makeBillingConfig();

  it("accepts every offered term", () => {
    expect(isValidTermMonths(1, config)).toBe(true);
    expect(isValidTermMonths(12, config)).toBe(true);
  });

  it("rejects a term that is not offered", () => {
    for (const months of [0, 3, 24, -1]) {
      expect(isValidTermMonths(months, config)).toBe(false);
    }
  });

  it("rejects everything when no terms are configured", () => {
    expect(isValidTermMonths(12, makeBillingConfig({ fixed_rate_term_tiers: null as never }))).toBe(false);
  });
});

describe("computeFixedRateInvoice", () => {
  const host = { fixed_rate_override: null };

  it("bills the monthly rate times the term, less the term discount", () => {
    const config = makeBillingConfig({ fixed_rate_amount: 1000 });
    expect(computeFixedRateInvoice(host, config, 12, utc(2026, 1, 1))).toEqual({
      amount: 9600, // 1000 × 12 × 0.80
      period_start: "2026-01-01",
      period_end: "2026-12-31",
      term_months: 12,
      discount_pct: 20,
    });
  });

  it("bills a single month at full price", () => {
    const config = makeBillingConfig({ fixed_rate_amount: 1000 });
    expect(computeFixedRateInvoice(host, config, 1, utc(2026, 1, 1))).toMatchObject({
      amount: 1000,
      period_start: "2026-01-01",
      period_end: "2026-01-31",
      discount_pct: 0,
    });
  });

  it("uses the host's own rate when one is set", () => {
    const config = makeBillingConfig({ fixed_rate_amount: 1000 });
    expect(computeFixedRateInvoice({ fixed_rate_override: 500 }, config, 6, utc(2026, 1, 1)).amount).toBe(
      2700, // 500 × 6 × 0.90
    );
  });

  it("rounds the amount to the nearest baht", () => {
    const config = makeBillingConfig({
      fixed_rate_amount: 999,
      fixed_rate_term_tiers: [{ months: 1, discount_pct: 33 }],
    });
    expect(computeFixedRateInvoice(host, config, 1, utc(2026, 1, 1)).amount).toBe(669); // 669.33
  });

  it("bills nothing at a 100% discount", () => {
    const config = makeBillingConfig({
      fixed_rate_amount: 1000,
      fixed_rate_term_tiers: [{ months: 3, discount_pct: 100 }],
    });
    expect(computeFixedRateInvoice(host, config, 3, utc(2026, 1, 1)).amount).toBe(0);
  });

  describe("period_end lands on the last day of the final month", () => {
    const config = makeBillingConfig({ fixed_rate_amount: 1000 });
    const endFor = (months: number, start: Date) =>
      computeFixedRateInvoice(host, config, months, start).period_end;

    it("handles a 30-day and a 31-day month", () => {
      expect(endFor(1, utc(2026, 4, 1))).toBe("2026-04-30");
      expect(endFor(1, utc(2026, 5, 1))).toBe("2026-05-31");
    });

    it("handles February in a common and a leap year", () => {
      expect(endFor(1, utc(2026, 2, 1))).toBe("2026-02-28");
      expect(endFor(1, utc(2028, 2, 1))).toBe("2028-02-29");
    });

    it("crosses a year boundary", () => {
      expect(endFor(3, utc(2026, 11, 1))).toBe("2027-01-31");
      expect(endFor(12, utc(2026, 7, 15))).toBe("2027-06-30");
    });

    it("keeps a mid-month start date as the period start", () => {
      expect(computeFixedRateInvoice(host, config, 1, utc(2026, 3, 15))).toMatchObject({
        period_start: "2026-03-15",
        period_end: "2026-03-31",
      });
    });
  });
});

describe("utcToday", () => {
  it("returns today's UTC date as YYYY-MM-DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00Z"));
    expect(utcToday()).toBe("2026-06-15");
  });

  it("reports the UTC day even when the local day has already rolled over", () => {
    vi.useFakeTimers();
    // 06:00 on the 16th in Bangkok is still 23:00 on the 15th in UTC.
    vi.setSystemTime(new Date("2026-06-15T23:00:00Z"));
    expect(utcToday()).toBe("2026-06-15");
  });
});

describe("blockingInvoiceFilter", () => {
  it("matches overdue invoices and pending ones past their due date", () => {
    expect(blockingInvoiceFilter("2026-06-15")).toBe(
      "status.eq.overdue,and(status.eq.pending,due_date.lt.2026-06-15)",
    );
  });

  it("uses a strict less-than, so an invoice due today does not block yet", () => {
    expect(blockingInvoiceFilter("2026-06-15")).toContain("due_date.lt.");
    expect(blockingInvoiceFilter("2026-06-15")).not.toContain("due_date.lte.");
  });

  it("defaults to today in UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00Z"));
    expect(blockingInvoiceFilter()).toContain("2026-06-15");
  });
});

describe("LOW_WALLET_THRESHOLD", () => {
  it("warns commission hosts while the balance is still positive", () => {
    expect(LOW_WALLET_THRESHOLD).toBe(300);
    expect(LOW_WALLET_THRESHOLD).toBeGreaterThan(0);
  });
});
