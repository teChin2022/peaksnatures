import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { getCronHealth } from "@/lib/cron-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const { ok, lastRun, lastStatus } = await getCronHealth();

  if (ok) {
    return NextResponse.json({ status: "ok", last_run: lastRun, last_status: lastStatus });
  }

  return NextResponse.json(
    { status: "stale", last_run: lastRun, last_status: lastStatus },
    { status: 503 },
  );
}
