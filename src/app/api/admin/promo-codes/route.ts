import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;
    const hostId = url.searchParams.get("host_id");

    const sc = createServiceRoleClient();

    let homestayIdsForHost: string[] | null = null;
    if (hostId) {
      const { data } = await sc
        .from("homestays")
        .select("id")
        .eq("host_id", hostId);
      homestayIdsForHost = (data as { id: string }[] | null)?.map((h) => h.id) ?? [];
      if (homestayIdsForHost.length === 0) {
        return NextResponse.json({ data: [], page, limit, hasMore: false });
      }
    }

    let query = sc
      .from("promo_codes")
      .select("*, homestay:homestays(id, name, slug, host:hosts(id, name))")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit);
    if (homestayIdsForHost) query = query.in("homestay_id", homestayIdsForHost);

    const { data, error } = await query;
    if (error) {
      console.error("[Admin Promo Codes] query error:", error);
      return NextResponse.json({ error: "Failed to fetch promo codes" }, { status: 500 });
    }

    const rows = (data || []) as unknown[];
    const hasMore = rows.length > limit;
    return NextResponse.json({
      data: hasMore ? rows.slice(0, limit) : rows,
      page,
      limit,
      hasMore,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[Admin Promo Codes] error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
