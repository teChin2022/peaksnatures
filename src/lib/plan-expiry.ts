/**
 * Host block / plan expiry utilities.
 *
 * Free plan timeline. Every boundary is a Bangkok calendar day, and Day 0 is
 * plan_free_expires_at itself:
 *   Day -3 .............. SMS warning
 *   Day  0 .............. Last free day — the plan expires at the end of it
 *   Day +1 to +6 ........ Grace period (host can still operate, banner shown)
 *   Day +5 .............. SMS reminder ("bookings pause in 2 days")
 *   Day +7 onwards ...... Soft-blocked (new bookings blocked, upgrade required)
 *
 * The old comment said grace ran to Day +7 while also blocking from Day +7. The
 * cron's Day +5 SMS promises bookings pause in two days, which settles it at
 * Day +7 — so graceDaysRemaining reads 2 on Day +5, and the message is true.
 *
 * Fixed-rate hosts get no grace: they are blocked the day after an unpaid
 * invoice passes its due_date. Monthly invoices are generated on the 1st with
 * due_date = the 5th, so a host who hasn't paid by the 5th stops taking new
 * bookings on the 6th. GRACE_PERIOD_DAYS does not apply to this plan.
 *
 * Commission hosts are blocked when wallet has been negative (and below the
 * per-host credit limit) for more than GRACE_PERIOD_DAYS. They are warned by
 * SMS/LINE once the balance dips below LOW_WALLET_THRESHOLD, before it goes
 * negative at all.
 */

import { billingToday } from "@/lib/billing-dates";

export type PlanPhase = "active" | "grace" | "blocked";

export const GRACE_PERIOD_DAYS = 7;

export interface PlanExpiryInfo {
  phase: PlanPhase;
  /** Days since expiry (negative = days until expiry). null if no expiry set. */
  daysSinceExpiry: number | null;
  /** Days remaining in grace period. 0 if blocked. null if active/no expiry. */
  graceDaysRemaining: number | null;
}

/**
 * Full state needed to determine whether a host is blocked.
 * For free-plan hosts only plan_type + plan_free_expires_at are needed; other
 * fields are ignored. Fixed-rate needs has_past_due_invoice. Commission needs
 * the wallet fields.
 */
export interface HostBlockState {
  plan_type: string;
  plan_free_expires_at: string | null;
  has_past_due_invoice?: boolean;
  wallet_balance?: number;
  wallet_credit_limit?: number | null;
  wallet_negative_since?: string | null;
}

/**
 * Determine the free-plan expiry phase for a host.
 *
 * Counts whole days on the Bangkok billing calendar rather than milliseconds
 * between instants. plan_free_expires_at is TIMESTAMPTZ, but every writer sends
 * a bare YYYY-MM-DD which Postgres stores at 00:00+00 — 07:00 in Bangkok. That
 * made a host told "free until the 31st" leave `active` at breakfast time on
 * the 31st, seventeen hours early.
 *
 * Day 0 — the expiry date itself — is a free day, matching every other end date
 * on the platform: a fixed-rate term is active on its last day, and an invoice
 * does not block until the day after its due_date.
 */
export function getPlanExpiryInfo(
  planType: string,
  planFreeExpiresAt: string | null,
  now: Date = new Date(),
): PlanExpiryInfo {
  if (planType !== "free" || !planFreeExpiresAt) {
    return { phase: "active", daysSinceExpiry: null, graceDaysRemaining: null };
  }

  const expiresAt = new Date(planFreeExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    // Unreachable from the TIMESTAMPTZ column, but this function gates six
    // booking routes and billingToday() throws a RangeError on an invalid
    // Date. Keep the outcome the millisecond arithmetic used to produce for a
    // bad value rather than 500-ing the booking path.
    return { phase: "blocked", daysSinceExpiry: null, graceDaysRemaining: 0 };
  }

  // Both anchors are UTC midnight, so the gap is an exact multiple of a day.
  const daysSinceExpiry = Math.round(
    (billingToday(now).getTime() - billingToday(expiresAt).getTime()) / 86_400_000,
  );

  if (daysSinceExpiry <= 0) {
    return { phase: "active", daysSinceExpiry, graceDaysRemaining: null };
  }

  if (daysSinceExpiry < GRACE_PERIOD_DAYS) {
    return {
      phase: "grace",
      daysSinceExpiry,
      graceDaysRemaining: GRACE_PERIOD_DAYS - daysSinceExpiry,
    };
  }

  return { phase: "blocked", daysSinceExpiry, graceDaysRemaining: 0 };
}

/**
 * Check if a host is soft-blocked from new bookings.
 * Behavior depends on plan_type:
 * - free: blocked after GRACE_PERIOD_DAYS past plan_free_expires_at
 * - fixed_rate: blocked if has_past_due_invoice is true (no grace)
 * - commission: blocked if wallet negative > GRACE_PERIOD_DAYS and balance < -credit_limit
 */
export function isHostBlocked(state: HostBlockState): boolean {
  if (state.plan_type === "free") {
    return getPlanExpiryInfo("free", state.plan_free_expires_at).phase === "blocked";
  }

  if (state.plan_type === "fixed_rate") {
    return state.has_past_due_invoice === true;
  }

  if (state.plan_type === "commission") {
    if (!state.wallet_negative_since) return false;
    const balance = state.wallet_balance ?? 0;
    const limit = state.wallet_credit_limit ?? 0;
    if (balance >= -limit) return false;
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysNegative = Math.floor(
      (Date.now() - new Date(state.wallet_negative_since).getTime()) / msPerDay,
    );
    return daysNegative > GRACE_PERIOD_DAYS;
  }

  return false;
}
