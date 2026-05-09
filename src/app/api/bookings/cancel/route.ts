import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendHostCancellationLineNotification, sendHostCancellationSmsNotification, dispatchHostNotification, buildCancellationMessage } from "@/lib/notifications";
import type { Booking, Homestay, Host, Room } from "@/types/database";
import { logEvent, EventType } from "@/lib/history-log";
import { refundCommission } from "@/lib/billing";
import { cancelRedemptionForBooking } from "@/lib/promo-redemptions-server";

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

    // Fetch host's cancellation_days via joined query (homestay + host in one call)
    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("*, hosts(*)")
      .eq("id", booking.homestay_id)
      .single();

    if (!homestayRow) {
      return NextResponse.json(
        { error: "Homestay not found" },
        { status: 404 }
      );
    }

    const joined = homestayRow as unknown as Homestay & { hosts: Host | null };
    const homestay = { ...joined } as unknown as Homestay;
    const host = joined.hosts;

    if (!host) {
      return NextResponse.json(
        { error: "Host not found" },
        { status: 404 }
      );
    }
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
      cancelled_by: booking.guest_name,
      cancelled_at: new Date().toISOString(),
      updated_by: booking.guest_name,
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

    // Auto-reject any pending date change requests for this booking
    await supabase
      .from("date_change_requests")
      .update({ status: "rejected", reject_reason: "Booking cancelled", updated_by: booking.guest_name } as never)
      .eq("booking_id", booking_id)
      .eq("status", "pending");

    // Cancel any pending recommender commission for this booking
    await cancelRedemptionForBooking(supabase, booking_id, booking.guest_name);

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

      await refundCommission(booking_id);

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

        await dispatchHostNotification(
          details,
          () => sendHostCancellationSmsNotification(details),
          () => sendHostCancellationLineNotification(details, reason),
          `แขกยกเลิกการจอง`,
          () => buildCancellationMessage(details, reason),
        );
      } catch (error) {
        console.error("[GuestCancel] Notification error (non-blocking):", error);
      }
    });

    revalidateTag("admin-stats", "max");
    revalidateTag(`booking-availability:${booking.homestay_id}`, "max");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[GuestCancel] Error:", error);
    return NextResponse.json(
      { error: "Failed to cancel booking" },
      { status: 500 }
    );
  }
}
