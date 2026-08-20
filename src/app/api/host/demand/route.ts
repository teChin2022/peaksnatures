/**
 * Demand funnel for the signed-in host's own homestay.
 * Rendered by <DemandPanel> on the dashboard ภาพรวม tab.
 */
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getDemandStats, parseDemandDays } from "@/lib/demand-stats";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sc = createServiceRoleClient();

    const { data: host } = await sc.from("hosts").select("id").eq("user_id", user.id).single();
    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const { data: homestay } = await sc
      .from("homestays")
      .select("id")
      .eq("host_id", (host as { id: string }).id)
      .single();

    if (!homestay) {
      return NextResponse.json({ error: "Homestay not found" }, { status: 404 });
    }

    const homestayId = (homestay as { id: string }).id;
    const days = parseDemandDays(new URL(req.url).searchParams.get("days"));

    const stats = await unstable_cache(
      () => getDemandStats(sc, { homestayId, days }),
      ["demand-stats", homestayId, String(days)],
      // 60s, matching the repo's fresh tier (/api/bookings/availability,
      // /api/reviews, the landing page). Every other stat on the dashboard
      // overview is fetched live through the browser Supabase client, so a
      // 5-minute lag made the demand panel the one stale block on the page and
      // made hand-edits to demand_events look like they hadn't applied.
      // Nothing calls revalidateTag for this tag — the cache expires on time
      // only, so this number is the whole freshness story.
      { revalidate: 60, tags: [`demand:${homestayId}`] },
    )();

    return NextResponse.json(stats, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[HostDemand] error:", error);
    return NextResponse.json({ error: "Failed to load demand stats" }, { status: 500 });
  }
}
