import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendBookingStatusUpdateEmail } from "@/lib/notifications";
import type { Booking, Homestay, Host, Room } from "@/types/database";
import { logEvent, EventType } from "@/lib/history-log";
import { deductCommission, refundCommission } from "@/lib/billing";
import { cancelRedemptionForBooking } from "@/lib/promo-redemptions-server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { booking_id, status, reason, locale } = body as {
      booking_id: string;
      status: "confirmed" | "cancelled";
      reason?: string;
      locale?: string;
    };

    if (!booking_id || !status || !["confirmed", "cancelled"].includes(status)) {
      return NextResponse.json(
        { error: "booking_id and status (confirmed|cancelled) are required" },
        { status: 400 }
      );
    }

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
      .eq("id", booking_id)
      .single();

    if (bookingError || !bookingRow) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    const booking = bookingRow as unknown as Booking;

    // Confirmed bookings can only be cancelled (not re-confirmed)
    if (booking.status === "confirmed" && status !== "cancelled") {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "Confirmed bookings can only be cancelled" },
        { status: 400 }
      );
    }

    // Only pending, verified, or confirmed bookings can be updated via this route
    if (booking.status !== "pending" && booking.status !== "verified" && booking.status !== "confirmed") {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "Only pending, verified, or confirmed bookings can be updated" },
        { status: 400 }
      );
    }

    // Fetch host and verify ownership
    const { data: hsRow } = await supabase
      .from("homestays")
      .select("host_id, hosts(id, name, user_id)")
      .eq("id", booking.homestay_id)
      .single();
    const hostData = (hsRow as unknown as { host_id: string; hosts: { id: string; name: string; user_id: string } | null } | null)?.hosts;
    const hostName = hostData?.name || "host";

    if (!hostData || hostData.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update the booking status
    const updateData: Record<string, unknown> = { status, updated_by: hostName };
    if (status === "cancelled") {
      updateData.cancelled_by = hostName;
      updateData.cancelled_at = new Date().toISOString();
      if (reason) {
        updateData.cancel_reason = reason;
      }
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update(updateData as never)
      .eq("id", booking_id);

    if (updateError) {
      console.error("[UpdateStatus] Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update booking status" },
        { status: 500 }
      );
    }

    // Auto-reject any pending date change requests when booking is cancelled
    if (status === "cancelled") {
      await supabase
        .from("date_change_requests")
        .update({ status: "rejected", reject_reason: "Booking cancelled by host", updated_by: hostName } as never)
        .eq("booking_id", booking_id)
        .eq("status", "pending");

      // Cancel any pending recommender commission for this booking
      await cancelRedemptionForBooking(supabase, booking_id, hostName);
    }

    // Log event + send guest email notification in background.
    // Commission deduction/refund runs before email so a slow guest-email
    // send can't starve the wallet operation out of the after() time budget.
    after(async () => {
      await logEvent({
        homestayId: booking.homestay_id,
        entityType: "booking",
        entityId: booking_id,
        eventType: status === "confirmed" ? EventType.BOOKING_CONFIRMED : EventType.BOOKING_CANCELLED,
        actorType: "host",
        actorId: user.id,
        data: { previous_status: booking.status, new_status: status, ...(reason ? { reason } : {}) },
        req,
      });

      // Commission handling — must run before notifications
      if (status === "confirmed") {
        await deductCommission(booking_id);
      } else if (status === "cancelled" && booking.status === "confirmed") {
        await refundCommission(booking_id);
      }

      try {
        // Parallel: homestay+host (joined) + room
        const [{ data: hsJoined }, roomResult] = await Promise.all([
          supabase.from("homestays").select("*, hosts(*)").eq("id", booking.homestay_id).single(),
          booking.room_id
            ? supabase.from("rooms").select("*").eq("id", booking.room_id).single()
            : Promise.resolve({ data: null }),
        ]);

        if (!hsJoined) return;
        const hsData = hsJoined as unknown as Homestay & { hosts: Host | null };
        if (!hsData.hosts) return;

        const details = {
          booking,
          homestay: hsData as unknown as Homestay,
          host: hsData.hosts,
          room: (roomResult.data as unknown as Room) || undefined,
        };

        const emailResult = await sendBookingStatusUpdateEmail(
          details,
          status,
          locale || "th",
          reason
        );
        console.log("[UpdateStatus] Email result:", emailResult);
      } catch (error) {
        console.error("[UpdateStatus] Notification error (non-blocking):", error);
      }
    });

    revalidateTag("admin-stats", "max");
    revalidateTag(`booking-availability:${booking.homestay_id}`, "max");
    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("[UpdateStatus] Error:", error);
    return NextResponse.json(
      { error: "Failed to update booking status" },
      { status: 500 }
    );
  }
}
