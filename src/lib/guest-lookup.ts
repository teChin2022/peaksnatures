import { z } from "zod";
import { isStorableDraftPhone, normalizeDraftEmail, normalizeDraftPhone } from "@/lib/booking-draft";

/**
 * The key a guest uses to find their own bookings without an account: the
 * phone AND the email they booked with, as /api/bookings/draft/lookup does.
 * Either one alone is too easy to know or guess, and a match hands over the
 * booking id that cancel, check-in and pay-balance accept.
 *
 * Used by /api/bookings/search and /api/reviews/lookup. Keep them on this one
 * schema so the two cannot drift apart again.
 */
export const guestLookupSchema = z.object({
  homestay_id: z.string().uuid(),
  // Digits only, so "081-234-5678" works. Ten digits after that, which is
  // what the booking form accepts; "-------" strips to "" and is refused here.
  phone: z.string().max(30).transform(normalizeDraftPhone).refine(isStorableDraftPhone),
  // zod's email check refuses %, * and \, so `_` is the only LIKE wildcard
  // that reaches the ilike filter, and matchesGuestContact settles that.
  email: z.string().max(320).trim().toLowerCase().email(),
  turnstileToken: z.string().optional(),
});

/**
 * The exact match. The database filter (ilike on the email) only narrows the
 * rows; this decides, so a near miss from `_` or a different phone never
 * reaches the response.
 */
export function matchesGuestContact(
  row: { guest_email: string | null; guest_phone: string | null },
  phone: string,
  email: string,
): boolean {
  return (
    normalizeDraftEmail(row.guest_email ?? "") === email &&
    normalizeDraftPhone(row.guest_phone ?? "") === phone
  );
}
