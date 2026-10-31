import type { createServiceRoleClient } from "@/lib/supabase/server";
import type { Booking, BookingGroup, Homestay, Host, Room } from "@/types/database";
import type { GroupBookingDetails } from "@/lib/notifications";

/**
 * A cart's group row, its homestay + host, and every member booking with its
 * room — the shape the group emails and host notifications take. Null when the
 * group, homestay or host cannot be read.
 */
export async function loadGroupBookingDetails(
  supabase: ReturnType<typeof createServiceRoleClient>,
  groupId: string,
): Promise<GroupBookingDetails | null> {
  const { data: groupRow } = await supabase
    .from("booking_groups")
    .select("*, homestay:homestays(*, host:hosts(*))")
    .eq("id", groupId)
    .single();
  if (!groupRow) {
    console.error("[Notification] Booking group not found:", groupId);
    return null;
  }

  const joined = groupRow as unknown as BookingGroup & {
    homestay: (Homestay & { host: Host | null }) | null;
  };
  const homestay = joined.homestay;
  if (!homestay) return null;
  const host = homestay.host;
  if (!host) return null;

  const { homestay: _h, ...groupFields } = joined;
  void _h;
  const group = groupFields as BookingGroup;

  const { data: memberRows } = await supabase
    .from("bookings")
    .select("*, room:rooms(*)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  const items = ((memberRows as unknown as (Booking & { room: Room | null })[]) || []).map((row) => {
    const { room, ...bookingFields } = row;
    return { booking: bookingFields as Booking, room: (room as Room) || undefined };
  });

  return {
    group,
    homestay: homestay as Homestay,
    host: host as Host,
    items,
  };
}
