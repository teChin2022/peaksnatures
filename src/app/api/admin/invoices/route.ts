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
    const statusFilter = url.searchParams.get("status");

    const sc = createServiceRoleClient();

    // Count
    let countQuery = sc.from("invoices").select("id", { count: "exact", head: true });
    if (statusFilter) countQuery = countQuery.eq("status", statusFilter);
    const { count: total } = await countQuery;

    // Fetch invoices with host info
    let query = sc
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (statusFilter) query = query.eq("status", statusFilter);
    const { data: invoices, error } = await query;

    if (error) {
      console.error("[Admin Invoices] query error:", error);
      return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
    }

    // Fetch host names for display
    const hostIds = [...new Set((invoices as { host_id: string }[]).map((i) => i.host_id))];
    const { data: hosts } = hostIds.length
      ? await sc.from("hosts").select("id, name, email").in("id", hostIds)
      : { data: [] };

    const hostsMap = new Map((hosts as { id: string; name: string; email: string }[] || []).map((h) => [h.id, h]));

    const enriched = (invoices || []).map((inv) => {
      const row = inv as Record<string, unknown>;
      return {
        ...row,
        host: hostsMap.get((inv as { host_id: string }).host_id) || null,
      };
    });

    return NextResponse.json({ invoices: enriched, total, page, limit });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
