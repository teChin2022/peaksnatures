import { describe, expect, it } from "vitest";
import { lapsedTermInvoice } from "./lapsed";
import { cronBillingDates } from "./dates";
import { makeBillingConfig } from "../../../../../test/fixtures/db";

const CONFIG = makeBillingConfig({ fixed_rate_amount: 1500 });
const host = (fixed_rate_term_ends_at: string | null, fixed_rate_override: number | null = null) => ({
  fixed_rate_term_ends_at,
  fixed_rate_override,
});

/** The cron's 07:00 Bangkok run on the given Bangkok date. */
const runOn = (day: string) => cronBillingDates(new Date(`${day}T00:00:00Z`));

describe("lapsedTermInvoice", () => {
  it("bills the month on the 1st, due the 5th — what the old 1st-only run did", () => {
    expect(lapsedTermInvoice(host("2026-09-30"), false, CONFIG, runOn("2026-10-01"))).toMatchObject({
      amount: 1500,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      term_months: 1,
      due_date: "2026-10-05",
    });
  });

  // The free month this exists to close: September's invoice was overdue on
  // 1 Oct, so that run skipped them; they paid it on 2 Oct, and nothing billed
  // October until the 1 Nov run billed November.
  it("bills a late payer the whole current month the morning after they settle", () => {
    expect(lapsedTermInvoice(host("2026-09-30"), false, CONFIG, runOn("2026-10-03"))).toMatchObject({
      amount: 1500,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      due_date: "2026-10-08",
    });
  });

  it("charges the full month even on the last day of it — never a prorated stub", () => {
    expect(lapsedTermInvoice(host("2026-09-30"), false, CONFIG, runOn("2026-10-31"))).toMatchObject({
      amount: 1500,
      stub_amount: 0,
      period_start: "2026-10-01",
    });
  });

  it("catches up a month whose 1st-of-month run never happened", () => {
    expect(lapsedTermInvoice(host("2026-09-30"), false, CONFIG, runOn("2026-10-02"))).toMatchObject({
      period_start: "2026-10-01",
      amount: 1500,
    });
  });

  it("bills a host who never had a term", () => {
    expect(lapsedTermInvoice(host(null), false, CONFIG, runOn("2026-10-14"))).toMatchObject({
      period_start: "2026-10-01",
      period_end: "2026-10-31",
    });
  });

  it("bills a term that ended mid-month from the day after, never twice", () => {
    expect(lapsedTermInvoice(host("2026-10-12"), false, CONFIG, runOn("2026-10-14"))).toMatchObject({
      period_start: "2026-10-13",
      period_end: "2026-10-31",
      amount: 919, // 19 of 31 days
    });
  });

  it("prices off the host's own rate override", () => {
    expect(lapsedTermInvoice(host("2026-09-30", 900), false, CONFIG, runOn("2026-10-01"))).toMatchObject({
      amount: 900,
    });
  });

  describe("skips", () => {
    it("a host mid-term, who already paid up front", () => {
      expect(lapsedTermInvoice(host("2026-12-31"), false, CONFIG, runOn("2026-10-03"))).toBeNull();
    });

    it("a host on the last day of their term, which is still theirs", () => {
      expect(lapsedTermInvoice(host("2026-10-31"), false, CONFIG, runOn("2026-10-31"))).toBeNull();
    });

    // That invoice already blocks them; a second would only stack debt.
    it("a host who still owes an invoice", () => {
      expect(lapsedTermInvoice(host("2026-09-30"), true, CONFIG, runOn("2026-10-03"))).toBeNull();
    });
  });
});
