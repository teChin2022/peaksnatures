/** The home page's "today's work" counts. `today` is the host's local YYYY-MM-DD. */
export function todayWorkCounts(
  bookings: { status: string; check_in: string; check_out: string }[],
  today: string,
) {
  return {
    // Same statuses as the bookings page's Pending tab.
    needsAction: bookings.filter((b) => b.status === "pending" || b.status === "verified").length,
    checkins: bookings.filter((b) => b.check_in === today && (b.status === "confirmed" || b.status === "completed")).length,
    checkouts: bookings.filter((b) => b.check_out === today && b.status === "confirmed").length,
  };
}
