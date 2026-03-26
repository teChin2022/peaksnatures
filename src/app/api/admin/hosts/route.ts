import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

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

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const sc = createServiceRoleClient();
    const statusFilter = url.searchParams.get("status"); // 'pending', 'approved', or null (all)

    // Get total count
    let countQuery = sc.from("hosts").select("id", { count: "exact", head: true });
    if (statusFilter) countQuery = countQuery.eq("status", statusFilter);
    const { count: total } = await countQuery;

    // Get paginated hosts
    let hostsQuery = sc
      .from("hosts")
      .select("id, user_id, name, email, phone, status, is_verified, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (statusFilter) hostsQuery = hostsQuery.eq("status", statusFilter);
    const { data: hosts, error } = await hostsQuery;

    if (error) {
      console.error("[Admin Hosts] query error:", error);
      return NextResponse.json({ error: "Failed to fetch hosts" }, { status: 500 });
    }

    // Fetch homestay names for each host
    const hostIds = (hosts as { id: string }[]).map((h) => h.id);
    const { data: homestays } = hostIds.length
      ? await sc
          .from("homestays")
          .select("host_id, name, slug, is_active")
          .in("host_id", hostIds)
      : { data: [] };

    const homestayMap = new Map<string, { name: string; slug: string; is_active: boolean }>();
    for (const h of (homestays as { host_id: string; name: string; slug: string; is_active: boolean }[]) || []) {
      homestayMap.set(h.host_id, { name: h.name, slug: h.slug, is_active: h.is_active });
    }

    const data = (hosts as { id: string; user_id: string; name: string; email: string; phone: string | null; status: string; is_verified: boolean; created_at: string }[]).map((h) => ({
      ...h,
      homestay: homestayMap.get(h.id) || null,
    }));

    const totalCount = total || 0;
    return NextResponse.json({
      data,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[Admin Hosts] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
