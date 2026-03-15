import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendDateChangeLineNotification } from "@/lib/notifications";
import type { Booking, Homestay, Host, Room, RoomSeasonalPrice } from "@/types/database";
import { calculateTotalPrice } from "@/lib/calculate-price";
import { logEvent, EventType } from "@/lib/history-log";

const changeDatesSchema = z.object({
  booking_id: z.string().uuid(),
  new_check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  new_check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  new_room_id: z.string().uuid().optional(),
  preview: z.boolean().optional().default(false),
  // Slip verification data (required only when price increases)
  slip_hash: z.string().optional(),
  slip_trans_ref: z.string().nullable().optional(),
  payment_slip_url: z.string().nullable().optional(),
  easyslip_response: z.unknown().optional(),
  easyslip_verified: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = changeDatesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
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

    // Only confirmed bookings (not checked in) can change dates
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

    // Check for existing pending request
    const { data: existingReq } = await supabase
      .from("date_change_requests")
      .select("id")
      .eq("booking_id", data.booking_id)
      .eq("status", "pending")
      .limit(1);

    if (existingReq && existingReq.length > 0) {
      return NextResponse.json(
        { error: "PENDING_EXISTS", message: "A date change request is already pending" },
        { status: 409 }
      );
    }

    // Validate new dates
    const newCheckIn = new Date(data.new_check_in);
    const newCheckOut = new Date(data.new_check_out);
    const nights = Math.round((newCheckOut.getTime() - newCheckIn.getTime()) / (1000 * 60 * 60 * 24));

    if (nights <= 0) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    // Determine if room is changing
    const roomChanged = data.new_room_id && data.new_room_id !== booking.room_id;
    const targetRoomId = data.new_room_id || booking.room_id;

    // Same dates AND same room = no change needed
    if (data.new_check_in === booking.check_in && data.new_check_out === booking.check_out && !roomChanged) {
      return NextResponse.json({ error: "No changes requested" }, { status: 400 });
    }

    // If room changed, validate the new room belongs to same homestay
    if (roomChanged) {
      const { data: newRoomRow } = await supabase
        .from("rooms")
        .select("id, homestay_id")
        .eq("id", data.new_room_id!)
        .single();
      if (!newRoomRow || (newRoomRow as unknown as { homestay_id: string }).homestay_id !== booking.homestay_id) {
        return NextResponse.json({ error: "Invalid room" }, { status: 400 });
      }
    }

    // Recalculate price for new dates using target room
    let newTotalPrice = booking.total_price;
    if (targetRoomId) {
      const { data: roomRow } = await supabase
        .from("rooms")
        .select("price_per_night")
        .eq("id", targetRoomId)
        .single();

      if (!roomRow) {
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }

      const room = roomRow as unknown as { price_per_night: number };

      const { data: seasonRows } = await supabase
        .from("room_seasonal_prices")
        .select("*")
        .eq("room_id", targetRoomId);
      const seasons = (seasonRows as unknown as RoomSeasonalPrice[]) || [];

      const { total } = calculateTotalPrice(room.price_per_night, newCheckIn, newCheckOut, seasons);
      newTotalPrice = total;
    }

    const priceDifference = newTotalPrice - booking.total_price;

    // Preview mode: return price info without creating the request
    if (data.preview) {
      return NextResponse.json({
        preview: true,
        new_total_price: newTotalPrice,
        old_total_price: booking.total_price,
        price_difference: priceDifference,
        amount_paid: booking.amount_paid,
        payment_type: booking.payment_type,
      });
    }

    // If price increased, slip verification is required
    if (priceDifference > 0 && !data.slip_hash) {
      return NextResponse.json(
        { error: "PAYMENT_REQUIRED", message: "Additional payment is required for higher price", price_difference: priceDifference, new_total_price: newTotalPrice },
        { status: 402 }
      );
    }

    // Create the date change request
    const { data: requestRow, error: insertError } = await supabase
      .from("date_change_requests")
      .insert({
        booking_id: data.booking_id,
        old_check_in: booking.check_in,
        old_check_out: booking.check_out,
        new_check_in: data.new_check_in,
        new_check_out: data.new_check_out,
        old_total_price: booking.total_price,
        new_total_price: newTotalPrice,
        price_difference: priceDifference,
        status: "pending",
        requested_by: booking.guest_name,
        old_room_id: booking.room_id,
        new_room_id: targetRoomId,
        slip_hash: data.slip_hash || null,
        slip_trans_ref: data.slip_trans_ref || null,
        payment_slip_url: data.payment_slip_url || null,
        easyslip_response: data.easyslip_response || null,
        easyslip_verified: priceDifference > 0 ? (data.easyslip_verified || false) : false,
        created_by: booking.guest_name,
        updated_by: booking.guest_name,
      } as never)
      .select()
      .single();

    if (insertError) {
      console.error("[ChangeDates] Insert error:", insertError);
      return NextResponse.json({ error: "Failed to create date change request" }, { status: 500 });
    }

    // Log + notify host in background
    after(async () => {
      await logEvent({
        homestayId: booking.homestay_id,
        entityType: "booking",
        entityId: data.booking_id,
        eventType: EventType.BOOKING_DATE_CHANGE_REQUESTED,
        actorType: "guest",
        actorId: null,
        data: {
          request_id: (requestRow as { id: string }).id,
          guest_name: booking.guest_name,
          old_check_in: booking.check_in,
          old_check_out: booking.check_out,
          new_check_in: data.new_check_in,
          new_check_out: data.new_check_out,
          price_difference: priceDifference,
          old_room_id: booking.room_id,
          new_room_id: targetRoomId,
          room_changed: !!roomChanged,
        },
        req,
      });

      // Send LINE notification to host
      try {
        const { data: homestay } = await supabase
          .from("homestays")
          .select("*")
          .eq("id", booking.homestay_id)
          .single();

        if (!homestay) return;

        const { data: host } = await supabase
          .from("hosts")
          .select("*")
          .eq("id", (homestay as unknown as Homestay).host_id)
          .single();

        if (!host) return;

        let room = undefined;
        if (booking.room_id) {
          const { data: roomData } = await supabase
            .from("rooms")
            .select("*")
            .eq("id", booking.room_id)
            .single();
          room = (roomData as unknown as Room) || undefined;
        }

        let newRoom = undefined;
        if (roomChanged && targetRoomId) {
          const { data: newRoomData } = await supabase
            .from("rooms")
            .select("*")
            .eq("id", targetRoomId)
            .single();
          newRoom = (newRoomData as unknown as Room) || undefined;
        }

        const details = {
          booking,
          homestay: homestay as unknown as Homestay,
          host: host as unknown as Host,
          room,
        };

        await sendDateChangeLineNotification(
          details,
          booking.check_in,
          booking.check_out,
          data.new_check_in,
          data.new_check_out,
          priceDifference,
          newTotalPrice,
          roomChanged ? newRoom?.name : undefined,
        );
      } catch (error) {
        console.error("[ChangeDates] Notification error (non-blocking):", error);
      }
    });

    return NextResponse.json({
      success: true,
      request: requestRow,
      price_difference: priceDifference,
      new_total_price: newTotalPrice,
    }, { status: 201 });
  } catch (error) {
    console.error("[ChangeDates] Error:", error);
    return NextResponse.json({ error: "Failed to create date change request" }, { status: 500 });
  }
}
