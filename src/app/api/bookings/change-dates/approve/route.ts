import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendDateChangeEmailToGuest } from "@/lib/notifications";
import type { Booking, Homestay, Host, Room } from "@/types/database";
import { logEvent, EventType } from "@/lib/history-log";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { request_id } = body as { request_id: string };

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
      old_total_price: number;
      new_total_price: number;
      price_difference: number;
      easyslip_verified: boolean;
      old_room_id: string | null;
      new_room_id: string | null;
      additional_payment: number;
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

    // Verify the host owns this homestay (joined query: homestay + host in one call)
    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("*, hosts(*)")
      .eq("id", booking.homestay_id)
      .single();

    if (!homestayRow) {
      return NextResponse.json({ error: "Homestay not found" }, { status: 404 });
    }

    const joined = homestayRow as unknown as Homestay & { hosts: Host | null };
    const homestay = { ...joined } as unknown as Homestay;
    const host = joined.hosts;

    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    if (host.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Call atomic RPC to approve
    const { error: rpcError } = await supabase.rpc(
      "approve_date_change_atomic" as never,
      {
        p_request_id: request_id,
        p_approved_by: host.name,
      } as never
    );

    if (rpcError) {
      console.error("[ApproveDateChange] RPC error:", rpcError);

      if (rpcError.message?.includes("DATES_UNAVAILABLE")) {
        return NextResponse.json(
          { error: "DATES_UNAVAILABLE", message: "The requested dates are no longer available" },
          { status: 409 }
        );
      }
      if (rpcError.message?.includes("DATES_BLOCKED")) {
        return NextResponse.json(
          { error: "DATES_BLOCKED", message: "Some requested dates are blocked" },
          { status: 409 }
        );
      }
      if (rpcError.message?.includes("REQUEST_NOT_FOUND")) {
        return NextResponse.json(
          { error: "Request not found or already processed" },
          { status: 404 }
        );
      }

      return NextResponse.json({ error: "Failed to approve date change" }, { status: 500 });
    }

    // Log + notify guest in background
    after(async () => {
      await logEvent({
        homestayId: booking.homestay_id,
        entityType: "booking",
        entityId: booking.id,
        eventType: EventType.BOOKING_DATE_CHANGE_APPROVED,
        actorType: "host",
        actorId: user.id,
        data: {
          request_id,
          old_check_in: dcr.old_check_in,
          old_check_out: dcr.old_check_out,
          new_check_in: dcr.new_check_in,
          new_check_out: dcr.new_check_out,
          price_difference: dcr.price_difference,
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

        // Check if room was changed
        let roomChangeInfo: { oldRoomName: string; newRoomName: string } | undefined;
        if (dcr.new_room_id && dcr.old_room_id && dcr.new_room_id !== dcr.old_room_id) {
          const { data: oldRoomData } = await supabase
            .from("rooms")
            .select("name")
            .eq("id", dcr.old_room_id)
            .single();
          const { data: newRoomData } = await supabase
            .from("rooms")
            .select("name")
            .eq("id", dcr.new_room_id)
            .single();
          if (oldRoomData && newRoomData) {
            roomChangeInfo = {
              oldRoomName: (oldRoomData as unknown as { name: string }).name,
              newRoomName: (newRoomData as unknown as { name: string }).name,
            };
          }
        }

        const details = { booking, homestay, host, room };

        const newAmountPaid = booking.amount_paid + (dcr.easyslip_verified ? dcr.additional_payment : 0);
        const cappedAmountPaid = Math.min(newAmountPaid, dcr.new_total_price);
        const remainingBalance = Math.max(0, dcr.new_total_price - cappedAmountPaid);

        await sendDateChangeEmailToGuest(
          details,
          "approved",
          dcr.old_check_in,
          dcr.old_check_out,
          dcr.new_check_in,
          dcr.new_check_out,
          dcr.new_total_price,
          "th",
          undefined,
          roomChangeInfo,
          room?.name,
          {
            oldTotalPrice: dcr.old_total_price,
            priceDifference: dcr.price_difference,
            amountPaid: booking.amount_paid,
            additionalPayment: dcr.additional_payment,
            newAmountPaid: cappedAmountPaid,
            remainingBalance,
          },
        );
      } catch (error) {
        console.error("[ApproveDateChange] Notification error (non-blocking):", error);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ApproveDateChange] Error:", error);
    return NextResponse.json({ error: "Failed to approve date change" }, { status: 500 });
  }
}
