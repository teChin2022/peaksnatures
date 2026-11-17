export interface SeasonEntry {
  start_date: string;
  end_date: string;
  price_per_night: number;
  name?: string;
}

/**
 * A weekday or specific-date rule that adds a surcharge to a night.
 *
 * 'weekday' rules match on `weekdays` (0=Sun … 6=Sat) and may carry an
 * optional start/end window; a null bound is unbounded on that side.
 * 'date' rules match an explicit list of YYYY-MM-DD dates.
 *
 * `surcharge` is ADDED to the tier below — the seasonal price where a season
 * covers the night, else the room's base price. It is not a replacement
 * price: hosts price special days as costing more, and a surcharge follows a
 * seasonal price that differs month to month without being re-entered.
 */
export interface SpecialPriceEntry {
  rule_type: "weekday" | "date";
  weekdays: number[];
  dates: string[];
  start_date: string | null;
  end_date: string | null;
  surcharge: number;
  name?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface NightBreakdown {
  date: string;
  /** Final price for the night: the tier below plus any special surcharge. */
  price: number;
  seasonName?: string;
  /** The top tier that touched this night. Absent when only the base price applied. */
  rateKind?: "special" | "season";
  /** The amount a special rule added, when one applied. */
  surcharge?: number;
}

export interface PriceResult {
  total: number;
  breakdown: NightBreakdown[];
}

export interface PriceInput {
  basePricePerNight: number;
  checkIn: Date;
  checkOut: Date;
  seasons: SeasonEntry[];
  specialPrices: SpecialPriceEntry[];
}

/**
 * Calculate total price for a booking.
 *
 * A night starts at the seasonal price if a season covers it, else the room's
 * base price. The most specific special date rule covering that night then
 * adds its surcharge on top. Only one special rule ever applies — surcharges
 * do not stack.
 *
 * Occupied nights = check_in .. check_out - 1 day.
 */
export function calculateTotalPrice({
  basePricePerNight,
  checkIn,
  checkOut,
  seasons,
  specialPrices,
}: PriceInput): PriceResult {
  const breakdown: NightBreakdown[] = [];
  let total = 0;

  const ranked = rankSpecialPrices(specialPrices);

  const current = new Date(checkIn);
  const end = new Date(checkOut);

  while (current < end) {
    const dateStr = formatDateStr(current);
    const season = findSeason(dateStr, seasons);
    const special = findSpecialPrice(dateStr, current.getDay(), ranked);

    const under = season ? season.price_per_night : basePricePerNight;
    const price = under + (special?.surcharge ?? 0);

    breakdown.push({
      date: dateStr,
      price,
      // The special rule names the night when one applies — it is the reason
      // this night costs more — otherwise the season does.
      seasonName: special?.name ?? season?.name,
      rateKind: special ? "special" : season ? "season" : undefined,
      surcharge: special?.surcharge,
    });

    total += price;
    current.setDate(current.getDate() + 1);
  }

  return { total, breakdown };
}

/**
 * Get the min and max nightly price for a room across all its pricing tiers.
 *
 * Used for "฿1,200–฿2,500" labels where there is no date context. The cheapest
 * night carries no surcharge, so the floor is the lowest of base/seasonal; the
 * ceiling is the dearest of those plus the largest surcharge, which is the
 * most any single night can cost since surcharges never stack.
 *
 * Special rules whose window has already elapsed are skipped, so a spent
 * "Sat+Sun in November" rule stops inflating the range forever.
 */
export function getPriceRange({
  basePricePerNight,
  seasons,
  specialPrices,
}: Omit<PriceInput, "checkIn" | "checkOut">): { min: number; max: number } {
  const today = formatDateStr(new Date());
  const liveSpecials = specialPrices.filter(
    (s) => s.is_active !== false && (s.end_date === null || s.end_date >= today),
  );

  const tierPrices = [basePricePerNight, ...seasons.map((s) => s.price_per_night)];
  const maxSurcharge = liveSpecials.length > 0
    ? Math.max(...liveSpecials.map((s) => s.surcharge))
    : 0;

  return {
    min: Math.min(...tierPrices),
    max: Math.max(...tierPrices) + maxSurcharge,
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

/** Lower rank = more specific = wins. */
const RULE_TYPE_RANK: Record<SpecialPriceEntry["rule_type"], number> = {
  date: 0,
  weekday: 1,
};

/**
 * Sort active rules most-specific-first, once per price calculation.
 *
 * Callers pass raw Supabase rows in whatever order the DB returned them, and
 * the browser and the server issue separate queries — so relying on array
 * order (as findSeason does) would let the two disagree on price. Overlap is
 * expected here by design, so the ordering has to be intrinsic to the rules:
 *
 *   1. rule_type — an explicitly listed date beats a weekday rule.
 *   2. A bounded window beats an open-ended rule.
 *   3. Fewer weekdays beats more: [Sat] beats [Sat, Sun].
 *   4. Newest created_at, so a later edit wins a genuine tie.
 *
 * The effect is that a host who writes "every weekend ฿2,500" and then
 * "every Saturday ฿3,000" gets what those two lines plainly say, with no
 * priority field to manage.
 */
function rankSpecialPrices(specialPrices: SpecialPriceEntry[]): SpecialPriceEntry[] {
  return specialPrices
    .filter((s) => s.is_active !== false)
    .slice()
    .sort((a, b) => {
      const byType = RULE_TYPE_RANK[a.rule_type] - RULE_TYPE_RANK[b.rule_type];
      if (byType !== 0) return byType;

      const aBounded = a.start_date !== null || a.end_date !== null;
      const bBounded = b.start_date !== null || b.end_date !== null;
      if (aBounded !== bBounded) return aBounded ? -1 : 1;

      if (a.rule_type === "weekday" && b.rule_type === "weekday") {
        const byBreadth = a.weekdays.length - b.weekdays.length;
        if (byBreadth !== 0) return byBreadth;
      }

      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
}

/** `ranked` must come from rankSpecialPrices — the first match is the winner. */
function findSpecialPrice(
  dateStr: string,
  weekday: number,
  ranked: SpecialPriceEntry[],
): SpecialPriceEntry | undefined {
  return ranked.find((s) => {
    if (s.rule_type === "date") return s.dates.includes(dateStr);
    if (!s.weekdays.includes(weekday)) return false;
    if (s.start_date !== null && dateStr < s.start_date) return false;
    if (s.end_date !== null && dateStr > s.end_date) return false;
    return true;
  });
}
