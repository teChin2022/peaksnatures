import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendDateChangeEmailToGuest } from "@/lib/notifications";
import type { Booking, Homestay, Host, Room } from "@/types/database";
import { logEvent, EventType } from "@/lib/history-log";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { request_id, reason } = body as { request_id: string; reason?: string };

    if (!request_id) {
      return NextResponse.json({ error: "request_id is required" }, { status: 400 });
    }

    // Verify host is authenticated
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Fetch the request
    const { data: requestRow, error: reqError } = await supabase
      .from("date_change_requests")
      .select("*")
      .eq("id", request_id)
      .eq("status", "pending")
      .single();

    if (reqError || !requestRow) {
      return NextResponse.json({ error: "Request not found or already processed" }, { status: 404 });
    }

    const dcr = requestRow as unknown as {
      id: string;
      booking_id: string;
      old_check_in: string;
      old_check_out: string;
      new_check_in: string;
      new_check_out: string;
      new_total_price: number;
      price_difference: number;
    };

    // Fetch booking to verify host ownership
    const { data: bookingRow } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", dcr.booking_id)
      .single();

    if (!bookingRow) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const booking = bookingRow as unknown as Booking;

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

    // Update request to rejected
    const updateData: Record<string, unknown> = {
      status: "rejected",
      updated_by: host.name,
    };
    if (reason) {
      updateData.reject_reason = reason;
    }

    const { error: updateError } = await supabase
      .from("date_change_requests")
      .update(updateData as never)
      .eq("id", request_id);

    if (updateError) {
      console.error("[RejectDateChange] Update error:", updateError);
      return NextResponse.json({ error: "Failed to reject date change" }, { status: 500 });
    }

    // Log + notify guest in background
    after(async () => {
      await logEvent({
        homestayId: booking.homestay_id,
        entityType: "booking",
        entityId: booking.id,
        eventType: EventType.BOOKING_DATE_CHANGE_REJECTED,
        actorType: "host",
        actorId: user.id,
        data: {
          request_id,
          old_check_in: dcr.old_check_in,
          old_check_out: dcr.old_check_out,
          new_check_in: dcr.new_check_in,
          new_check_out: dcr.new_check_out,
          ...(reason ? { reason } : {}),
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

        await sendDateChangeEmailToGuest(
          details,
          "rejected",
          dcr.old_check_in,
          dcr.old_check_out,
          dcr.new_check_in,
          dcr.new_check_out,
          dcr.new_total_price,
          "th",
          reason,
          undefined,
          room?.name,
        );
      } catch (error) {
        console.error("[RejectDateChange] Notification error (non-blocking):", error);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RejectDateChange] Error:", error);
    return NextResponse.json({ error: "Failed to reject date change" }, { status: 500 });
  }
}
