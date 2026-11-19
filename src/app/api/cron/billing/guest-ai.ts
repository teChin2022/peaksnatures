import type { createServiceRoleClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export interface GuestAiChargeResult {
  days: number;
  baht: number;
  failed: number;
  sessionsPruned: number;
}

/**
 * Charges every finished Bangkok day of guest AI replies (D8, owner 2026-11-19):
 * days before `today` (cronBillingDates().today), not yet charged, with something
 * owed. charge_guest_ai_usage (086) rounds each day up to whole baht, charges it
 * once, and never takes a wallet below zero. A day that fails stays uncharged and
 * is picked up by the next run. Then drops guest sessions expired over a day ago.
 */
export async function chargeGuestAiUsage(sc: ServiceClient, today: string): Promise<GuestAiChargeResult> {
  const result: GuestAiChargeResult = { days: 0, baht: 0, failed: 0, sessionsPruned: 0 };

  const { data, error } = await sc
    .from("ai_usage_daily")
    .select("host_id, day")
    .lt("day", today)
    .is("charged_at", null)
    .gt("amount", 0);
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as { host_id: string; day: string }[]) {
    const { data: charged, error: chargeError } = await sc.rpc(
      "charge_guest_ai_usage" as never,
      { p_host: row.host_id, p_day: row.day } as never,
    );
    if (chargeError) {
      console.error("[Cron] Guest AI charge failed for host:", row.host_id, row.day, chargeError.message);
      result.failed += 1;
      continue;
    }
    result.days += 1;
    result.baht += ((charged as { charged: number }[] | null)?.[0]?.charged ?? 0);
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await sc.from("guest_ai_sessions").delete({ count: "exact" }).lt("expires_at", cutoff);
  result.sessionsPruned = count ?? 0;

  return result;
}
