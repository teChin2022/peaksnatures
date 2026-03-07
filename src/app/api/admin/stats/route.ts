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

    const [hostsRes, homestaysRes, bookingsRes] = await Promise.all([
      sc.from("hosts").select("id", { count: "exact", head: true }),
      sc.from("homestays").select("id", { count: "exact", head: true }),
      sc.from("bookings").select("total_price, status"),
    ]);

    const totalHosts = hostsRes.count || 0;
    const totalHomestays = homestaysRes.count || 0;

    const bookings = (bookingsRes.data as { total_price: number; status: string }[]) || [];
    const totalBookings = bookings.length;
    const totalRevenue = bookings
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .reduce((sum, b) => sum + b.total_price, 0);
    const pendingBookings = bookings.filter((b) => b.status === "pending").length;
    const confirmedBookings = bookings.filter((b) => b.status === "confirmed").length;

    return NextResponse.json({
      totalHosts,
      totalHomestays,
      totalBookings,
      totalRevenue,
      pendingBookings,
      confirmedBookings,
    });
  } catch (error) {
    console.error("[Admin Stats] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
