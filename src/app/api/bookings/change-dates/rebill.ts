import type { createServiceRoleClient } from "@/lib/supabase/server";
import { deductCommission, refundCommission } from "@/lib/billing";
import { computeRoomRateTotal } from "@/lib/booking-pricing";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Re-price the commission after a booking moved to new dates or a new house.
 * Shared by the host's approval of a guest request and the host's own change.
 */
export async function rebillAfterDateChange(
  supabase: ServiceClient,
  booking: { id: string; room_id: string | null; commission_base: number | null },
  newRoomId: string | null,
  newCheckIn: string,
  newCheckOut: string,
  planType: string,
): Promise<void> {
  // Quick bookings are charged on the room's own rate rather than
  // total_price, so a date/room change has to re-derive that base before
  // the re-deduct below — otherwise the new stay is priced off the old one.
  const rebasedRoomId = newRoomId || booking.room_id;
  if (booking.commission_base != null && rebasedRoomId) {
    const newBase = await computeRoomRateTotal(supabase, rebasedRoomId, newCheckIn, newCheckOut);
    if (newBase && newBase > 0) {
      await supabase
        .from("bookings")
        .update({ commission_base: newBase } as never)
        .eq("id", booking.id);
    }
  }

  // Recalculate commission: refund old amount, deduct new based on the
  // updated price. This refund is a repricing step, not a cancellation —
  // cancellations deliberately keep the fee.
  //
  // Only while the host is still on Commission. deductCommission charges
  // nothing on any other plan, so after a switch to Fixed Rate this pair
  // refunded the fee and never took it back. The fee was earned when the
  // booking was confirmed, so off Commission it stays as charged.
  if (planType === "commission") {
    await refundCommission(booking.id);
    await deductCommission(booking.id);
  }
}
