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
}

const BOOKING_SELECT = "id, guest_name, guest_email, guest_phone, check_in, check_out, num_guests, total_price, amount_paid, payment_type, status, room_id, checked_in_at, checked_out_at, created_at";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim();
  const homestayId = searchParams.get("homestay_id");

  if (!query || !homestayId) {
    return NextResponse.json({ bookings: [] });
  }

  // Public endpoint: guests search their own bookings by booking ID.
  // Scoped by homestay_id — no auth required.
  const supabase = createServiceRoleClient();

  // Search by exact booking ID
  const { data } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("homestay_id", homestayId)
    .eq("id", query)
    .limit(1);
  const unique = (data as unknown as BookingResult[]) || [];

  // Fetch room names for results
  const roomIds = [...new Set(unique.map((b) => b.room_id).filter(Boolean))] as string[];
  let roomMap: Record<string, string> = {};
  if (roomIds.length > 0) {
    const { data: rooms } = await supabase
      .from("rooms")
      .select("id, name")
      .in("id", roomIds);
    roomMap = Object.fromEntries(((rooms as { id: string; name: string }[]) || []).map((r) => [r.id, r.name]));
  }

  const sliced = unique.slice(0, 10);

  // Fetch existing reviews for completed bookings to show has_review flag
  const completedIds = sliced.filter((b) => b.status === "completed").map((b) => b.id);
  let reviewedSet = new Set<string>();
  if (completedIds.length > 0) {
    const { data: reviewRows } = await supabase
      .from("reviews")
      .select("booking_id")
      .in("booking_id", completedIds);
    reviewedSet = new Set(
      ((reviewRows as unknown as { booking_id: string }[]) || []).map((r) => r.booking_id)
    );
  }

  const results = sliced.map((b) => ({
    ...b,
    room_name: b.room_id ? roomMap[b.room_id] || "—" : "—",
    has_review: reviewedSet.has(b.id),
  }));

  return NextResponse.json({ bookings: results });
}
