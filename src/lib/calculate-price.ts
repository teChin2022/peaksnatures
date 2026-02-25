export interface SeasonEntry {
  start_date: string;
  end_date: string;
  price_per_night: number;
  name?: string;
}

export interface NightBreakdown {
  date: string;
  price: number;
  seasonName?: string;
}

export interface PriceResult {
  total: number;
  breakdown: NightBreakdown[];
}

/**
 * Calculate total price for a booking with seasonal pricing.
 *
 * Each occupied night is priced by the season its check-in date falls in.
 * Occupied nights = check_in .. check_out - 1 day.
 * If no season covers a night, the room's base price is used.
 */
export function calculateTotalPrice(
  basePricePerNight: number,
  checkIn: Date,
  checkOut: Date,
  seasons: SeasonEntry[]
): PriceResult {
  const breakdown: NightBreakdown[] = [];
  let total = 0;

  const current = new Date(checkIn);
  const end = new Date(checkOut);

  while (current < end) {
    const dateStr = formatDateStr(current);
    const match = findSeason(dateStr, seasons);
    const price = match ? match.price_per_night : basePricePerNight;

    breakdown.push({
      date: dateStr,
      price,
      seasonName: match?.name,
    });

    total += price;
    current.setDate(current.getDate() + 1);
  }

  return { total, breakdown };
}

/**
 * Get the min and max nightly price for a room considering seasons.
 */
export function getPriceRange(
  basePricePerNight: number,
  seasons: SeasonEntry[]
): { min: number; max: number } {
  if (seasons.length === 0) {
    return { min: basePricePerNight, max: basePricePerNight };
  }

  const allPrices = [basePricePerNight, ...seasons.map((s) => s.price_per_night)];
  return {
    min: Math.min(...allPrices),
    max: Math.max(...allPrices),
  };
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function findSeason(dateStr: string, seasons: SeasonEntry[]): SeasonEntry | undefined {
  return seasons.find((s) => dateStr >= s.start_date && dateStr <= s.end_date);
}
