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

  it("enters grace on the day of expiry with the full period remaining", () => {
    expect(getPlanExpiryInfo("free", expiryDaysAgo(0))).toEqual({
      phase: "grace",
      daysSinceExpiry: 0,
      graceDaysRemaining: GRACE_PERIOD_DAYS,
    });
  });

  it("burns down the grace period day by day", () => {
    expect(getPlanExpiryInfo("free", expiryDaysAgo(3))).toEqual({
      phase: "grace",
      daysSinceExpiry: 3,
      graceDaysRemaining: 4,
    });
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
