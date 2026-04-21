import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

const getCachedStats = unstable_cache(
  async () => {
    const sc = createServiceRoleClient();

    const [
      hostsRes,
      pendingHostsRes,
      homestaysRes,
      totalBookingsRes,
      pendingBookingsRes,
      confirmedBookingsRes,
      revenueRes,
    ] = await Promise.all([
      sc.from("hosts").select("id", { count: "exact", head: true }),
      sc.from("hosts").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sc.from("homestays").select("id", { count: "exact", head: true }),
      sc.from("bookings").select("id", { count: "exact", head: true }),
      sc.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sc.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
      sc.rpc("get_admin_revenue_total"),
    ]);

    return {
      totalHosts: hostsRes.count || 0,
      pendingHosts: pendingHostsRes.count || 0,
      totalHomestays: homestaysRes.count || 0,
      totalBookings: totalBookingsRes.count || 0,
      pendingBookings: pendingBookingsRes.count || 0,
      confirmedBookings: confirmedBookingsRes.count || 0,
      totalRevenue: Number(revenueRes.data ?? 0),
    };
  },
  ["admin-stats"],
  { revalidate: 300, tags: ["admin-stats"] },
);

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = await getCachedStats();

    return NextResponse.json(stats, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[Admin Stats] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
