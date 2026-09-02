import { normalizeDraftEmail, normalizeDraftPhone } from "@/lib/booking-draft";

/**
 * Just enough of the Supabase client to delete a row, so this stays testable
 * with the shared query-builder stub and pulls no runtime dependency of its own.
 */
interface DraftDeletable {
  from: (table: string) => {
    delete: () => { eq: (column: string, value: string) => unknown };
  };
}

/**
 * Drop a guest's saved draft once their booking actually completes.
 *
 * Called from the `after()` blocks in the booking routes — deliberately not from
 * inside `create_booking_atomic`, which carries seven migrations of availability
 * semantics that drafts are no part of. A missed delete is harmless: the
 * `expires_at` filter hides the row and the nightly sweep collects it.
 *
 * Lives in its own `-server` module (like promo-redemptions-server.ts) so that
 * `booking-draft.ts` stays pure and safe to import from the booking form.
 */
export async function deleteBookingDraft(
  supabase: DraftDeletable,
  homestayId: string,
  guestPhone: string,
  guestEmail: string,
): Promise<void> {
  const phone = normalizeDraftPhone(guestPhone);
  const email = normalizeDraftEmail(guestEmail);
  if (!phone || !email) return;

  try {
    await (supabase
      .from("booking_drafts")
      .delete()
      .eq("homestay_id", homestayId) as { eq: (c: string, v: string) => { eq: (c: string, v: string) => unknown } })
      .eq("guest_phone", phone)
      .eq("guest_email", email);
  } catch (error) {
    console.error("Booking draft cleanup error:", error);
  }
}
