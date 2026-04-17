import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logEvent, EventType } from "@/lib/history-log";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { booking_id } = body as { booking_id?: string };

    if (!booking_id) {
      return NextResponse.json({ error: "booking_id is required" }, { status: 400 });
    }

    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: bookingRow, error: bookingError } = await supabase
      .from("bookings")
      .select("id, homestay_id, status, checked_in_at")
      .eq("id", booking_id)
      .single();

    if (bookingError || !bookingRow) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const booking = bookingRow as unknown as {
      id: string;
      homestay_id: string;
      status: string;
      checked_in_at: string | null;
    };

    const { data: hsRow } = await supabase
      .from("homestays")
      .select("host_id, hosts(id, name, user_id)")
      .eq("id", booking.homestay_id)
      .single();
    const hostData = (hsRow as unknown as { host_id: string; hosts: { id: string; name: string; user_id: string } | null } | null)?.hosts;

    if (!hostData || hostData.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (booking.status !== "confirmed" && booking.status !== "completed") {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: "Only confirmed bookings can be checked in" },
        { status: 400 }
      );
    }

    if (booking.checked_in_at) {
      return NextResponse.json(
        { error: "ALREADY_CHECKED_IN", message: "Already checked in", checked_in_at: booking.checked_in_at },
        { status: 409 }
      );
    }

    const checkedInAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("bookings")
      .update({ checked_in_at: checkedInAt, updated_by: hostData.name } as never)
      .eq("id", booking_id);

    if (updateError) {
      console.error("[HostCheckIn] Update error:", updateError);
      return NextResponse.json({ error: "Failed to check in" }, { status: 500 });
    }

    after(async () => {
      await logEvent({
        homestayId: booking.homestay_id,
        entityType: "booking",
        entityId: booking_id,
        eventType: EventType.CHECKIN,
        actorType: "host",
        actorId: user.id,
        data: { source: "host_dashboard" },
        req,
      });
    });

    return NextResponse.json({ success: true, checked_in_at: checkedInAt });
  } catch (error) {
    console.error("[HostCheckIn] Error:", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
