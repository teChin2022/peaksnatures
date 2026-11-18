import type { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchPastDueHostIds, type HostBlockRow } from "@/lib/billing";
import { isHostBlocked } from "@/lib/plan-expiry";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Which of these hosts the booking routes would refuse right now, with one
 * invoice read for the lot. Same inputs as the home page's listing filter.
 */
export async function blockedHostIds(
  hosts: (HostBlockRow & { id: string })[],
  sc: ServiceClient,
): Promise<Set<string>> {
  const pastDue = await fetchPastDueHostIds(
    hosts.filter((h) => h.plan_type === "fixed_rate").map((h) => h.id),
    sc,
  );
  return new Set(
    hosts
      .filter((h) =>
        isHostBlocked({
          plan_type: h.plan_type,
          plan_free_expires_at: h.plan_free_expires_at,
          has_past_due_invoice: pastDue.has(h.id),
          wallet_balance: h.wallet_balance ?? 0,
          wallet_credit_limit: h.wallet_credit_limit,
          wallet_negative_since: h.wallet_negative_since,
        }),
      )
      .map((h) => h.id),
  );
}
