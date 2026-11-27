import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Booking, Host } from "@/types/database";
import { logEvent, EventType } from "@/lib/history-log";
import { canActForHost } from "@/lib/host-access";
import { rebillAfterDateChange } from "../rebill";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format");

const hostChangeSchema = z.object({
  booking_id: z.string().uuid(),
  new_room_id: z.string().uuid(),
  new_check_in: date,
  new_check_out: date,
  // The host's agreed price for the new stay; telling the guest is up to them.
  total_price: z.number().int().min(0),
});

/**
 * The host moves a booking they entered themselves (จองด่วน) to another house
 * or dates. Such bookings often have no guest email, so the guest cannot ask
 * for the change. Recorded as a date-change request approved at once, so the
 * existing atomic RPC does the availability check and the move. No guest email.
 */
export async function POST(req: NextRequest) {
  try {
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = hostChangeSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    const data = parsed.data;

    const supabase = createServiceRoleClient();

    const { data: bookingRow } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", data.booking_id)
      .single();
    if (!bookingRow) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const booking = bookingRow as unknown as Booking;

    const { data: homestayRow } = await supabase
      .from("homestays")
      .select("id, hosts(*)")
      .eq("id", booking.homestay_id)
      .single();
    const host = (homestayRow as unknown as { hosts: Host | null } | null)?.hosts;
    if (!host) {
      return NextResponse.json({ error: "Homestay not found" }, { status: 404 });
    }
    if (!(await canActForHost(supabase, user.id, host))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [{ isHostBlocked }, { getHostBlockState }] = await Promise.all([
      import("@/lib/plan-expiry"),
      import("@/lib/billing"),
    ]);
    const blockState = await getHostBlockState(host.id);
    if (blockState && isHostBlocked(blockState)) {
      return NextResponse.json(
        { error: "HOST_BLOCKED", message: "Please settle billing before changing bookings." },
        { status: 403 }
      );
    }

    // Guest bookings keep the guest's own request flow; a cart member moves with its cart.
    if (!booking.booking_source || booking.booking_source === "guest" || booking.group_id) {
      return NextResponse.json({ error: "NOT_QUICK_BOOKING" }, { status: 400 });
    }
    if (booking.status !== "confirmed") {
      return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
    }
    if (booking.checked_in_at) {
      return NextResponse.json({ error: "ALREADY_CHECKED_IN" }, { status: 400 });
    }

    const nights = Math.round(
      (new Date(data.new_check_out).getTime() - new Date(data.new_check_in).getTime()) / 86_400_000,
    );
    if (nights <= 0) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }
    if (
      data.new_room_id === booking.room_id &&
      data.new_check_in === booking.check_in &&
      data.new_check_out === booking.check_out
    ) {
      return NextResponse.json({ error: "No changes requested" }, { status: 400 });
    }

    const [{ data: existingReq }, { data: roomRow }, { count: holdCount }, { count: dcrCount }] = await Promise.all([
      supabase.from("date_change_requests").select("id").eq("booking_id", booking.id).eq("status", "pending").limit(1),
      supabase.from("rooms").select("id, homestay_id, quantity").eq("id", data.new_room_id).single(),
      // The RPC checks bookings and blocked dates only: a guest mid-checkout
      // (hold) or another pending request may still claim the house.
      supabase.from("booking_holds").select("id", { count: "exact", head: true }).eq("room_id", data.new_room_id).gt("expires_at", new Date().toISOString()).lt("check_in", data.new_check_out).gt("check_out", data.new_check_in),
      supabase.from("date_change_requests").select("id", { count: "exact", head: true }).eq("status", "pending").eq("new_room_id", data.new_room_id).neq("booking_id", booking.id).lt("new_check_in", data.new_check_out).gt("new_check_out", data.new_check_in),
    ]);

    if (existingReq && existingReq.length > 0) {
      return NextResponse.json({ error: "PENDING_EXISTS" }, { status: 409 });
    }
    const room = roomRow as { id: string; homestay_id: string; quantity: number } | null;
    if (!room || room.homestay_id !== booking.homestay_id) {
      return NextResponse.json({ error: "Invalid room" }, { status: 400 });
    }

    const claims = (holdCount || 0) + (dcrCount || 0);
    if (claims > 0) {
      const { count: overlapCount } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("room_id", room.id)
        .neq("id", booking.id)
        .in("status", ["pending", "confirmed", "verified"])
        .lt("check_in", data.new_check_out)
        .gt("check_out", data.new_check_in);
      if ((overlapCount || 0) + claims >= (room.quantity || 1)) {
        return NextResponse.json({ error: "DATES_HELD" }, { status: 409 });
      }
    }

    const { data: requestRow, error: insertError } = await supabase
      .from("date_change_requests")
      .insert({
        booking_id: booking.id,
        old_check_in: booking.check_in,
        old_check_out: booking.check_out,
        new_check_in: data.new_check_in,
        new_check_out: data.new_check_out,
        old_total_price: booking.total_price,
        new_total_price: data.total_price,
        new_discount_amount: booking.discount_amount || 0,
        price_difference: data.total_price - booking.total_price,
        additional_payment: 0,
        status: "pending",
        requested_by: host.name,
        old_room_id: booking.room_id,
        new_room_id: room.id,
        easyslip_verified: false,
        created_by: host.name,
        updated_by: host.name,
      } as never)
      .select("id")
      .single();

    if (insertError || !requestRow) {
      console.error("[HostChangeDates] Insert error:", insertError);
      return NextResponse.json({ error: "Failed to change booking" }, { status: 500 });
    }
    const requestId = (requestRow as { id: string }).id;

    const { error: rpcError } = await supabase.rpc(
      "approve_date_change_atomic" as never,
      { p_request_id: requestId, p_approved_by: host.name } as never
    );

    if (rpcError) {
      // A pending request left behind would hold the house and block the next change.
      const { error: deleteError } = await supabase.from("date_change_requests").delete().eq("id", requestId);
      if (deleteError) {
        console.error("[HostChangeDates] Could not remove the unapproved request:", requestId, deleteError);
      }
      if (rpcError.message?.includes("DATES_UNAVAILABLE")) {
        return NextResponse.json({ error: "DATES_UNAVAILABLE" }, { status: 409 });
      }
      if (rpcError.message?.includes("DATES_BLOCKED")) {
        return NextResponse.json({ error: "DATES_BLOCKED" }, { status: 409 });
      }
      console.error("[HostChangeDates] RPC error:", rpcError);
      return NextResponse.json({ error: "Failed to change booking" }, { status: 500 });
    }

    after(async () => {
      await logEvent({
        homestayId: booking.homestay_id,
        entityType: "booking",
        entityId: booking.id,
        eventType: EventType.BOOKING_DATE_CHANGE_APPROVED,
        actorType: "host",
        actorId: user.id,
        data: {
          request_id: requestId,
          by_host: true,
          old_check_in: booking.check_in,
          old_check_out: booking.check_out,
          new_check_in: data.new_check_in,
          new_check_out: data.new_check_out,
          old_room_id: booking.room_id,
          new_room_id: room.id,
          old_total_price: booking.total_price,
          new_total_price: data.total_price,
        },
        req,
      });
      await rebillAfterDateChange(supabase, booking, room.id, data.new_check_in, data.new_check_out, host.plan_type);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[HostChangeDates] Error:", error);
    return NextResponse.json({ error: "Failed to change booking" }, { status: 500 });
  }
}
