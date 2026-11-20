import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { blockedHostIds } from "@/lib/host-blocked";
import { adminSearchTerm, ilikeAny } from "../search-term";

const HOST_COLUMNS = ["name", "email", "phone"];
const HOST_SELECT =
  "id, user_id, name, email, phone, status, is_verified, created_at, plan_type, wallet_balance, wallet_credit_limit, wallet_negative_since, plan_free_expires_at, commission_pct_override, quick_commission_pct_override, fixed_rate_override, fixed_rate_term_months, fixed_rate_term_ends_at";
/** `blocked` is not a column: it is isHostBlocked over approved hosts, as on the Overview. */
const statusSchema = z.enum(["pending", "approved", "blocked"]).nullable();

type Row = { id: string; user_id: string; name: string; email: string; phone: string | null; status: string; is_verified: boolean; created_at: string; plan_type: string; wallet_balance: number; wallet_credit_limit: number | null; wallet_negative_since: string | null; plan_free_expires_at: string | null; commission_pct_override: number | null; quick_commission_pct_override: number | null; fixed_rate_override: number | null; fixed_rate_term_months: number | null; fixed_rate_term_ends_at: string | null };

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

    const parsedStatus = statusSchema.safeParse(url.searchParams.get("status"));
    if (!parsedStatus.success) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const statusFilter = parsedStatus.data;
    const sc = createServiceRoleClient();
    const q = adminSearchTerm(url.searchParams.get("q"));

    let rows: Row[];
    let total: number;
    let blocked: Set<string>;
    if (statusFilter === "blocked") {
      // shortcut: reads every approved host (PostgREST returns at most 1,000) and pages in memory,
      // because "blocked" is computed in code; move to an RPC once hosts reach the thousands.
      let approvedQuery = sc
        .from("hosts")
        .select(HOST_SELECT)
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (q) approvedQuery = approvedQuery.or(ilikeAny(HOST_COLUMNS, q));
      const { data: approved, error } = await approvedQuery;
      if (error) {
        console.error("[Admin Hosts] query error:", error);
        return NextResponse.json({ error: "Failed to fetch hosts" }, { status: 500 });
      }
      // Same gate as the booking routes and the Overview's count, so the numbers agree.
      blocked = await blockedHostIds(approved as Row[], sc);
      const all = (approved as Row[]).filter((h) => blocked.has(h.id));
      total = all.length;
      rows = all.slice(offset, offset + limit);
    } else {
      // Get total count
      let countQuery = sc.from("hosts").select("id", { count: "exact", head: true });
      if (statusFilter) countQuery = countQuery.eq("status", statusFilter);
      if (q) countQuery = countQuery.or(ilikeAny(HOST_COLUMNS, q));
      const { count } = await countQuery;

      // Get paginated hosts
      let hostsQuery = sc
        .from("hosts")
        .select(HOST_SELECT)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (statusFilter) hostsQuery = hostsQuery.eq("status", statusFilter);
      if (q) hostsQuery = hostsQuery.or(ilikeAny(HOST_COLUMNS, q));
      const { data: hosts, error } = await hostsQuery;

      if (error) {
        console.error("[Admin Hosts] query error:", error);
        return NextResponse.json({ error: "Failed to fetch hosts" }, { status: 500 });
      }
      rows = hosts as Row[];
      total = count || 0;
      // Same gate as the booking routes, so the badge means bookings really are refused.
      blocked = await blockedHostIds(rows, sc);
    }

    // Fetch homestay names for each host
    const hostIds = rows.map((h) => h.id);
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

    const data = rows.map((h) => ({
      ...h,
      homestay: homestayMap.get(h.id) || null,
      blocked: blocked.has(h.id),
    }));

    const totalCount = total;
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
