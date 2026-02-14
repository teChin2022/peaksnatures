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

    // Server-side overlap validation
    if (data.room_id) {
      // Fetch room quantity
      const { data: roomRow } = await supabase
        .from("rooms")
        .select("quantity")
        .eq("id", data.room_id)
        .single();
      const roomQuantity = (roomRow as { quantity: number } | null)?.quantity || 1;

      // Check overlapping active bookings for this room
      // Overlap: new_check_in < existing_check_out AND new_check_out > existing_check_in
      const { data: overlapping } = await supabase
        .from("bookings")
        .select("id, check_in, check_out")
        .eq("room_id", data.room_id)
        .in("status", ["pending", "confirmed", "verified"])
        .lt("check_in", data.check_out)
        .gt("check_out", data.check_in);

      const overlapCount = (overlapping as unknown[] | null)?.length || 0;
      if (overlapCount >= roomQuantity) {
        return NextResponse.json(
          { error: "Selected dates are no longer available for this room" },
          { status: 409 }
        );
      }
    }

    // Also check blocked dates
    const { data: blockedRows } = await supabase
      .from("blocked_dates")
      .select("date")
      .eq("homestay_id", data.homestay_id)
      .gte("date", data.check_in)
      .lt("date", data.check_out);

    if ((blockedRows as unknown[] | null)?.length) {
      return NextResponse.json(
        { error: "Some selected dates are blocked by the host" },
        { status: 409 }
      );
    }

    // Slip is already verified — create booking as confirmed
    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        homestay_id: data.homestay_id,
        room_id: data.room_id || null,
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

    // Send notifications (non-blocking)
    sendNotifications((booking as unknown as Booking).id, supabase);

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    console.error("Booking creation error:", error);
    return NextResponse.json(
      { error: "Failed to create booking" },
      { status: 500 }
    );
  }
}
