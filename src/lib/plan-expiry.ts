/**
 * Host block / plan expiry utilities.
 *
 * Free plan timeline:
 *   Day -3 .............. SMS warning
 *   Day  0 .............. Plan expires (SMS sent)
 *   Day +1 to +7 ........ Grace period (host can still operate, banner shown)
 *   Day +5 .............. SMS reminder ("bookings pause in 2 days")
 *   Day +7 onwards ...... Soft-blocked (new bookings blocked, upgrade required)
 *
 * Fixed-rate hosts are blocked when an invoice has been marked 'overdue'
 * (cron flips pending → overdue at due_date + GRACE_PERIOD_DAYS).
 *
 * Commission hosts are blocked when wallet has been negative (and below the
 * per-host credit limit) for more than GRACE_PERIOD_DAYS.
 */

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
 * fields are ignored. Fixed-rate needs has_overdue_invoice. Commission needs
 * the wallet fields.
 */
export interface HostBlockState {
  plan_type: string;
  plan_free_expires_at: string | null;
  has_overdue_invoice?: boolean;
  wallet_balance?: number;
  wallet_credit_limit?: number | null;
  wallet_negative_since?: string | null;
}

/**
 * Determine the free-plan expiry phase for a host.
 * Works in any timezone — uses UTC internally.
 */
export function getPlanExpiryInfo(
  planType: string,
  planFreeExpiresAt: string | null,
): PlanExpiryInfo {
  if (planType !== "free" || !planFreeExpiresAt) {
    return { phase: "active", daysSinceExpiry: null, graceDaysRemaining: null };
  }

  const now = new Date();
  const expiresAt = new Date(planFreeExpiresAt);

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffMs = now.getTime() - expiresAt.getTime();
  const daysSinceExpiry = Math.floor(diffMs / msPerDay);

  if (daysSinceExpiry < 0) {
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
 * - fixed_rate: blocked if has_overdue_invoice is true
 * - commission: blocked if wallet negative > GRACE_PERIOD_DAYS and balance < -credit_limit
 */
export function isHostBlocked(state: HostBlockState): boolean {
  if (state.plan_type === "free") {
    return getPlanExpiryInfo("free", state.plan_free_expires_at).phase === "blocked";
  }

  if (state.plan_type === "fixed_rate") {
    return state.has_overdue_invoice === true;
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
