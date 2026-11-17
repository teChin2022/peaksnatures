import { cardPrice } from "@/lib/room-rates";
import type { SeasonEntry } from "@/lib/calculate-price";

/**
 * The prices in a homestay page's LodgingBusiness structured data, the same
 * ones the page shows: each house's price tonight (cardPrice) and, as the
 * range, the lowest of them with a "+". Null when no house has a price.
 * `today` is a Bangkok YYYY-MM-DD (billingTodayStr).
 */
export function lodgingPrices(
  rooms: { id: string; name: string; price_per_night: number }[],
  seasons: (SeasonEntry & { room_id: string })[],
  today: string,
): { priceRange: string; makesOffer: { "@type": "Offer"; name: string; price: number; priceCurrency: "THB"; availability: string }[] } | null {
  const shown = rooms.map((r) => ({
    name: r.name,
    price: cardPrice(r.price_per_night, seasons.filter((s) => s.room_id === r.id), today),
  }));
  const priced = shown.map((s) => s.price).filter((p) => p > 0);
  if (priced.length === 0) return null;
  return {
    priceRange: `฿${Math.min(...priced).toLocaleString()}+`,
    makesOffer: shown.map((s) => ({
      "@type": "Offer",
      name: s.name,
      price: s.price,
      priceCurrency: "THB",
      availability: "https://schema.org/InStock",
    })),
  };
}
