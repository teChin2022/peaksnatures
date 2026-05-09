import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendDateChangeLineNotification, sendDateChangeSmsNotification, dispatchHostNotification, buildDateChangeMessage } from "@/lib/notifications";
import type { Booking, Homestay, Host, Room, RoomSeasonalPrice } from "@/types/database";
import { calculateTotalPrice } from "@/lib/calculate-price";
import { getDepositForMonth } from "@/lib/get-deposit";
import { logEvent, EventType } from "@/lib/history-log";

const changeDatesSchema = z.object({
  booking_id: z.string().uuid(),
  new_check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  new_check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  new_room_id: z.string().uuid().optional(),
  payment_option: z.enum(["full", "deposit"]).optional(),
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

    // --- Parallel Batch 1: availability checks + room info + seasonal prices ---
    // All queries below are independent and can run simultaneously
    let newTotalPrice = booking.total_price;
    let newDiscountAmount = booking.discount_amount || 0;
    if (targetRoomId) {
      const [
        { data: roomInfoRow },
        { data: overlappingBookings },
        { data: blockedRows },
        { data: activeHolds },
        { data: pendingDcrs },
        { data: seasonRows },
      ] = await Promise.all([
        // Room quantity + price in one query
        supabase.from("rooms").select("quantity, price_per_night").eq("id", targetRoomId).single(),
        // Overlapping confirmed bookings
        supabase.from("bookings").select("id").eq("room_id", targetRoomId).in("status", ["pending", "confirmed", "verified"]).lt("check_in", data.new_check_out).gt("check_out", data.new_check_in),
        // Blocked dates
        supabase.from("blocked_dates").select("date").eq("homestay_id", booking.homestay_id).or(`room_id.eq.${targetRoomId},room_id.is.null`).gte("date", data.new_check_in).lt("date", data.new_check_out),
        // Active holds
        supabase.from("booking_holds").select("id").eq("room_id", targetRoomId).gt("expires_at", new Date().toISOString()).lt("check_in", data.new_check_out).gt("check_out", data.new_check_in),
        // Pending date change requests on same room
        supabase.from("date_change_requests").select("id").eq("status", "pending").eq("new_room_id", targetRoomId).neq("booking_id", data.booking_id).lt("new_check_in", data.new_check_out).gt("new_check_out", data.new_check_in),
        // Seasonal prices for price calculation
        supabase.from("room_seasonal_prices").select("*").eq("room_id", targetRoomId),
      ]);

      const roomInfo = roomInfoRow as unknown as { quantity: number; price_per_night: number } | null;
      if (!roomInfo) {
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }

      const roomQty = roomInfo.quantity || 1;

      // Count overlapping bookings (exclude own booking if same room)
      let bookingCount = (overlappingBookings || []).length;
      if (!roomChanged && overlappingBookings) {
        const ownOverlap = (overlappingBookings as { id: string }[]).find((b) => b.id === booking.id);
        if (ownOverlap) bookingCount -= 1;
      }

      if (bookingCount >= roomQty) {
        return NextResponse.json(
          { error: "DATES_UNAVAILABLE", message: "Selected dates are no longer available for this room" },
          { status: 409 }
        );
      }

      if (blockedRows && blockedRows.length > 0) {
        return NextResponse.json(
          { error: "DATES_BLOCKED", message: "Some selected dates are blocked by the host" },
          { status: 409 }
        );
      }

      const totalConflicts = bookingCount + (activeHolds || []).length + (pendingDcrs || []).length;
      if (totalConflicts >= roomQty) {
        return NextResponse.json(
          { error: "DATES_UNAVAILABLE", message: "Selected dates are no longer available for this room" },
          { status: 409 }
        );
      }

      // Calculate price using room info + seasonal prices from parallel batch
      const seasons = (seasonRows as unknown as RoomSeasonalPrice[]) || [];
      const { total } = calculateTotalPrice(roomInfo.price_per_night, newCheckIn, newCheckOut, seasons);
      // Recalculate options per new nights (fetch fresh per-night prices from DB)
      const optionIds = Array.isArray(booking.selected_options)
        ? (booking.selected_options as { id: string }[]).map((o) => o.id).filter(Boolean)
        : [];
      let optionsSum = 0;
      if (optionIds.length > 0) {
        const { data: freshOptions } = await supabase
          .from("room_options")
          .select("id, price")
          .in("id", optionIds);
        const newNights = Math.round((newCheckOut.getTime() - newCheckIn.getTime()) / (1000 * 60 * 60 * 24));
        optionsSum = (freshOptions as { id: string; price: number }[] || []).reduce((s, o) => s + o.price * newNights, 0);
      }
      // Preserve the original promo discount (locked-in at the original booking
      // time). Cap it at the new subtotal so it can never make the total negative,
      // which guarantees the guest still owes ≥ 0.
      const newSubtotal = total + optionsSum;
      newDiscountAmount = Math.min(booking.discount_amount || 0, newSubtotal);
      newTotalPrice = Math.max(0, newSubtotal - newDiscountAmount);
    }

    const priceDifference = newTotalPrice - booking.total_price;

    // --- Deposit config (conditional, single joined query) ---
    let newDeposit = 0;
    const fullOutstanding = Math.max(0, newTotalPrice - booking.amount_paid);

    if (booking.payment_type === "deposit") {
      const { data: depositRow } = await supabase
        .from("homestays")
        .select("hosts(deposit_amount, deposit_by_month)")
        .eq("id", booking.homestay_id)
        .single();
      const hostDeposit = (depositRow as unknown as { hosts: { deposit_amount: number; deposit_by_month: Record<string, number> | null } | null })?.hosts;
      if (hostDeposit) {
        newDeposit = getDepositForMonth(hostDeposit, newCheckIn);
      }
    }

    // Determine additional payment based on payment option
    const depositAvailable = booking.payment_type === "deposit" && newDeposit > 0 && newDeposit < newTotalPrice;
    const paymentOption = data.payment_option || (depositAvailable ? "deposit" : "full");
    let additionalPayment: number;
    if (paymentOption === "deposit" && depositAvailable) {
      additionalPayment = Math.max(0, newDeposit - booking.amount_paid);
    } else {
      additionalPayment = fullOutstanding;
    }

    // Preview mode: return price info without creating the request
    if (data.preview) {
      return NextResponse.json({
        preview: true,
        new_total_price: newTotalPrice,
        old_total_price: booking.total_price,
        price_difference: priceDifference,
        additional_payment: additionalPayment,
        amount_paid: booking.amount_paid,
        payment_type: booking.payment_type,
        deposit_available: depositAvailable,
        new_deposit: newDeposit,
        full_outstanding: fullOutstanding,
      });
    }

    // If additional payment is required, slip verification is needed
    if (additionalPayment > 0 && !data.slip_hash) {
      return NextResponse.json(
        { error: "PAYMENT_REQUIRED", message: "Additional payment is required", price_difference: priceDifference, additional_payment: additionalPayment, new_total_price: newTotalPrice, amount_paid: booking.amount_paid, deposit_available: depositAvailable, new_deposit: newDeposit, full_outstanding: fullOutstanding },
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
        new_discount_amount: newDiscountAmount,
        price_difference: priceDifference,
        additional_payment: additionalPayment,
        status: "pending",
        requested_by: booking.guest_name,
        old_room_id: booking.room_id,
        new_room_id: targetRoomId,
        slip_hash: data.slip_hash || null,
        slip_trans_ref: data.slip_trans_ref || null,
        payment_slip_url: data.payment_slip_url || null,
        easyslip_response: data.easyslip_response || null,
        easyslip_verified: additionalPayment > 0 ? (data.easyslip_verified || false) : false,
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

        await dispatchHostNotification(
          details,
          () => sendDateChangeSmsNotification(
            details,
            booking.check_in,
            booking.check_out,
            data.new_check_in,
            data.new_check_out,
            priceDifference,
            newTotalPrice,
            roomChanged ? newRoom?.name : undefined,
          ),
          () => sendDateChangeLineNotification(
            details,
            booking.check_in,
            booking.check_out,
            data.new_check_in,
            data.new_check_out,
            priceDifference,
            newTotalPrice,
            roomChanged ? newRoom?.name : undefined,
            {
              amountPaid: booking.amount_paid,
              additionalPayment,
              paymentOption,
              depositAvailable,
              newDeposit,
              fullOutstanding,
              paymentType: booking.payment_type,
            },
          ),
          `แขกขอเปลี่ยนวันเข้าพัก`,
          () => buildDateChangeMessage(
            details,
            booking.check_in,
            booking.check_out,
            data.new_check_in,
            data.new_check_out,
            priceDifference,
            newTotalPrice,
            roomChanged ? newRoom?.name : undefined,
            {
              amountPaid: booking.amount_paid,
              additionalPayment,
              paymentOption,
              depositAvailable,
              newDeposit,
              fullOutstanding,
              paymentType: booking.payment_type,
            },
          ),
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
