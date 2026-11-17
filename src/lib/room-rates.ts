import { getPriceRange, type SeasonEntry, type SpecialPriceEntry } from "@/lib/calculate-price";

/**
 * The seasons a guest can still book: those that have not ended by `today`,
 * a Bangkok YYYY-MM-DD (billingTodayStr). End dates include their day.
 */
export function upcomingSeasons<T extends { end_date: string }>(seasons: T[], today: string): T[] {
  return seasons.filter((s) => s.end_date >= today);
}

/**
 * The price a house card shows, the same on /[slug] and /book: the lowest
 * night, marked "from" (เริ่มต้น) when the house has more than one rate, else
 * its one rate. Pass only upcoming seasons; special prices only add on top.
 */
export function cardPrice(
  basePricePerNight: number,
  seasons: SeasonEntry[],
  specialPrices: SpecialPriceEntry[],
): { price: number; from: boolean } {
  const { min, max } = getPriceRange({ basePricePerNight, seasons, specialPrices });
  return min !== max ? { price: min, from: true } : { price: basePricePerNight, from: false };
}
