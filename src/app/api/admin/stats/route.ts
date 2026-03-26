import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

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

    const sc = createServiceRoleClient();

    const [hostsRes, pendingHostsRes, homestaysRes, totalBookingsRes, pendingBookingsRes, confirmedBookingsRes, revenueRes] = await Promise.all([
      sc.from("hosts").select("id", { count: "exact", head: true }),
      sc.from("hosts").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sc.from("homestays").select("id", { count: "exact", head: true }),
      sc.from("bookings").select("id", { count: "exact", head: true }),
      sc.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sc.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
      sc.from("bookings").select("total_price").in("status", ["confirmed", "completed"]),
    ]);

    const totalHosts = hostsRes.count || 0;
    const pendingHosts = pendingHostsRes.count || 0;
    const totalHomestays = homestaysRes.count || 0;
    const totalBookings = totalBookingsRes.count || 0;
    const pendingBookings = pendingBookingsRes.count || 0;
    const confirmedBookings = confirmedBookingsRes.count || 0;
    const revenueRows = (revenueRes.data as { total_price: number }[]) || [];
    const totalRevenue = revenueRows.reduce((sum, b) => sum + b.total_price, 0);

    return NextResponse.json({
      totalHosts,
      pendingHosts,
      totalHomestays,
      totalBookings,
      totalRevenue,
      pendingBookings,
      confirmedBookings,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[Admin Stats] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
