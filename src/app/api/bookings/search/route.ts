import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

interface BookingResult {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  total_price: number;
  amount_paid: number;
  payment_type: string;
  status: string;
  room_id: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  created_at: string;
  selected_options: { name: string; price: number }[] | null;
}

const BOOKING_SELECT = "id, guest_name, guest_email, guest_phone, check_in, check_out, num_guests, total_price, amount_paid, payment_type, status, room_id, checked_in_at, checked_out_at, created_at, selected_options, guest_pricing_label";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim();
  const homestayId = searchParams.get("homestay_id");

  if (!query || !homestayId) {
    return NextResponse.json({ bookings: [] });
  }

  // Public endpoint: guests search their own bookings.
  // Supports booking ID, phone number, or email.
  // Scoped by homestay_id — no auth required.
  const supabase = createServiceRoleClient();

  // Determine search type and query accordingly
  const isEmail = query.includes("@");
  const isPhone = /^[0-9+\-() ]{7,}$/.test(query);

  let searchQuery;
  if (isEmail) {
    searchQuery = supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("homestay_id", homestayId)
      .eq("guest_email", query)
      .order("created_at", { ascending: false })
      .limit(10);
  } else if (isPhone) {
    const digits = query.replace(/\D/g, "");
    searchQuery = supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("homestay_id", homestayId)
      .like("guest_phone", `%${digits}%`)
      .order("created_at", { ascending: false })
      .limit(10);
  } else {
    // Default: search by exact booking ID
    searchQuery = supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("homestay_id", homestayId)
      .eq("id", query)
      .limit(1);
  }

  const { data } = await searchQuery;
  const unique = (data as unknown as BookingResult[]) || [];

  const sliced = unique.slice(0, 10);

  // --- Parallel batch: room names, cancellation_days, reviews, date change requests ---
  const roomIds = [...new Set(unique.map((b) => b.room_id).filter(Boolean))] as string[];
  const completedIds = sliced.filter((b) => b.status === "completed").map((b) => b.id);
  const bookingIds = sliced.map((b) => b.id);

  const [roomsRes, cancellationRes, reviewsRes, dcrsRes] = await Promise.all([
    // Room names
    roomIds.length > 0
      ? supabase.from("rooms").select("id, name").in("id", roomIds)
      : Promise.resolve({ data: null }),
    // Cancellation days via joined query
    supabase.from("homestays").select("hosts(cancellation_days)").eq("id", homestayId).single(),
    // Reviews for completed bookings
    completedIds.length > 0
      ? supabase.from("reviews").select("booking_id").in("booking_id", completedIds)
      : Promise.resolve({ data: null }),
    // Pending date change requests
    bookingIds.length > 0
      ? supabase.from("date_change_requests").select("id, booking_id, new_check_in, new_check_out, new_total_price, price_difference, status, new_room_id").in("booking_id", bookingIds).eq("status", "pending")
      : Promise.resolve({ data: null }),
  ]);

  const roomMap: Record<string, string> = Object.fromEntries(
    ((roomsRes.data as { id: string; name: string }[]) || []).map((r) => [r.id, r.name])
  );

  const cancellationHost = (cancellationRes.data as unknown as { hosts: { cancellation_days: number } | null } | null)?.hosts;
  const cancellationDays = cancellationHost?.cancellation_days || 0;

  const reviewedSet = new Set(
    ((reviewsRes.data as unknown as { booking_id: string }[]) || []).map((r) => r.booking_id)
  );

  // A newly-requested room may not be among the currently-booked rooms, so resolve its name separately.
  const dcrRows = (dcrsRes.data as unknown as { id: string; booking_id: string; new_check_in: string; new_check_out: string; new_total_price: number; price_difference: number; status: string; new_room_id: string | null }[]) || [];
  const extraRoomIds = [...new Set(dcrRows.map((r) => r.new_room_id).filter((id): id is string => !!id && !roomMap[id]))];
  if (extraRoomIds.length > 0) {
    const { data: extraRooms } = await supabase.from("rooms").select("id, name").in("id", extraRoomIds);
    for (const r of (extraRooms as { id: string; name: string }[]) || []) {
      roomMap[r.id] = r.name;
    }
  }

  const pendingDateChanges: Record<string, { id: string; new_check_in: string; new_check_out: string; new_total_price: number; price_difference: number; status: string; new_room_id: string | null; new_room_name: string | null }> = {};
  for (const row of dcrRows) {
    pendingDateChanges[row.booking_id] = {
      id: row.id,
      new_check_in: row.new_check_in,
      new_check_out: row.new_check_out,
      new_total_price: row.new_total_price,
      price_difference: row.price_difference,
      status: row.status,
      new_room_id: row.new_room_id,
      new_room_name: row.new_room_id ? roomMap[row.new_room_id] || null : null,
    };
  }

  const results = sliced.map((b) => ({
    ...b,
    room_name: b.room_id ? roomMap[b.room_id] || "—" : "—",
    has_review: reviewedSet.has(b.id),
    pending_date_change: pendingDateChanges[b.id] || null,
  }));

  return NextResponse.json({ bookings: results, cancellation_days: cancellationDays }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
