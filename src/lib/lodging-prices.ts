import { cardPrice } from "@/lib/room-rates";
import type { SeasonEntry, SpecialPriceEntry } from "@/lib/calculate-price";

/**
 * The prices in a homestay page's LodgingBusiness structured data, the same
 * ones the page shows: each house's card price (cardPrice) and, as the range,
 * the lowest of them with a "+" (the Book bar's "from" floor). Null when no
 * house has a price. Pass only seasons that have not ended.
 */
export function lodgingPrices(
  rooms: { id: string; name: string; price_per_night: number }[],
  seasons: (SeasonEntry & { room_id: string })[],
  specialPrices: (SpecialPriceEntry & { room_id: string })[],
): { priceRange: string; makesOffer: { "@type": "Offer"; name: string; price: number; priceCurrency: "THB"; availability: string }[] } | null {
  const shown = rooms.map((r) => ({
    name: r.name,
    price: cardPrice(r.price_per_night, seasons.filter((s) => s.room_id === r.id), specialPrices.filter((s) => s.room_id === r.id)).price,
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
