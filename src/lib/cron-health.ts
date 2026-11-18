import { createServiceRoleClient } from "@/lib/supabase/server";

const STALE_THRESHOLD_MS = 25 * 60 * 60 * 1000;

export interface CronHealth {
  ok: boolean;
  lastRun: string | null;
  lastStatus: "success" | "failure" | null;
}

/**
 * The daily billing cron is healthy if its latest run succeeded within 25h.
 * Shared by /api/health/cron and the admin overview so the two never disagree.
 */
export async function getCronHealth(): Promise<CronHealth> {
  const { data } = await createServiceRoleClient()
    .from("history_logs")
    .select("event_type, created_at")
    .eq("entity_id", "cron_billing")
    .in("event_type", ["cron_billing_success", "cron_billing_failure"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { event_type: string; created_at: string } | null;
  const lastRun = row?.created_at ?? null;
  const lastStatus = row ? (row.event_type === "cron_billing_success" ? "success" : "failure") : null;
  const fresh = lastRun !== null && Date.now() - new Date(lastRun).getTime() < STALE_THRESHOLD_MS;

  return { ok: fresh && lastStatus === "success", lastRun, lastStatus };
}
