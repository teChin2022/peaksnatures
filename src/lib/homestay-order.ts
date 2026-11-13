/** The fields the platform home `/` sorts its homestay list by. */
export interface HomestayOrderFields {
  /** Cheapest active house; null when no house is open, so the homestay can't take bookings. */
  min_price: number | null;
  average_rating: number;
  created_at: string;
}

/**
 * Order of the homestay list on `/`: homestays that can take bookings first (owner's pick,
 * 2026-11-13), then rated before unrated, higher rating first, and oldest first among the unrated.
 */
export function compareHomestays(a: HomestayOrderFields, b: HomestayOrderFields): number {
  const aOpen = a.min_price !== null;
  const bOpen = b.min_price !== null;
  if (aOpen !== bOpen) return aOpen ? -1 : 1;
  if (a.average_rating > 0 && b.average_rating === 0) return -1;
  if (a.average_rating === 0 && b.average_rating > 0) return 1;
  if (a.average_rating > 0 && b.average_rating > 0) return b.average_rating - a.average_rating;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}
