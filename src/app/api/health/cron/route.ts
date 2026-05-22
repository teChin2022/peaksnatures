import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STALE_THRESHOLD_MS = 25 * 60 * 60 * 1000;

/**
 * GET /api/health/cron
 * Admin-only heartbeat for the daily billing cron.
 * Returns 200 { status: "ok" } if the most recent run was a success within 25h,
 * otherwise 503 { status: "stale" }.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !(await isAdmin(user.id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data } = await service
    .from("history_logs")
    .select("event_type, created_at")
    .eq("entity_id", "cron_billing")
    .in("event_type", ["cron_billing_success", "cron_billing_failure"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { event_type: string; created_at: string } | null;
  const lastRun = row?.created_at ?? null;
  const lastStatus = row
    ? row.event_type === "cron_billing_success"
      ? "success"
      : "failure"
    : null;
  const fresh =
    lastRun !== null && Date.now() - new Date(lastRun).getTime() < STALE_THRESHOLD_MS;

  if (fresh && lastStatus === "success") {
    return NextResponse.json({ status: "ok", last_run: lastRun, last_status: lastStatus });
  }

  return NextResponse.json(
    { status: "stale", last_run: lastRun, last_status: lastStatus },
    { status: 503 },
  );
}
