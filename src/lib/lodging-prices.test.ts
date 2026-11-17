import { describe, expect, it } from "vitest";
import { lodgingPrices } from "@/lib/lodging-prices";

const room = (id: string, price: number) => ({ id, name: `Baan ${id}`, price_per_night: price });
const season = (room_id: string, price: number) => ({ room_id, start_date: "2099-01-01", end_date: "2099-01-31", price_per_night: price });

describe("lodgingPrices", () => {
  it("offers each house at its card price, not its base price, when a season is cheaper", () => {
    const ld = lodgingPrices([room("a", 1500), room("b", 2000)], [season("a", 1200)], [])!;
    expect(ld.makesOffer.map((o) => [o.name, o.price])).toEqual([["Baan a", 1200], ["Baan b", 2000]]);
    expect(ld.makesOffer[0]).toMatchObject({ "@type": "Offer", priceCurrency: "THB", availability: "https://schema.org/InStock" });
  });

  it("gives the lowest card price as the range, with a plus", () => {
    expect(lodgingPrices([room("a", 1500), room("b", 2000)], [season("b", 900)], [])!.priceRange).toBe("฿900+");
  });

  it("keeps the base price when a season only costs more", () => {
    expect(lodgingPrices([room("a", 1500)], [season("a", 2500)], [])!.makesOffer[0].price).toBe(1500);
  });

  it("is nothing when no house has a price", () => {
    expect(lodgingPrices([], [], [])).toBeNull();
    expect(lodgingPrices([room("a", 0)], [], [])).toBeNull();
  });
});
