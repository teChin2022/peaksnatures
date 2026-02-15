import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendBookingConfirmationEmail, sendHostLineNotification } from "@/lib/notifications";
import type { Booking, Homestay, Host, Room } from "@/types/database";

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
});

async function sendNotifications(bookingId: string, supabase: ReturnType<typeof createServiceRoleClient>) {
  try {
    const { data: booking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (!booking) return;

    const { data: homestay } = await supabase
      .from("homestays")
      .select("*")
      .eq("id", (booking as unknown as Booking).homestay_id)
      .single();

    if (!homestay) return;

    const { data: host } = await supabase
      .from("hosts")
      .select("*")
      .eq("id", (homestay as unknown as Homestay).host_id)
      .single();

    if (!host) return;

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

    const emailResult = await sendBookingConfirmationEmail(details);
    console.log("[Notification] Email result:", emailResult);

    const lineResult = await sendHostLineNotification(details, "confirmed");
    console.log("[Notification] LINE result:", lineResult);
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
      await sendNotifications(bookingId as string, supabase);

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
    await sendNotifications((booking as unknown as Booking).id, supabase);

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    console.error("Booking creation error:", error);
    return NextResponse.json(
      { error: "Failed to create booking" },
      { status: 500 }
    );
  }
}
