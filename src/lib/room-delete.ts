/**
 * Whether a house may be deleted, from two counts of its bookings: those not
 * ended yet (pending, verified or confirmed, check-out today or later) and all.
 * Deleting keeps the bookings but clears their house (bookings.room_id is
 * ON DELETE SET NULL), so an unfinished one would lose where the guest sleeps.
 */
export function roomDeleteVerdict(counts: { unfinished: number; total: number }):
  | { allowed: false; unfinished: number }
  | { allowed: true; past: number } {
  if (counts.unfinished > 0) return { allowed: false, unfinished: counts.unfinished };
  return { allowed: true, past: counts.total };
}

/** Postgres foreign_key_violation: another row (a date-change request) still points at the house. */
export const isLinkedRowError = (error: { code?: string } | null) => error?.code === "23503";
