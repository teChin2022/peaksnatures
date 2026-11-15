import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { createRateLimiter } from "@/lib/rate-limit";
import { guestLookupSchema, matchesGuestContact } from "@/lib/guest-lookup";

const lookupRateLimit = createRateLimiter({ limit: 10, windowMs: 60_000, name: "reviews-lookup" });

export async function POST(request: NextRequest) {
  const rateLimited = await lookupRateLimit.check(request);
  if (rateLimited) return rateLimited;

  try {
    const parsed = guestLookupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    const { homestay_id, phone, email, turnstileToken } = parsed.data;

    // Verify Turnstile CAPTCHA
    const captchaResult = await verifyTurnstileToken(turnstileToken || "");
    if (captchaResult === "fail") {
      return NextResponse.json(
        { error: "CAPTCHA verification failed" },
        { status: 403 }
      );
    }

    const supabase = createServiceRoleClient();

    // Completed stays for this homestay booked with this phone AND email (see
    // guestLookupSchema). The ilike only narrows; matchesGuestContact decides.
    const { data: bookingRows, error } = await supabase
      .from("bookings")
      .select("id, guest_name, guest_email, guest_phone, room_id, check_in, check_out, num_guests, total_price, created_at")
      .eq("homestay_id", homestay_id)
      .eq("status", "completed")
      .ilike("guest_email", email)
      .order("check_out", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: "Failed to lookup bookings" }, { status: 500 });
    }

    const bookings = ((bookingRows || []) as {
      id: string;
      guest_name: string;
      guest_email: string;
      guest_phone: string | null;
      room_id: string | null;
      check_in: string;
      check_out: string;
      num_guests: number;
      total_price: number;
      created_at: string;
    }[]).filter((b) => matchesGuestContact(b, phone, email));

    if (bookings.length === 0) {
      return NextResponse.json({ bookings: [] });
    }

    // Filter out bookings that already have reviews
    const bookingIds = bookings.map((b) => b.id);
    const { data: reviewRows } = await supabase
      .from("reviews")
      .select("booking_id")
      .in("booking_id", bookingIds);

    const reviewedBookingIds = new Set((reviewRows || []).map((r) => (r as { booking_id: string }).booking_id));

    // Get room names
    const roomIds = [...new Set(bookings.map((b) => b.room_id).filter(Boolean))];
    const { data: roomRows } = roomIds.length > 0
      ? await supabase.from("rooms").select("id, name").in("id", roomIds)
      : { data: [] };

    const roomMap = new Map((roomRows || []).map((r) => [(r as { id: string; name: string }).id, (r as { id: string; name: string }).name]));

    const eligible = bookings
      .filter((b) => !reviewedBookingIds.has(b.id))
      .map((b) => ({
        id: b.id,
        guest_name: b.guest_name,
        guest_email: b.guest_email,
        room_name: b.room_id ? roomMap.get(b.room_id) || "" : "",
        check_in: b.check_in,
        check_out: b.check_out,
        num_guests: b.num_guests,
        total_price: b.total_price,
        created_at: b.created_at,
      }));

    return NextResponse.json({ bookings: eligible });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
