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
      .from("bookings")
      .select("id", { count: "exact", head: true });

    const { data: bookings, error } = await sc
      .from("bookings")
      .select("id, homestay_id, room_id, guest_name, guest_email, guest_phone, check_in, check_out, num_guests, total_price, status, payment_type, amount_paid, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[Admin Bookings] query error:", error);
      return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
    }

    const typedBookings = bookings as {
      id: string; homestay_id: string; room_id: string | null;
      guest_name: string; guest_email: string; guest_phone: string;
      check_in: string; check_out: string; num_guests: number;
      total_price: number; status: string; payment_type: string;
      amount_paid: number; created_at: string;
    }[];

    // Fetch homestay names
    const homestayIds = [...new Set(typedBookings.map((b) => b.homestay_id))];
    const { data: homestays } = homestayIds.length
      ? await sc.from("homestays").select("id, name, slug").in("id", homestayIds)
      : { data: [] };

    const homestayMap = new Map<string, { name: string; slug: string }>();
    for (const h of (homestays as { id: string; name: string; slug: string }[]) || []) {
      homestayMap.set(h.id, { name: h.name, slug: h.slug });
    }

    // Fetch room names
    const roomIds = typedBookings.map((b) => b.room_id).filter(Boolean) as string[];
    const { data: rooms } = roomIds.length
      ? await sc.from("rooms").select("id, name").in("id", roomIds)
      : { data: [] };

    const roomMap = new Map<string, string>();
    for (const r of (rooms as { id: string; name: string }[]) || []) {
      roomMap.set(r.id, r.name);
    }

    const data = typedBookings.map((b) => ({
      ...b,
      homestay_name: homestayMap.get(b.homestay_id)?.name || null,
      homestay_slug: homestayMap.get(b.homestay_id)?.slug || null,
      room_name: b.room_id ? roomMap.get(b.room_id) || null : null,
    }));

    const totalCount = total || 0;
    return NextResponse.json({
      data,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error("[Admin Bookings] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
