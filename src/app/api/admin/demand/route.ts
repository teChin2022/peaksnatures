/**
 * Platform-wide demand funnel, optionally narrowed to one homestay.
 * Same aggregation as the host route (src/lib/demand-stats.ts) so the two
 * dashboards can never disagree.
 */
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { getDemandStats, parseDemandDays } from "@/lib/demand-stats";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = new URL(req.url).searchParams;
    const days = parseDemandDays(params.get("days"));
    const raw = params.get("homestay_id");
    // Absent or malformed means the whole platform.
    const homestayId = raw && UUID_RE.test(raw) ? raw : null;

    const sc = createServiceRoleClient();
    const stats = await unstable_cache(
      () => getDemandStats(sc, { homestayId, days }),
      ["admin-demand-stats", homestayId ?? "all", String(days)],
      // Kept in step with the host route deliberately. Both render the same
      // <DemandPanel> off the same getDemandStats query, so a split TTL would
      // let an admin filtered to one homestay and that homestay's own host read
      // different numbers for minutes at a time — exactly the disagreement
      // sharing the query was meant to rule out.
      { revalidate: 60, tags: ["admin-demand"] },
    )();

    return NextResponse.json(stats, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[AdminDemand] error:", error);
    return NextResponse.json({ error: "Failed to load demand stats" }, { status: 500 });
  }
}
