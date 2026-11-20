/**
 * Guests a homestay takes at once: each active house's max guests times how
 * many of it there are. Shown to guests as "รองรับสูงสุด N ท่าน"; it replaced
 * homestays.max_guests, which no screen let the host edit (default 2).
 */
export function homestayCapacity(
  rooms: { max_guests: number | null; quantity?: number | null; is_active?: boolean | null }[],
): number {
  return rooms.reduce(
    (sum, r) => (r.is_active === false ? sum : sum + Math.max(0, r.max_guests ?? 0) * Math.max(1, r.quantity ?? 1)),
    0,
  );
}
