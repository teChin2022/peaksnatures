/**
 * The seasons a guest can still book: those that have not ended by `today`,
 * a Bangkok YYYY-MM-DD (billingTodayStr). End dates include their day.
 */
export function upcomingSeasons<T extends { end_date: string }>(seasons: T[], today: string): T[] {
  return seasons.filter((s) => s.end_date >= today);
}
