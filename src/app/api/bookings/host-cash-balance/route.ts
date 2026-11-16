import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";
import { canActForHost } from "@/lib/host-access";

const schema = z.object({ booking_id: z.string().uuid() });

/**
 * POST /api/bookings/host-cash-balance
 *
 * The host records that a guest paid the rest of a deposit booking in cash.
 * This used to be the guest's own "paid in cash" button on
 * /api/bookings/pay-balance, which let anyone holding a booking id and email
 * mark the balance paid (security audit 2026-11-15, F-05).
 *
 * Not gated on the host's billing standing: the money has already changed
 * hands, and the guest cannot check out until it is on record.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "booking_id is required" }, { status: 400 });
    }
    const { booking_id } = parsed.data;

    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: bookingRow, error: bookingError } = await supabase
      .from("bookings")
      .select("id, homestay_id, status, total_price, amount_paid")
      .eq("id", booking_id)
      .single();

    if (bookingError || !bookingRow) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const booking = bookingRow as unknown as {
      id: string;
      homestay_id: string;
      status: string;
      total_price: number;
      amount_paid: number;
    };

    const { data: hsRow } = await supabase
      .from("homestays")
      .select("host_id, hosts(id, name, user_id)")
      .eq("id", booking.homestay_id)
      .single();
    const hostData = (hsRow as unknown as { host_id: string; hosts: { id: string; name: string; user_id: string } | null } | null)?.hosts;

    if (!hostData || !(await canActForHost(supabase, user.id, hostData))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // The same states the guest's balance payment accepts.
    if (booking.status !== "confirmed" && booking.status !== "verified") {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "Only a confirmed booking has a balance to record" },
        { status: 400 }
      );
    }

    const previousAmountPaid = booking.amount_paid || 0;
    if (booking.total_price - previousAmountPaid <= 0) {
      return NextResponse.json(
        { error: "NO_BALANCE_DUE", message: "The booking is already fully paid" },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update({ amount_paid: booking.total_price, payment_type: "full", updated_by: hostData.name } as never)
      .eq("id", booking_id);

    if (updateError) {
      console.error("[HostCashBalance] Update error:", updateError);
      return NextResponse.json({ error: "Failed to record the payment" }, { status: 500 });
    }

    after(async () => {
      await logEvent({
        homestayId: booking.homestay_id,
        entityType: "booking",
        entityId: booking_id,
        eventType: EventType.BALANCE_PAID,
        actorType: "host",
        actorId: user.id,
        data: {
          method: "cash",
          previous_amount_paid: previousAmountPaid,
          new_amount_paid: booking.total_price,
          source: "host_dashboard",
        },
        req,
      });
    });

    return NextResponse.json({ success: true, amount_paid: booking.total_price });
  } catch (error) {
    console.error("[HostCashBalance] Error:", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
