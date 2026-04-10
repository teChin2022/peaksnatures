/**
 * Host free-plan expiry phases and utilities.
 *
 * Timeline:
 *   Day -3 .............. SMS warning
 *   Day  0 .............. Plan expires (SMS sent)
 *   Day +1 to +7 ........ Grace period (host can still operate, banner shown)
 *   Day +5 .............. SMS reminder ("bookings pause in 2 days")
 *   Day +7 onwards ...... Soft-blocked (new bookings blocked, upgrade required)
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
 * Determine the plan expiry phase for a host.
 * Works in any timezone — uses UTC internally.
 */
export function getPlanExpiryInfo(
  planType: string,
  planFreeExpiresAt: string | null,
): PlanExpiryInfo {
  // Non-free plans or no expiry date → always active
  if (planType !== "free" || !planFreeExpiresAt) {
    return { phase: "active", daysSinceExpiry: null, graceDaysRemaining: null };
  }

  const now = new Date();
  const expiresAt = new Date(planFreeExpiresAt);

  // Calculate days since expiry (positive = past expiry, negative = before expiry)
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffMs = now.getTime() - expiresAt.getTime();
  const daysSinceExpiry = Math.floor(diffMs / msPerDay);

  // Not yet expired
  if (daysSinceExpiry < 0) {
    return { phase: "active", daysSinceExpiry, graceDaysRemaining: null };
  }

  // Within grace period (day 0 to day GRACE_PERIOD_DAYS - 1)
  if (daysSinceExpiry < GRACE_PERIOD_DAYS) {
    return {
      phase: "grace",
      daysSinceExpiry,
      graceDaysRemaining: GRACE_PERIOD_DAYS - daysSinceExpiry,
    };
  }

  // Past grace period → blocked
  return { phase: "blocked", daysSinceExpiry, graceDaysRemaining: 0 };
}

/**
 * Check if a host's plan is soft-blocked (past grace period).
 * Convenience wrapper for use in API routes.
 */
export function isHostBlocked(planType: string, planFreeExpiresAt: string | null): boolean {
  return getPlanExpiryInfo(planType, planFreeExpiresAt).phase === "blocked";
}
