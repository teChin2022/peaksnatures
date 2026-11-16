import type { Host } from "@/types/database";

/**
 * The host fields the public booking form needs: who to pay, how, and the
 * deposit / cancellation / draft terms. Whatever a server component hands a
 * client component is serialized into the page source, so the rest of a
 * `hosts` row (LINE channel token, PIN hash, wallet, plan, auth ids) must
 * never reach it.
 */
export const BOOKING_HOST_FIELDS = [
  "name",
  "promptpay_id",
  "payment_display",
  "bank_name",
  "bank_account_number",
  "bank_account_name",
  "deposit_amount",
  "deposit_by_month",
  "cancellation_days",
  "booking_draft_hours",
  "guest_booking_mode",
  // Already public in the page footer (hostPhone); the quick-booking contact
  // block falls back to it when a homestay has no usable Facebook link.
  "phone",
] as const satisfies readonly (keyof Host)[];

export type BookingHost = Pick<Host, (typeof BOOKING_HOST_FIELDS)[number]>;

export function toBookingHost(host: Host): BookingHost {
  return Object.fromEntries(BOOKING_HOST_FIELDS.map((key) => [key, host[key]])) as BookingHost;
}

/**
 * Only an admin-approved host is public: page, listings, sitemap, bookings.
 * A new host is `pending` until approved (migration 026), and could otherwise
 * publish a page that takes bookings and shows their PromptPay (audit F-14).
 */
export function isHostApproved(host: { status?: string | null } | null | undefined): boolean {
  return host?.status === "approved";
}
