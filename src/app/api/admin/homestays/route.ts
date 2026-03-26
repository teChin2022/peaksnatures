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

    const { count: total } = await sc
      .from("homestays")
      .select("id", { count: "exact", head: true });

    const { data: homestays, error } = await sc
      .from("homestays")
      .select("id, host_id, name, slug, location, is_active, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[Admin Homestays] query error:", error);
      return NextResponse.json({ error: "Failed to fetch homestays" }, { status: 500 });
    }

    // Fetch host names
    const hostIds = [...new Set((homestays as { host_id: string }[]).map((h) => h.host_id))];
    const { data: hosts } = hostIds.length
      ? await sc.from("hosts").select("id, name, email").in("id", hostIds)
      : { data: [] };

    const hostMap = new Map<string, { name: string; email: string }>();
    for (const h of (hosts as { id: string; name: string; email: string }[]) || []) {
      hostMap.set(h.id, { name: h.name, email: h.email });
    }

    const data = (homestays as { id: string; host_id: string; name: string; slug: string; location: string; is_active: boolean; created_at: string }[]).map((h) => ({
      ...h,
      host: hostMap.get(h.host_id) || null,
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
    console.error("[Admin Homestays] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
