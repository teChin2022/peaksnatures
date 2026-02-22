import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";

const payBalanceSchema = z.object({
  booking_id: z.string().uuid(),
  guest_email: z.string().email(),
  slip_hash: z.string().min(1),
  slip_trans_ref: z.string().nullable().optional(),
  payment_slip_url: z.string().nullable().optional(),
  easyslip_response: z.unknown().optional(),
});

/**
 * POST /api/bookings/pay-balance
 * Guest pays the remaining balance for a deposit booking.
 * Slip must be verified first via /api/verify-slip, then this endpoint updates amount_paid.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = payBalanceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = createServiceRoleClient();

    // Fetch the booking
    const { data: bookingRow, error: bookingError } = await supabase
      .from("bookings")
      .select("id, status, guest_email, total_price, amount_paid, payment_type")
      .eq("id", data.booking_id)
      .single();

    const booking = bookingRow as unknown as {
      id: string;
      status: string;
      guest_email: string;
      total_price: number;
      amount_paid: number;
      payment_type: string;
    } | null;

    if (bookingError || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Verify guest identity
    if (booking.guest_email.toLowerCase() !== data.guest_email.toLowerCase()) {
      return NextResponse.json(
        { error: "Email does not match the booking" },
        { status: 403 }
      );
    }

    // Check booking is in a valid state
    if (booking.status !== "confirmed" && booking.status !== "verified") {
      return NextResponse.json(
        { error: "Booking must be confirmed to pay balance" },
        { status: 400 }
      );
    }

    // Check there is actually a balance due
    const balanceDue = booking.total_price - (booking.amount_paid || 0);
    if (balanceDue <= 0) {
      return NextResponse.json(
        { error: "No balance due — booking is already fully paid" },
        { status: 400 }
      );
    }

    // Update booking: mark as fully paid
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        amount_paid: booking.total_price,
        payment_type: "full",
      } as never)
      .eq("id", data.booking_id);

    if (updateError) {
      console.error("[PayBalance] Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update booking payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      amount_paid: booking.total_price,
      balance_due: 0,
    });
  } catch (error) {
    console.error("Pay balance error:", error);
    return NextResponse.json(
      { error: "Failed to process balance payment" },
      { status: 500 }
    );
  }
}
