import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendHostCancellationLineNotification } from "@/lib/notifications";
import type { Booking, Homestay, Host, Room } from "@/types/database";
import { logEvent, EventType } from "@/lib/history-log";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { booking_id, reason } = body as {
      booking_id: string;
      reason?: string;
    };

    if (!booking_id) {
      return NextResponse.json(
        { error: "booking_id is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Fetch the booking
    const { data: bookingRow, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .single();

    if (bookingError || !bookingRow) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    const booking = bookingRow as unknown as Booking;

    // Only confirmed bookings can be cancelled by guest
    if (booking.status !== "confirmed") {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "Only confirmed bookings can be cancelled by guest" },
        { status: 400 }
      );
    }

    // Fetch host's cancellation_days via homestay → host
    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("*, host_id")
      .eq("id", booking.homestay_id)
      .single();

    if (!homestayRow) {
      return NextResponse.json(
        { error: "Homestay not found" },
        { status: 404 }
      );
    }

    const homestay = homestayRow as unknown as Homestay;

    const { data: hostRow } = await supabase
      .from("hosts")
      .select("*")
      .eq("id", homestay.host_id)
      .single();

    if (!hostRow) {
      return NextResponse.json(
        { error: "Host not found" },
        { status: 404 }
      );
    }

    const host = hostRow as unknown as Host;
    const cancellationDays = host.cancellation_days || 0;

    // Check if cancellation is enabled
    if (cancellationDays <= 0) {
      return NextResponse.json(
        { error: "CANCELLATION_DISABLED", message: "Guest cancellation is not enabled for this homestay" },
        { status: 403 }
      );
    }

    // Check if within cancellation window
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkInDate = new Date(booking.check_in);
    checkInDate.setHours(0, 0, 0, 0);
    const daysUntilCheckIn = Math.floor((checkInDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilCheckIn < cancellationDays) {
      return NextResponse.json(
        {
          error: "TOO_LATE",
          message: `Cancellation must be at least ${cancellationDays} days before check-in`,
          cancellation_days: cancellationDays,
        },
        { status: 403 }
      );
    }

    // Cancel the booking
    const updateData: Record<string, unknown> = {
      status: "cancelled",
      cancelled_by: "guest",
      cancelled_at: new Date().toISOString(),
      updated_by: "guest",
    };
    if (reason) {
      updateData.cancel_reason = reason;
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update(updateData as never)
      .eq("id", booking_id);

    if (updateError) {
      console.error("[GuestCancel] Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to cancel booking" },
        { status: 500 }
      );
    }

    // Log + notify host in background
    after(async () => {
      await logEvent({
        homestayId: booking.homestay_id,
        entityType: "booking",
        entityId: booking_id,
        eventType: EventType.BOOKING_CANCELLED,
        actorType: "guest",
        actorId: null,
        data: { guest_name: booking.guest_name, ...(reason ? { reason } : {}) },
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

        const lineResult = await sendHostCancellationLineNotification(details, reason);
        console.log("[GuestCancel] LINE notification result:", lineResult);
      } catch (error) {
        console.error("[GuestCancel] Notification error (non-blocking):", error);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[GuestCancel] Error:", error);
    return NextResponse.json(
      { error: "Failed to cancel booking" },
      { status: 500 }
    );
  }
}
