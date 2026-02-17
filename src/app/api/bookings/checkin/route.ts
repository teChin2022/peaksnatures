import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/bookings/checkin
 * Body: { booking_id, guest_email, action: "checkin" | "checkout" }
 *
 * Guest self-service check-in / check-out via QR code.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { booking_id, guest_email, action } = body;

    if (!booking_id || !guest_email || !action) {
      return NextResponse.json(
        { error: "booking_id, guest_email, and action are required" },
        { status: 400 }
      );
    }

    if (action !== "checkin" && action !== "checkout") {
      return NextResponse.json(
        { error: "action must be 'checkin' or 'checkout'" },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Fetch the booking
    const { data: bookingRow, error: bookingError } = await supabase
      .from("bookings")
      .select("id, status, guest_email, check_in, check_out, checked_in_at, checked_out_at")
      .eq("id", booking_id)
      .single();

    const booking = bookingRow as unknown as {
      id: string;
      status: string;
      guest_email: string;
      check_in: string;
      check_out: string;
      checked_in_at: string | null;
      checked_out_at: string | null;
    } | null;

    if (bookingError || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Verify guest identity
    if (booking.guest_email.toLowerCase() !== (guest_email as string).toLowerCase()) {
      return NextResponse.json(
        { error: "Email does not match the booking" },
        { status: 403 }
      );
    }

    // Only confirmed bookings can be checked in/out
    if (booking.status !== "confirmed" && booking.status !== "completed") {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "Booking must be confirmed to check in/out" },
        { status: 400 }
      );
    }

    if (action === "checkin") {
      if (booking.checked_in_at) {
        return NextResponse.json(
          { error: "ALREADY_CHECKED_IN", message: "Already checked in" },
          { status: 409 }
        );
      }

      const { error: updateError } = await supabase
        .from("bookings")
        .update({ checked_in_at: new Date().toISOString() } as never)
        .eq("id", booking_id);

      if (updateError) {
        console.error("[CheckIn] Update error:", updateError);
        return NextResponse.json({ error: "Failed to check in" }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: "checkin" });
    }

    // action === "checkout"
    if (!booking.checked_in_at) {
      return NextResponse.json(
        { error: "NOT_CHECKED_IN", message: "Must check in before checking out" },
        { status: 400 }
      );
    }

    if (booking.checked_out_at) {
      return NextResponse.json(
        { error: "ALREADY_CHECKED_OUT", message: "Already checked out" },
        { status: 409 }
      );
    }

    // Check out and mark booking as completed
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        checked_out_at: new Date().toISOString(),
        status: "completed",
      } as never)
      .eq("id", booking_id);

    if (updateError) {
      console.error("[CheckOut] Update error:", updateError);
      return NextResponse.json({ error: "Failed to check out" }, { status: 500 });
    }

    return NextResponse.json({ success: true, action: "checkout" });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
