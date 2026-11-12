import type { GuestBookingMode } from "@/types/database";

/**
 * Guest quick booking: the guest transfers and taps "I have transferred", the
 * booking is created `pending` with no slip on file, and the host checks the
 * slip in chat and confirms. Everything here is pure and import-free (a type
 * import is erased), so client pages, routes and tests share one definition —
 * the same reason as booking-attachments.ts.
 */

export const GUEST_BOOKING_MODES = ["normal", "quick", "both"] as const satisfies readonly GuestBookingMode[];

/**
 * A missing or unknown value is "normal", today's behaviour — e.g. a host row
 * read before migration 075 is applied.
 */
export function guestBookingModeOf(
  host: { guest_booking_mode?: string | null } | null | undefined,
): GuestBookingMode {
  const mode = host?.guest_booking_mode;
  return mode === "quick" || mode === "both" ? mode : "normal";
}

export const allowsQuick = (mode: GuestBookingMode): boolean => mode === "quick" || mode === "both";
export const allowsNormal = (mode: GuestBookingMode): boolean => mode === "normal" || mode === "both";

/**
 * A guest quick booking still waiting for the host. Derived, not stored: a
 * slip that failed EasySlip leaves a hash behind, a host-entered quick booking
 * is `confirmed` with a synthetic `quick_<time>` hash, so only a guest quick
 * booking is pending, unverified and has no hash at all.
 */
export function isQuickPending(b: {
  status: string;
  booking_source: string | null;
  easyslip_verified: boolean;
  payment_slip_hash: string | null;
}): boolean {
  return (
    b.status === "pending" &&
    b.booking_source === "guest" &&
    !b.easyslip_verified &&
    b.payment_slip_hash === null
  );
}

/** The short code the guest quotes in chat; the host messages already print it. */
export function bookingCode(bookingId: string): string {
  return bookingId.slice(0, 8);
}

export type HostContactLink = { href: string; kind: "messenger" | "page" };

const FACEBOOK_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "fb.com",
  "www.fb.com",
]);

// First path segments that are facebook.com sections, not page usernames.
const RESERVED_SEGMENTS = new Set([
  "profile.php", "pages", "groups", "people", "p", "share", "sharer", "watch", "events", "marketplace",
  "gaming", "login", "hashtag", "photo", "photo.php", "story.php", "permalink.php", "video", "videos",
  "reel", "public", "plugins", "dialog", "help", "policies", "privacy", "business", "ads",
]);

// A clean username only. Page slugs that end in a numeric id ("Name-1000123")
// are not guaranteed to resolve on m.me, so they fall back to the page link.
const USERNAME = /^[A-Za-z0-9.]{5,}$/;

/**
 * The link a guest taps to message the host, built from the homestay's
 * free-text `facebook_url`. A clean page username becomes https://m.me/<name>;
 * any other facebook.com address links to the page (it has its own Message
 * button); anything that is not a web link to Facebook yields null, so a host's
 * pasted `javascript:` or Instagram URL never becomes a contact button.
 */
export function hostContactLink(facebookUrl: string | null | undefined): HostContactLink | null {
  const raw = facebookUrl?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase();
  const segment = url.pathname.split("/").filter(Boolean)[0];

  if (host === "m.me") {
    return segment && USERNAME.test(segment) ? { href: `https://m.me/${segment}`, kind: "messenger" } : null;
  }
  if (!FACEBOOK_HOSTS.has(host)) return null;

  if (segment && USERNAME.test(segment) && !RESERVED_SEGMENTS.has(segment.toLowerCase())) {
    return { href: `https://m.me/${segment}`, kind: "messenger" };
  }

  const numericId = segment?.toLowerCase() === "profile.php" ? url.searchParams.get("id") : null;
  if (numericId && /^\d+$/.test(numericId)) {
    return { href: `https://m.me/${numericId}`, kind: "messenger" };
  }

  // Bare facebook.com is Facebook's home page, not the host's.
  if (!segment) return null;
  return { href: `https://www.facebook.com${url.pathname}${url.search}`, kind: "page" };
}
