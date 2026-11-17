/**
 * Wallet policy figures shared by the server and the dashboard.
 *
 * Deliberately import-free, like topup-amounts.ts. These constants are read
 * from `"use client"` pages as well as from API routes and the cron, and
 * @/lib/billing cannot be imported from the client — it reaches
 * @/lib/supabase/server (next/headers) and @/lib/notifications (ioredis), both
 * of which fail to bundle for the browser.
 */

/**
 * Commission hosts are warned by SMS/LINE once their wallet dips below this,
 * giving them room to top up before the balance goes negative and the
 * GRACE_PERIOD_DAYS countdown to a booking block starts.
 *
 * The same figure gates switching onto Commission (`/api/host/plan/switch`), so
 * a host can never adopt the plan already below the level that would warn them.
 */
export const LOW_WALLET_THRESHOLD = 300;

/** Where a host's wallet stands against LOW_WALLET_THRESHOLD, for the wallet page. */
export type WalletStatus =
  | { kind: "ok" }
  | { kind: "low"; short: number }
  | { kind: "negative"; short: number }
  | { kind: "enoughForCommission" }
  | { kind: "needForCommission"; short: number };

export function walletStatus(planType: string, balance: number): WalletStatus {
  const short = LOW_WALLET_THRESHOLD - balance;
  if (planType === "commission") {
    if (balance < 0) return { kind: "negative", short };
    return short > 0 ? { kind: "low", short } : { kind: "ok" };
  }
  return short > 0 ? { kind: "needForCommission", short } : { kind: "enoughForCommission" };
}
