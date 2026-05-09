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
    const payoutStatus = url.searchParams.get("payout_status");

    const sc = createServiceRoleClient();

    let codeIdsForHost: string[] | null = null;
    if (hostId) {
      const { data: homestays } = await sc
        .from("homestays")
        .select("id")
        .eq("host_id", hostId);
      const homestayIds = (homestays as { id: string }[] | null)?.map((h) => h.id) ?? [];
      if (homestayIds.length === 0) {
        return NextResponse.json({ data: [], page, limit, hasMore: false });
      }
      const { data: codes } = await sc
        .from("promo_codes")
        .select("id")
        .in("homestay_id", homestayIds);
      codeIdsForHost = (codes as { id: string }[] | null)?.map((c) => c.id) ?? [];
      if (codeIdsForHost.length === 0) {
        return NextResponse.json({ data: [], page, limit, hasMore: false });
      }
    }

    let query = sc
      .from("promo_redemptions")
      .select("*, promo_code:promo_codes(id, code, recommender_name, homestay:homestays(name, slug, host:hosts(name)))")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit);
    if (codeIdsForHost) query = query.in("promo_code_id", codeIdsForHost);
    if (payoutStatus && ["pending", "paid", "cancelled"].includes(payoutStatus)) {
      query = query.eq("payout_status", payoutStatus);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[Admin Promo Redemptions] query error:", error);
      return NextResponse.json({ error: "Failed to fetch redemptions" }, { status: 500 });
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
    console.error("[Admin Promo Redemptions] error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
