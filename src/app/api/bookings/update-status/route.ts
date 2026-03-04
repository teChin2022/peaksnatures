import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendBookingStatusUpdateEmail } from "@/lib/notifications";
import type { Booking, Homestay, Host, Room } from "@/types/database";

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

    // Only pending or verified bookings can be confirmed/cancelled via this route
    if (booking.status !== "pending" && booking.status !== "verified") {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "Only pending or verified bookings can be updated" },
        { status: 400 }
      );
    }

    // Update the booking status
    const updateData: Record<string, unknown> = { status };
    if (status === "cancelled" && reason) {
      updateData.cancel_reason = reason;
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

    // Send guest email notification in background
    after(async () => {
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

        let room = null;
        if (booking.room_id) {
          const { data: roomData } = await supabase
            .from("rooms")
            .select("*")
            .eq("id", booking.room_id)
            .single();
          room = roomData;
        }

        const details = {
          booking,
          homestay: homestay as unknown as Homestay,
          host: host as unknown as Host,
          room: (room as unknown as Room) || undefined,
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

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("[UpdateStatus] Error:", error);
    return NextResponse.json(
      { error: "Failed to update booking status" },
      { status: 500 }
    );
  }
}
