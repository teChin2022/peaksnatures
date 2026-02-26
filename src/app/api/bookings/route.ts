import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendBookingConfirmationEmail, sendHostLineNotification, sendHostPushNotification } from "@/lib/notifications";
import type { Booking, Homestay, Host, Room, RoomSeasonalPrice } from "@/types/database";
import { calculateTotalPrice } from "@/lib/calculate-price";

const bookingSchema = z.object({
  homestay_id: z.string().uuid(),
  room_id: z.string().uuid().optional(),
  guest_name: z.string().min(1, "Name is required"),
  guest_email: z.string().email("Valid email required"),
  guest_phone: z.string().min(1, "Phone is required"),
  guest_province: z.string().optional(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  num_guests: z.number().int().min(1),
  total_price: z.number().int().min(0),
  // Slip verification data (required — slip must be verified before booking)
  slip_hash: z.string().min(1, "Slip hash is required"),
  slip_trans_ref: z.string().nullable().optional(),
  payment_slip_url: z.string().nullable().optional(),
  easyslip_response: z.unknown().optional(),
  // Session ID for hold cleanup
  session_id: z.string().optional(),
  notes: z.string().optional(),
  locale: z.string().optional(),
  payment_type: z.enum(["full", "deposit"]).optional().default("full"),
  amount_paid: z.number().int().min(0).optional(),
});

async function sendNotifications(bookingId: string, supabase: ReturnType<typeof createServiceRoleClient>, locale: string = "th") {
  console.log(`[Notification] Starting for booking ${bookingId}, locale=${locale}`);
  try {
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (!booking) { console.error("[Notification] Booking not found:", bookingId, bookingErr); return; }

    const { data: homestay, error: homestayErr } = await supabase
      .from("homestays")
      .select("*")
      .eq("id", (booking as unknown as Booking).homestay_id)
      .single();

    if (!homestay) { console.error("[Notification] Homestay not found:", (booking as unknown as Booking).homestay_id, homestayErr); return; }

    const { data: host, error: hostErr } = await supabase
      .from("hosts")
      .select("*")
      .eq("id", (homestay as unknown as Homestay).host_id)
      .single();

    if (!host) { console.error("[Notification] Host not found:", (homestay as unknown as Homestay).host_id, hostErr); return; }

    let room = null;
    if ((booking as unknown as Booking).room_id) {
      const { data: roomData } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", (booking as unknown as Booking).room_id!)
        .single();
      room = roomData;
    }

    const details = {
      booking: booking as unknown as Booking,
      homestay: homestay as unknown as Homestay,
      host: host as unknown as Host,
      room: (room as unknown as Room) || undefined,
    };

    const emailResult = await sendBookingConfirmationEmail(details, locale);
    console.log("[Notification] Email result:", emailResult);

    // Host notification: dispatch based on notification_preference
    const preference = (host as unknown as Host).notification_preference || "push";
    console.log(`[Notification] Host preference: ${preference}`);

    if (preference === "push" || preference === "both") {
      const pushResult = await sendHostPushNotification(details, "confirmed");
      console.log("[Notification] Push result:", pushResult);
    }

    if (preference === "line" || preference === "both") {
      const lineResult = await sendHostLineNotification(details, "confirmed");
      console.log("[Notification] LINE result:", lineResult);
    }
  } catch (error) {
    console.error("Notification error (non-blocking):", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = bookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid booking data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const supabase = createServiceRoleClient();

    // Server-side price verification: never trust client-supplied total_price
    if (data.room_id) {
      const { data: roomRow, error: roomError } = await supabase
        .from("rooms")
        .select("price_per_night")
        .eq("id", data.room_id)
        .single();

      if (roomError || !roomRow) {
        return NextResponse.json(
          { error: "Room not found" },
          { status: 404 }
        );
      }

      const room = roomRow as unknown as { price_per_night: number };
      const checkIn = new Date(data.check_in);
      const checkOut = new Date(data.check_out);
      const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

      if (nights <= 0) {
        return NextResponse.json(
          { error: "Invalid date range" },
          { status: 400 }
        );
      }

      // Fetch seasonal prices for this room
      const { data: seasonRows } = await supabase
        .from("room_seasonal_prices")
        .select("*")
        .eq("room_id", data.room_id);
      const seasons = (seasonRows as unknown as RoomSeasonalPrice[]) || [];

      const { total: serverPrice } = calculateTotalPrice(room.price_per_night, checkIn, checkOut, seasons);
      if (data.total_price !== serverPrice) {
        console.warn(`[Security] Price mismatch: client=${data.total_price}, server=${serverPrice}`);
        data.total_price = serverPrice;
      }
    }

    // Validate payment_type and amount_paid
    if (data.payment_type === "deposit") {
      // Fetch host deposit_amount for validation
      const { data: homestayRow } = await supabase
        .from("homestays")
        .select("host_id")
        .eq("id", data.homestay_id)
        .single();

      if (homestayRow) {
        const { data: hostRow } = await supabase
          .from("hosts")
          .select("deposit_amount")
          .eq("id", (homestayRow as unknown as { host_id: string }).host_id)
          .single();

        const hostDeposit = (hostRow as unknown as { deposit_amount: number } | null)?.deposit_amount || 0;
        if (hostDeposit <= 0) {
          return NextResponse.json(
            { error: "Deposit payment is not enabled for this homestay" },
            { status: 400 }
          );
        }
        // Server enforces the host's deposit amount
        data.amount_paid = hostDeposit;
      }
    } else {
      // Full payment: amount_paid = total_price
      data.amount_paid = data.total_price;
    }

    // Atomic booking creation: checks overlap + blocked dates + inserts in one transaction
    if (data.room_id) {
      const { data: bookingId, error: rpcError } = await supabase.rpc(
        "create_booking_atomic" as never,
        {
          p_homestay_id: data.homestay_id,
          p_room_id: data.room_id,
          p_guest_name: data.guest_name,
          p_guest_email: data.guest_email,
          p_guest_phone: data.guest_phone,
          p_guest_province: data.guest_province || null,
          p_check_in: data.check_in,
          p_check_out: data.check_out,
          p_num_guests: data.num_guests,
          p_total_price: data.total_price,
          p_status: "confirmed",
          p_easyslip_verified: true,
          p_payment_slip_hash: data.slip_hash,
          p_slip_trans_ref: data.slip_trans_ref || null,
          p_payment_slip_url: data.payment_slip_url || null,
          p_easyslip_response: data.easyslip_response || null,
          p_session_id: data.session_id || null,
          p_notes: data.notes || null,
          p_payment_type: data.payment_type || "full",
          p_amount_paid: data.amount_paid || data.total_price,
        } as never
      );

      if (rpcError) {
        console.error("Atomic booking error:", rpcError);

        if (rpcError.message?.includes("DATES_UNAVAILABLE")) {
          return NextResponse.json(
            { error: "Selected dates are no longer available for this room" },
            { status: 409 }
          );
        }
        if (rpcError.message?.includes("DATES_BLOCKED")) {
          return NextResponse.json(
            { error: "Some selected dates are blocked by the host" },
            { status: 409 }
          );
        }
        if (rpcError.message?.includes("ROOM_NOT_FOUND")) {
          return NextResponse.json(
            { error: "Room not found" },
            { status: 404 }
          );
        }

        return NextResponse.json(
          { error: "Failed to create booking" },
          { status: 500 }
        );
      }

      // Fetch the created booking for the response
      const { data: booking } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId as string)
        .single();

      // Send notifications (must await — serverless context terminates after response)
      await sendNotifications(bookingId as string, supabase, data.locale || "th");

      return NextResponse.json({ booking }, { status: 201 });
    }

    // Fallback for bookings without a room_id (shouldn't happen in normal flow)
    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        homestay_id: data.homestay_id,
        room_id: null,
        guest_name: data.guest_name,
        guest_email: data.guest_email,
        guest_phone: data.guest_phone,
        guest_province: data.guest_province || null,
        check_in: data.check_in,
        check_out: data.check_out,
        num_guests: data.num_guests,
        total_price: data.total_price,
        status: "confirmed",
        easyslip_verified: true,
        payment_slip_hash: data.slip_hash,
        slip_trans_ref: data.slip_trans_ref || null,
        payment_slip_url: data.payment_slip_url || null,
        easyslip_response: data.easyslip_response || null,
        notes: data.notes || null,
        payment_type: data.payment_type || "full",
        amount_paid: data.amount_paid || data.total_price,
      } as never)
      .select()
      .single();

    if (error) {
      console.error("Supabase booking insert error:", error);
      return NextResponse.json(
        { error: "Failed to create booking" },
        { status: 500 }
      );
    }

    // Send notifications (must await — serverless context terminates after response)
    await sendNotifications((booking as unknown as Booking).id, supabase, data.locale || "th");

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    console.error("Booking creation error:", error);
    return NextResponse.json(
      { error: "Failed to create booking" },
      { status: 500 }
    );
  }
}
