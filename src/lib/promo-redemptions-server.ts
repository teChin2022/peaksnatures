import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mark any pending redemption tied to this booking as cancelled.
 * Called when a booking flips to status='cancelled' or 'rejected'.
 *
 * Pending → cancelled only — once a redemption is 'paid' the host has
 * already sent money to the recommender and the audit row should stay.
 * Failure is logged but never thrown: cancellation must always succeed.
 */
export async function cancelRedemptionForBooking(
  supabase: SupabaseClient,
  bookingId: string,
  actor: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("promo_redemptions")
      .update({
        payout_status: "cancelled",
        updated_by: actor,
      } as never)
      .eq("booking_id", bookingId)
      .eq("payout_status", "pending");
    if (error) {
      console.error("[Promo] Failed to cancel redemption for booking", bookingId, error);
    }
  } catch (e) {
    console.error("[Promo] Unexpected error cancelling redemption", bookingId, e);
  }
}
