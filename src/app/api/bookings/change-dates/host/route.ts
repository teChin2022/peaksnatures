import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendDateChangeByHostEmail } from "@/lib/notifications";
import type { Booking, Homestay, Host, Room, RoomSeasonalPrice } from "@/types/database";
import { calculateTotalPrice } from "@/lib/calculate-price";
import { logEvent, EventType } from "@/lib/history-log";

const hostChangeDatesSchema = z.object({
  booking_id: z.string().uuid(),
  new_check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  new_check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = hostChangeDatesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Verify host is authenticated
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Fetch the booking
    const { data: bookingRow, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", data.booking_id)
      .single();

    if (bookingError || !bookingRow) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const booking = bookingRow as unknown as Booking;

    // Only confirmed bookings can change dates
    if (booking.status !== "confirmed") {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "Only confirmed bookings can change dates" },
        { status: 400 }
      );
    }

    if (booking.checked_in_at) {
      return NextResponse.json(
        { error: "ALREADY_CHECKED_IN", message: "Cannot change dates after check-in" },
        { status: 400 }
      );
    }

    // Same dates = no change needed
    if (data.new_check_in === booking.check_in && data.new_check_out === booking.check_out) {
      return NextResponse.json({ error: "Dates are the same" }, { status: 400 });
    }

    // Verify the host owns this homestay
    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("*")
      .eq("id", booking.homestay_id)
      .single();

    if (!homestayRow) {
      return NextResponse.json({ error: "Homestay not found" }, { status: 404 });
    }

    const homestay = homestayRow as unknown as Homestay;

    const { data: hostRow } = await supabase
      .from("hosts")
      .select("*")
      .eq("id", homestay.host_id)
      .single();

    if (!hostRow) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const host = hostRow as unknown as Host;

    if (host.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate new dates
    const newCheckIn = new Date(data.new_check_in);
    const newCheckOut = new Date(data.new_check_out);
    const nights = Math.round((newCheckOut.getTime() - newCheckIn.getTime()) / (1000 * 60 * 60 * 24));

    if (nights <= 0) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    // Recalculate price for new dates
    let newTotalPrice = booking.total_price;
    if (booking.room_id) {
      const { data: roomRow } = await supabase
        .from("rooms")
        .select("price_per_night")
        .eq("id", booking.room_id)
        .single();

      if (!roomRow) {
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }

      const room = roomRow as unknown as { price_per_night: number };

      const { data: seasonRows } = await supabase
        .from("room_seasonal_prices")
        .select("*")
        .eq("room_id", booking.room_id);
      const seasons = (seasonRows as unknown as RoomSeasonalPrice[]) || [];

      const { total } = calculateTotalPrice(room.price_per_night, newCheckIn, newCheckOut, seasons);
      newTotalPrice = total;
    }

    const oldCheckIn = booking.check_in;
    const oldCheckOut = booking.check_out;
    const oldTotalPrice = booking.total_price;
    const priceDifference = newTotalPrice - oldTotalPrice;

    // Atomically check availability + update booking (reuse the RPC pattern)
    // For host-initiated, we create a request and immediately approve it
    const { data: requestRow, error: insertError } = await supabase
      .from("date_change_requests")
      .insert({
        booking_id: data.booking_id,
        old_check_in: oldCheckIn,
        old_check_out: oldCheckOut,
        new_check_in: data.new_check_in,
        new_check_out: data.new_check_out,
        old_total_price: oldTotalPrice,
        new_total_price: newTotalPrice,
        price_difference: priceDifference,
        status: "pending",
        requested_by: host.name,
        created_by: host.name,
        updated_by: host.name,
      } as never)
      .select()
      .single();

    if (insertError || !requestRow) {
      console.error("[HostChangeDates] Insert error:", insertError);
      return NextResponse.json({ error: "Failed to create date change" }, { status: 500 });
    }

    const requestId = (requestRow as { id: string }).id;

    // Atomically approve it
    const { error: rpcError } = await supabase.rpc(
      "approve_date_change_atomic" as never,
      {
        p_request_id: requestId,
        p_approved_by: user.id,
      } as never
    );

    if (rpcError) {
      console.error("[HostChangeDates] RPC error:", rpcError);

      // Clean up the request on failure
      await supabase
        .from("date_change_requests")
        .update({ status: "rejected", reject_reason: rpcError.message, updated_by: host.name } as never)
        .eq("id", requestId);

      if (rpcError.message?.includes("DATES_UNAVAILABLE")) {
        return NextResponse.json(
          { error: "DATES_UNAVAILABLE", message: "The requested dates are not available" },
          { status: 409 }
        );
      }
      if (rpcError.message?.includes("DATES_BLOCKED")) {
        return NextResponse.json(
          { error: "DATES_BLOCKED", message: "Some requested dates are blocked" },
          { status: 409 }
        );
      }

      return NextResponse.json({ error: "Failed to change dates" }, { status: 500 });
    }

    // amount_paid is capped by the RPC when price decreases
    const newAmountPaid = Math.min(booking.amount_paid, newTotalPrice);

    // Log + notify guest in background
    after(async () => {
      await logEvent({
        homestayId: booking.homestay_id,
        entityType: "booking",
        entityId: booking.id,
        eventType: EventType.BOOKING_DATE_CHANGE_APPROVED,
        actorType: "host",
        actorId: user.id,
        data: {
          request_id: requestId,
          old_check_in: oldCheckIn,
          old_check_out: oldCheckOut,
          new_check_in: data.new_check_in,
          new_check_out: data.new_check_out,
          price_difference: priceDifference,
          host_initiated: true,
        },
        req,
      });

      try {
        let room = undefined;
        if (booking.room_id) {
          const { data: roomData } = await supabase
            .from("rooms")
            .select("*")
            .eq("id", booking.room_id)
            .single();
          room = (roomData as unknown as Room) || undefined;
        }

        const details = { booking, homestay, host, room };

        await sendDateChangeByHostEmail(
          details,
          oldCheckIn,
          oldCheckOut,
          data.new_check_in,
          data.new_check_out,
          newTotalPrice,
          "th",
          newAmountPaid,
        );
      } catch (error) {
        console.error("[HostChangeDates] Notification error (non-blocking):", error);
      }
    });

    return NextResponse.json({
      success: true,
      new_check_in: data.new_check_in,
      new_check_out: data.new_check_out,
      new_total_price: newTotalPrice,
      new_amount_paid: newAmountPaid,
      price_difference: priceDifference,
    });
  } catch (error) {
    console.error("[HostChangeDates] Error:", error);
    return NextResponse.json({ error: "Failed to change dates" }, { status: 500 });
  }
}
