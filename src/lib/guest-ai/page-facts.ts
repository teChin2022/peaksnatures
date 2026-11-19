import { calculateTotalPrice, type SeasonEntry, type SpecialPriceEntry } from "@/lib/calculate-price";
import { freeUnitsForStay } from "@/lib/booking-dates";

/**
 * What the booking page shows a guest, summed up for the assistant (owner, 2026-11-19: everything
 * public on the page, nothing secret). Each helper reuses the page's own logic, so the assistant
 * and the page agree. Left out on purpose: review text (guests write it: prompt injection, P-01),
 * bank and PromptPay numbers (F-03), anything about other guests.
 */

/** Days ahead the assistant can see (availability and prices). */
export const FACT_WINDOW_DAYS = 90;
const MAX_RANGES = 4;

const pad = (n: number) => String(n).padStart(2, "0");
/** A YYYY-MM-DD as a local-midnight Date, as the page's date pickers make them. */
const localDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (key: string, n: number) => {
  const d = localDay(key);
  d.setDate(d.getDate() + n);
  return keyOf(d);
};

/** Consecutive day keys as "a to b" ranges (a single day stays as is). */
function toRanges(keys: string[]): string[] {
  const ranges: string[] = [];
  let start: string | null = null;
  let prev: string | null = null;
  for (const k of keys) {
    if (start && prev && addDays(prev, 1) === k) {
      prev = k;
      continue;
    }
    if (start && prev) ranges.push(start === prev ? start : `${start} to ${prev}`);
    start = prev = k;
  }
  if (start && prev) ranges.push(start === prev ? start : `${start} to ${prev}`);
  return ranges;
}

/**
 * Each house's full nights over the window (no unit free: booked or closed), as the page's
 * availability calendar counts them. Every other night has at least one unit free.
 */
export function availabilityFacts(
  rooms: { id: string; name?: string; quantity: number | null }[],
  bookedRanges: { room_id: string | null; check_in: string; check_out: string }[],
  blockedDates: { room_id: string | null; date: string }[],
  today: string,
  days = FACT_WINDOW_DAYS,
): { window: string; rule: string; full_nights_by_house: Record<string, string[]> } {
  const nights = Array.from({ length: days }, (_, i) => addDays(today, i));
  const full_nights_by_house: Record<string, string[]> = {};
  for (const room of rooms) {
    const quantity = room.quantity || 1;
    const full = nights.filter((k) => freeUnitsForStay(room.id, quantity, [k], bookedRanges, blockedDates) === 0);
    // Keyed by name: the model reads and answers in names (a live run misread id-keyed lists).
    full_nights_by_house[room.name ?? room.id] = toRanges(full);
  }
  return {
    window: `${nights[0]} to ${nights[nights.length - 1]}`,
    rule: "every night in the window is free except those listed for that house",
    full_nights_by_house,
  };
}

/**
 * Nightly prices over the window, priced by calculateTotalPrice as the page prices a stay:
 * each month's cheapest and dearest night, the cheapest price, and its first stretches.
 */
export function priceCalendarFacts(
  room: {
    price_per_night: number;
    room_seasonal_prices?: (SeasonEntry & { name: string })[] | null;
    room_special_prices?: (SpecialPriceEntry & { is_active: boolean })[] | null;
  },
  today: string,
  days = FACT_WINDOW_DAYS,
): { by_month: string[]; cheapest_per_night: number; cheapest_nights: string[] } {
  const { breakdown } = calculateTotalPrice({
    basePricePerNight: room.price_per_night,
    checkIn: localDay(today),
    checkOut: localDay(addDays(today, days)),
    seasons: (room.room_seasonal_prices ?? []).filter((s) => s.end_date >= today),
    specialPrices: (room.room_special_prices ?? []).filter((s) => s.is_active),
  });
  const months = new Map<string, { cheapest: number; dearest: number }>();
  for (const night of breakdown) {
    const month = night.date.slice(0, 7);
    const m = months.get(month);
    months.set(month, m ? { cheapest: Math.min(m.cheapest, night.price), dearest: Math.max(m.dearest, night.price) } : { cheapest: night.price, dearest: night.price });
  }
  const cheapest = Math.min(...breakdown.map((n) => n.price));
  return {
    // "2026-11: 5-10" = that month's cheapest and dearest night, in baht.
    by_month: [...months].map(([month, m]) => `${month}: ${m.cheapest === m.dearest ? m.cheapest : `${m.cheapest}-${m.dearest}`}`),
    cheapest_per_night: cheapest,
    cheapest_nights: toRanges(breakdown.filter((n) => n.price === cheapest).map((n) => n.date)).slice(0, MAX_RANGES),
  };
}

/**
 * A house's active add-ons and guest-count surcharges as short lines (charged per night, as
 * booking-pricing charges them). A group size that costs nothing extra is left out.
 */
export function extrasFacts(room: {
  room_options?: { name: string; price: number; pricing_type: "per_night" | "per_time"; is_active: boolean }[] | null;
  room_guest_pricing?: { adults: number; children: number; detail: string | null; surcharge: number; is_active: boolean }[] | null;
}): { add_ons: string[]; guest_surcharges: string[] } {
  return {
    add_ons: (room.room_options ?? [])
      .filter((o) => o.is_active)
      .map((o) => `${o.name}: ${o.price} baht ${o.pricing_type === "per_time" ? "once per stay" : "per night"}`),
    guest_surcharges: (room.room_guest_pricing ?? [])
      .filter((g) => g.is_active && g.surcharge > 0)
      .sort((a, b) => a.adults + a.children - (b.adults + b.children))
      .map(
        (g) =>
          `${g.adults} adults${g.children ? ` + ${g.children} children` : ""}${g.detail ? ` ${g.detail}` : ""}: +${g.surcharge} baht per night`,
      ),
  };
}

/**
 * Lifts extras every house shares to the homestay (a live run sent the same lists five times,
 * ~1,500 tokens). Houses keep their own lists only when they differ.
 */
export function shareExtras<T extends { add_ons: string[]; guest_surcharges: string[] }>(
  houses: T[],
): {
  shared: { add_ons: string[]; guest_surcharges: string[] } | null;
  houses: (Omit<T, "add_ons" | "guest_surcharges"> & { add_ons?: string[]; guest_surcharges?: string[] })[];
} {
  const key = (h: T) => JSON.stringify([h.add_ons, h.guest_surcharges]);
  if (houses.length < 2 || !houses.every((h) => key(h) === key(houses[0]))) return { shared: null, houses };
  return {
    shared: { add_ons: houses[0].add_ons, guest_surcharges: houses[0].guest_surcharges },
    houses: houses.map(({ add_ons: _a, guest_surcharges: _g, ...rest }) => rest),
  };
}

/** The deposit (by check-in month, as getDepositForMonth picks it) and the free-cancellation window. */
export function bookingTermsFacts(host: {
  deposit_amount: number | null;
  deposit_by_month: Record<string, number> | null;
  cancellation_days: number | null;
}) {
  return {
    deposit: { default_baht: host.deposit_amount || 0, by_check_in_month: host.deposit_by_month ?? {} },
    free_cancellation_days_before_check_in: host.cancellation_days && host.cancellation_days > 0 ? host.cancellation_days : null,
  };
}

/** The rating guests see, never what they wrote. */
export function reviewFacts(rows: { rating: number }[]): { average_rating: number | null; count: number } {
  if (rows.length === 0) return { average_rating: null, count: 0 };
  return { average_rating: Math.round((rows.reduce((s, r) => s + r.rating, 0) / rows.length) * 10) / 10, count: rows.length };
}
