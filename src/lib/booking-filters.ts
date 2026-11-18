import type { BookingStatus } from "@/types/database";

/**
 * The host bookings page's search and filters, as PostgREST filters. Pure and
 * import-free (type imports are erased) so the page and its tests share one
 * definition: the page used to build the same `.or()` string in two places.
 */

export const SEARCH_MIN_CHARS = 3;

/** "quick" = every host-entered booking; "web" = booked by the guest on the site. */
export type SourceFilter = "all" | "web" | "quick" | "walk_in" | "booking_com" | "agoda" | "airbnb" | "trip_com" | "phone" | "other";
/** "needs_action" = pending + verified; "quick_pending" = a guest quick booking waiting on the host (isQuickPending). */
export type StatusFilter = "all" | "needs_action" | "quick_pending" | BookingStatus;
export type StayFilter = "all" | "today" | "next7" | "this_month" | "custom";
export type BookingSort = "created" | "check_in";
export type BookingTab = "all" | "pending" | "confirmed";

export interface BookingFilters {
  search: string;
  source: SourceFilter;
  status: StatusFilter;
  stay: StayFilter;
  /** YYYY-MM-DD, only read when stay is "custom"; either may be empty. */
  stayFrom: string;
  stayTo: string;
  roomId: string; // "all" or a room id
  sort: BookingSort;
}

export const DEFAULT_FILTERS: BookingFilters = {
  search: "", source: "all", status: "all", stay: "all", stayFrom: "", stayTo: "", roomId: "all", sort: "created",
};

export const PENDING_STATUSES: BookingStatus[] = ["pending", "verified"];

/** Characters that end a value in PostgREST's or=(…) syntax, or act as ilike wildcards. */
const RESERVED = /[%,()"\\*:]/g;

/** A booking code is the first 8 hex digits of a UUID (bookingCode); this pads a prefix to a UUID. */
function uuidBound(hex: string, pad: "0" | "f"): string {
  const s = hex.padEnd(32, pad);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/**
 * The search box as one `.or()` filter, or null when it is too short to run.
 * Name, email and phone match anywhere. A run of hex digits also matches a
 * booking or cart code by prefix: `id` is a uuid, which ilike cannot read, so
 * it is a range. Phones are stored as bare digits, so "081-234-5678" and
 * "+66 81 234 5678" are searched as 0812345678.
 */
export function searchOrFilter(raw: string): string | null {
  const text = raw.replace(RESERVED, " ").replace(/\s+/g, " ").trim();
  if (text.length < SEARCH_MIN_CHARS) return null;

  const parts = [`guest_name.ilike.%${text}%`, `guest_email.ilike.%${text}%`, `guest_phone.ilike.%${text}%`];

  if (/^[\d\s+\-.]+$/.test(text)) {
    let digits = text.replace(/\D/g, "");
    if (digits.startsWith("66") && digits.length === 11) digits = `0${digits.slice(2)}`;
    if (digits !== text && digits.length >= SEARCH_MIN_CHARS) parts.push(`guest_phone.ilike.%${digits}%`);
  }

  // "ID: a1b2c3d4…" as copied off a card, or a whole UUID.
  const hex = text.toLowerCase().replace(/^id\s*/, "").replace(/[-…\s.]/g, "");
  if (/^[0-9a-f]{3,32}$/.test(hex)) {
    const lo = uuidBound(hex, "0");
    const hi = uuidBound(hex, "f");
    parts.push(`and(id.gte.${lo},id.lte.${hi})`, `and(group_id.gte.${lo},group_id.lte.${hi})`);
  }
  return parts.join(",");
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Check-in range for a stay filter, inclusive; `today` is Bangkok's (billingTodayStr). */
export function stayRange(f: Pick<BookingFilters, "stay" | "stayFrom" | "stayTo">, today: string): { from?: string; to?: string } {
  switch (f.stay) {
    case "today":
      return { from: today, to: today };
    case "next7":
      return { from: today, to: addDays(today, 6) };
    case "this_month": {
      const first = `${today.slice(0, 7)}-01`;
      const [y, m] = today.split("-").map(Number);
      return { from: first, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
    }
    case "custom":
      return { from: f.stayFrom || undefined, to: f.stayTo || undefined };
    default:
      return {};
  }
}

/** Filters that narrow the list (sort does not count). */
export function activeFilterCount(f: BookingFilters, tab: BookingTab): number {
  return [
    searchOrFilter(f.search) !== null,
    f.source !== "all",
    tab === "all" && f.status !== "all",
    f.stay !== "all" && (f.stay !== "custom" || Boolean(f.stayFrom || f.stayTo)),
    f.roomId !== "all",
  ].filter(Boolean).length;
}

/** The subset of supabase-js's filter builder this module calls. */
export interface FilterableQuery<Q> {
  eq(column: string, value: string | boolean): Q;
  neq(column: string, value: string): Q;
  in(column: string, values: string[]): Q;
  is(column: string, value: null): Q;
  gte(column: string, value: string): Q;
  lte(column: string, value: string): Q;
  or(filters: string): Q;
}

/**
 * Narrows a bookings query to a tab and the filters. The tab owns status on
 * Pending/Confirmed, so the status filter only applies on All. Pending also
 * takes `dateChangeIds`: a booking of any status with a pending date-change
 * request sits there.
 */
export function applyBookingFilters<Q extends FilterableQuery<Q>>(
  query: Q,
  f: BookingFilters,
  tab: BookingTab,
  today: string,
  dateChangeIds: string[] = [],
): Q {
  let q = query;

  if (tab === "pending") {
    const statuses = `status.in.(${PENDING_STATUSES.join(",")})`;
    q = dateChangeIds.length > 0 ? q.or(`${statuses},id.in.(${dateChangeIds.join(",")})`) : q.in("status", PENDING_STATUSES);
  } else if (tab === "confirmed") {
    q = q.eq("status", "confirmed");
  } else if (f.status === "needs_action") {
    q = q.in("status", PENDING_STATUSES);
  } else if (f.status === "quick_pending") {
    // Same test as isQuickPending (src/lib/quick-booking.ts).
    q = q.eq("status", "pending").eq("booking_source", "guest").eq("easyslip_verified", false).is("payment_slip_hash", null);
  } else if (f.status !== "all") {
    q = q.eq("status", f.status);
  }

  if (f.source === "web") q = q.eq("booking_source", "guest");
  else if (f.source === "quick") q = q.neq("booking_source", "guest");
  else if (f.source !== "all") q = q.eq("booking_source", f.source);

  const { from, to } = stayRange(f, today);
  if (from) q = q.gte("check_in", from);
  if (to) q = q.lte("check_in", to);

  if (f.roomId !== "all") q = q.eq("room_id", f.roomId);

  const search = searchOrFilter(f.search);
  if (search) q = q.or(search);

  return q;
}
