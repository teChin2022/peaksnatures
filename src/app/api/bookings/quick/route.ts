import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";
import { computeRoomRateTotal } from "@/lib/booking-pricing";
import { deductCommission } from "@/lib/billing";

const quickBookingSchema = z.object({
  homestay_id: z.string().uuid(),
  room_id: z.string().uuid(),
  guest_name: z.string().min(1, "Name is required"),
  guest_email: z.string().email().optional().or(z.literal("")),
  guest_phone: z.string().min(1, "Phone is required"),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  num_guests: z.number().int().min(1),
  total_price: z.number().int().min(0).optional().default(0),
  booking_source: z.string().optional().default("other"),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const userClient = await createServerSupabaseClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = quickBookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid booking data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const supabase = createServiceRoleClient();

    // Verify host owns the homestay
    const { data: hostRow } = await supabase
      .from("hosts")
      .select("id, name")
      .eq("user_id", user.id)
      .single();

    if (!hostRow) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const host = hostRow as { id: string; name: string };

    // Check if host is soft-blocked
    const [{ isHostBlocked }, { getHostBlockState }] = await Promise.all([
      import("@/lib/plan-expiry"),
      import("@/lib/billing"),
    ]);
    const blockState = await getHostBlockState(host.id);
    if (blockState && isHostBlocked(blockState)) {
      return NextResponse.json(
        { error: "Your account is temporarily blocked. Please settle billing to continue." },
        { status: 403 }
      );
    }

    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("id")
      .eq("id", data.homestay_id)
      .eq("host_id", host.id)
      .single();

    if (!homestayRow) {
      return NextResponse.json({ error: "Homestay not found or not owned by host" }, { status: 403 });
    }

    // Validate dates
    const checkIn = new Date(data.check_in);
    const checkOut = new Date(data.check_out);
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    if (nights <= 0) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    // Check for active booking holds from other sessions
    const { count: holdCount } = await supabase
      .from("booking_holds")
      .select("id", { count: "exact", head: true })
      .eq("room_id", data.room_id)
      .lt("check_in", data.check_out)
      .gt("check_out", data.check_in)
      .gt("expires_at", new Date().toISOString());

    if (holdCount && holdCount > 0) {
      // Check if holds + existing bookings >= room quantity
      const [{ count: bookingCount }, { data: roomRow }] = await Promise.all([
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("room_id", data.room_id)
          .in("status", ["pending", "confirmed", "verified"])
          .lt("check_in", data.check_out)
          .gt("check_out", data.check_in),
        supabase
          .from("rooms")
          .select("quantity")
          .eq("id", data.room_id)
          .single(),
      ]);

      const quantity = (roomRow as { quantity: number } | null)?.quantity || 0;
      if ((bookingCount || 0) + holdCount >= quantity) {
        return NextResponse.json(
          { error: "DATES_HELD", message: "These dates are currently being booked by a guest." },
          { status: 409 }
        );
      }
    }

    // Use atomic RPC — overlap/blocked checks as regular bookings
    const { data: bookingId, error: rpcError } = await supabase.rpc(
      "create_booking_atomic" as never,
      {
        p_homestay_id: data.homestay_id,
        p_room_id: data.room_id,
        p_guest_name: data.guest_name,
        p_guest_email: data.guest_email || "",
        p_guest_phone: data.guest_phone,
        p_guest_province: null,
        p_check_in: data.check_in,
        p_check_out: data.check_out,
        p_num_guests: data.num_guests,
        p_total_price: data.total_price,
        p_status: "confirmed",
        p_easyslip_verified: true,
        p_payment_slip_hash: `quick_${Date.now()}`,
        p_slip_trans_ref: null,
        p_payment_slip_url: null,
        p_easyslip_response: null,
        p_session_id: null,
        p_notes: data.notes || null,
        p_payment_type: "full",
        p_amount_paid: data.total_price,
        p_created_by: host.name,
        p_selected_options: [],
        p_booking_source: data.booking_source,
        p_discount_amount: 0,
      } as never
    );

    if (rpcError) {
      console.error("Quick booking error:", rpcError);

      if (rpcError.message?.includes("DATES_UNAVAILABLE")) {
        return NextResponse.json(
          { error: "DATES_UNAVAILABLE" },
          { status: 409 }
        );
      }
      if (rpcError.message?.includes("DATES_BLOCKED")) {
        return NextResponse.json(
          { error: "DATES_BLOCKED" },
          { status: 409 }
        );
      }
      if (rpcError.message?.includes("ROOM_NOT_FOUND")) {
        return NextResponse.json(
          { error: "ROOM_NOT_FOUND" },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: "Failed to create booking" },
        { status: 500 }
      );
    }

    // Commission base: the room's own configured rate for these dates, not the
    // host-entered total_price (an OTA/walk-in figure that defaults to 0). Stored
    // on the row so a retry from the billing queue reuses the same base.
    const commissionBase = await computeRoomRateTotal(
      supabase,
      data.room_id,
      data.check_in,
      data.check_out,
    );
    const hasBase = Boolean(commissionBase && commissionBase > 0);
    if (hasBase) {
      const { error: baseError } = await supabase
        .from("bookings")
        .update({ commission_base: commissionBase } as never)
        .eq("id", bookingId as string);
      if (baseError) {
        // Not fatal — the base is passed to deductCommission directly below, so
        // this booking is still charged correctly. Only a later retry would
        // lose it, hence the loud log.
        console.error("[QuickBooking] Failed to persist commission_base:", baseError);
      }
    } else {
      console.warn("[QuickBooking] No room rate resolved; commission falls back to total_price", {
        booking_id: bookingId,
        room_id: data.room_id,
      });
    }

    // Commission deduction is financial — run synchronously before responding,
    // matching POST /api/bookings. No-ops for free and fixed-rate hosts.
    await deductCommission(bookingId as string, hasBase ? commissionBase! : undefined);

    // Fetch created booking
    const { data: booking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId as string)
      .single();

    // Log event
    try {
      await logEvent({
        entityType: "booking",
        entityId: bookingId as string,
        eventType: EventType.BOOKING_CONFIRMED,
        actorType: "host",
        actorId: user.id,
        data: {
          booking_source: data.booking_source,
          guest_name: data.guest_name,
          check_in: data.check_in,
          check_out: data.check_out,
          quick_booking: true,
        },
      });
    } catch (logErr) {
      console.error("Log error (non-blocking):", logErr);
    }

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    console.error("Quick booking error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
