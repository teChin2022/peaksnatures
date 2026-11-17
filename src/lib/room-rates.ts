import type { SeasonEntry } from "@/lib/calculate-price";

/**
 * The seasons a guest can still book: those that have not ended by `today`,
 * a Bangkok YYYY-MM-DD (billingTodayStr). End dates include their day.
 */
export function upcomingSeasons<T extends { end_date: string }>(seasons: T[], today: string): T[] {
  return seasons.filter((s) => s.end_date >= today);
}

/**
 * A house's price tonight, the one its card shows on /, /[slug] and /book:
 * the season covering `today` (a Bangkok YYYY-MM-DD, billingTodayStr), else
 * the base price. Special prices are left out on purpose (owner, 2026-11-18):
 * they are weekday surcharges, and the price must not change with the day the
 * guest happens to look. The rate table lists them.
 */
export function cardPrice(basePricePerNight: number, seasons: SeasonEntry[], today: string): number {
  // The dashboard blocks overlapping seasons, so the first match is the only one (as findSeason).
  return seasons.find((s) => s.start_date <= today && today <= s.end_date)?.price_per_night ?? basePricePerNight;
}

/**
 * A homestay's price over its houses, for the platform card and the landing's
 * Book bar: the cheapest house tonight (cardPrice), marked "from" (เริ่มต้น)
 * only when its houses cost different amounts. Null when no house has a price.
 */
export function homestayPrice(
  rooms: { id: string; price_per_night: number }[],
  seasons: (SeasonEntry & { room_id: string })[],
  today: string,
): { price: number; from: boolean } | null {
  const prices = rooms
    .map((r) => cardPrice(r.price_per_night, seasons.filter((s) => s.room_id === r.id), today))
    .filter((p) => p > 0);
  if (prices.length === 0) return null;
  return { price: Math.min(...prices), from: new Set(prices).size > 1 };
}
