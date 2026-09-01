import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GRACE_PERIOD_DAYS, getPlanExpiryInfo, isHostBlocked } from "@/lib/plan-expiry";

const NOW = new Date("2026-06-10T12:00:00Z");
/** An expiry `days` before NOW, so daysSinceExpiry lands exactly on `days`. */
const expiryDaysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("getPlanExpiryInfo", () => {
  it("reports active for any plan that is not free", () => {
    for (const plan of ["commission", "fixed_rate", "enterprise"]) {
      expect(getPlanExpiryInfo(plan, expiryDaysAgo(30))).toEqual({
        phase: "active",
        daysSinceExpiry: null,
        graceDaysRemaining: null,
      });
    }
  });

  it("reports active for a free plan with no expiry set", () => {
    expect(getPlanExpiryInfo("free", null)).toEqual({
      phase: "active",
      daysSinceExpiry: null,
      graceDaysRemaining: null,
    });
  });

  it("counts down while the plan is still live", () => {
    expect(getPlanExpiryInfo("free", expiryDaysAgo(-10))).toEqual({
      phase: "active",
      daysSinceExpiry: -10,
      graceDaysRemaining: null,
    });
  });

  it("stays active for the whole of the expiry day itself", () => {
    // Day 0 is the last free day, not the first grace day — the same reading
    // every other end date on the platform gets.
    expect(getPlanExpiryInfo("free", expiryDaysAgo(0))).toEqual({
      phase: "active",
      daysSinceExpiry: 0,
      graceDaysRemaining: null,
    });
  });

  it("enters grace the day after expiry", () => {
    expect(getPlanExpiryInfo("free", expiryDaysAgo(1))).toEqual({
      phase: "grace",
      daysSinceExpiry: 1,
      graceDaysRemaining: GRACE_PERIOD_DAYS - 1,
    });
  });

  it("burns down the grace period day by day", () => {
    expect(getPlanExpiryInfo("free", expiryDaysAgo(3))).toEqual({
      phase: "grace",
      daysSinceExpiry: 3,
      graceDaysRemaining: 4,
    });
  });

  it("keeps the day-5 SMS honest — two days left when it is sent", () => {
    // The cron tells the host "bookings pause in 2 days" on day 5.
    expect(getPlanExpiryInfo("free", expiryDaysAgo(5)).graceDaysRemaining).toBe(2);
    expect(getPlanExpiryInfo("free", expiryDaysAgo(7)).phase).toBe("blocked");
  });

  it("stays in grace on the last day and blocks on the seventh", () => {
    expect(getPlanExpiryInfo("free", expiryDaysAgo(6))).toMatchObject({
      phase: "grace",
      graceDaysRemaining: 1,
    });
    expect(getPlanExpiryInfo("free", expiryDaysAgo(7))).toEqual({
      phase: "blocked",
      daysSinceExpiry: 7,
      graceDaysRemaining: 0,
    });
  });

  it("stays blocked long after expiry", () => {
    expect(getPlanExpiryInfo("free", expiryDaysAgo(400))).toMatchObject({ phase: "blocked" });
  });

  it("falls back to blocked on an unparseable expiry instead of throwing", () => {
    // billingToday() raises RangeError on an invalid Date, and this function
    // gates the booking routes.
    expect(getPlanExpiryInfo("free", "not-a-date")).toEqual({
      phase: "blocked",
      daysSinceExpiry: null,
      graceDaysRemaining: 0,
    });
  });
});

describe("getPlanExpiryInfo across the Bangkok day boundary", () => {
  /** What Postgres stores for a bare '2026-08-31' — 07:00 in Bangkok. */
  const EXPIRES = "2026-08-31T00:00:00Z";
  const at = (iso: string) => getPlanExpiryInfo("free", EXPIRES, new Date(iso)).phase;

  it("no longer expires the host mid-morning on their last free day", () => {
    // 08:00 on 31 Aug in Bangkok. Comparing instants put them in grace here.
    expect(at("2026-08-31T01:00:00Z")).toBe("active");
    // 23:00 on 31 Aug in Bangkok — still their day.
    expect(at("2026-08-31T16:00:00Z")).toBe("active");
  });

  it("turns over at Bangkok midnight", () => {
    expect(at("2026-08-31T16:59:59Z")).toBe("active");
    // 00:00 on 1 Sep in Bangkok.
    expect(at("2026-08-31T17:00:00Z")).toBe("grace");
  });

  it("blocks from the start of day 7, not seven hours into it", () => {
    // 23:00 on 6 Sep in Bangkok.
    expect(at("2026-09-06T16:00:00Z")).toBe("grace");
    // 00:00 on 7 Sep in Bangkok.
    expect(at("2026-09-06T17:00:00Z")).toBe("blocked");
  });

  it("counts the free day and the grace days the header promises", () => {
    const days = (iso: string) =>
      getPlanExpiryInfo("free", EXPIRES, new Date(iso)).daysSinceExpiry;
    expect(days("2026-08-31T16:00:00Z")).toBe(0); // last free day
    expect(days("2026-09-01T05:00:00Z")).toBe(1); // first grace day
    expect(days("2026-09-06T05:00:00Z")).toBe(6); // last grace day
  });
});

describe("isHostBlocked", () => {
  it("blocks a free host only once the grace period is spent", () => {
    expect(isHostBlocked({ plan_type: "free", plan_free_expires_at: expiryDaysAgo(6) })).toBe(false);
    expect(isHostBlocked({ plan_type: "free", plan_free_expires_at: expiryDaysAgo(7) })).toBe(true);
  });

  it("never blocks a free host with no expiry set", () => {
    expect(isHostBlocked({ plan_type: "free", plan_free_expires_at: null })).toBe(false);
  });

  it("blocks a fixed-rate host on a past-due invoice, with no grace", () => {
    const base = { plan_type: "fixed_rate", plan_free_expires_at: null };
    expect(isHostBlocked({ ...base, has_past_due_invoice: true })).toBe(true);
    expect(isHostBlocked({ ...base, has_past_due_invoice: false })).toBe(false);
    expect(isHostBlocked(base)).toBe(false); // undefined is not blocked
  });

  describe("commission hosts", () => {
    const base = {
      plan_type: "commission",
      plan_free_expires_at: null,
      wallet_balance: -500,
      wallet_credit_limit: 100,
      wallet_negative_since: expiryDaysAgo(30),
    };

    it("blocks when the wallet has been past its credit limit for over the grace period", () => {
      expect(isHostBlocked(base)).toBe(true);
    });

    it("does not block while the wallet has never gone negative", () => {
      expect(isHostBlocked({ ...base, wallet_negative_since: null })).toBe(false);
      expect(isHostBlocked({ ...base, wallet_negative_since: undefined })).toBe(false);
    });

    it("does not block while the balance is still inside the credit limit", () => {
      expect(isHostBlocked({ ...base, wallet_balance: -50, wallet_credit_limit: 100 })).toBe(false);
      // Exactly at the limit is still inside it.
      expect(isHostBlocked({ ...base, wallet_balance: -100, wallet_credit_limit: 100 })).toBe(false);
    });

    it("treats a missing credit limit as zero credit", () => {
      expect(isHostBlocked({ ...base, wallet_balance: -1, wallet_credit_limit: null })).toBe(true);
      expect(isHostBlocked({ ...base, wallet_balance: 0, wallet_credit_limit: null })).toBe(false);
    });

    it("defaults a missing balance to zero, which is never past the limit", () => {
      expect(isHostBlocked({ ...base, wallet_balance: undefined })).toBe(false);
    });

    // NOTE: free plans block at `daysSinceExpiry >= 7` but commission hosts at
    // `daysNegative > 7`, so a commission host gets one extra day. Pinned here
    // deliberately — the asymmetry is flagged for review, not assumed correct.
    it("gives commission hosts a day more than the free-plan boundary", () => {
      expect(isHostBlocked({ ...base, wallet_negative_since: expiryDaysAgo(7) })).toBe(false);
      expect(isHostBlocked({ ...base, wallet_negative_since: expiryDaysAgo(8) })).toBe(true);
    });
  });

  it("never blocks a host on an unrecognised plan", () => {
    expect(isHostBlocked({ plan_type: "enterprise", plan_free_expires_at: expiryDaysAgo(400) })).toBe(false);
  });
});
