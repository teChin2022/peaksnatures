import { describe, expect, it } from "vitest";
import { lodgingPrices } from "@/lib/lodging-prices";

const TODAY = "2026-11-05";
const room = (id: string, price: number) => ({ id, name: `Baan ${id}`, price_per_night: price });
const season = (room_id: string, price: number, start_date = "2026-11-01", end_date = "2026-11-30") => ({ room_id, start_date, end_date, price_per_night: price });

describe("lodgingPrices", () => {
  it("offers each house at tonight's price, the season's when one covers today", () => {
    const ld = lodgingPrices([room("a", 1500), room("b", 2000)], [season("a", 2500)], TODAY)!;
    expect(ld.makesOffer.map((o) => [o.name, o.price])).toEqual([["Baan a", 2500], ["Baan b", 2000]]);
    expect(ld.makesOffer[0]).toMatchObject({ "@type": "Offer", priceCurrency: "THB", availability: "https://schema.org/InStock" });
  });

  it("gives the lowest of those as the range, with a plus", () => {
    expect(lodgingPrices([room("a", 1500), room("b", 2000)], [season("b", 900)], TODAY)!.priceRange).toBe("฿900+");
  });

  it("keeps the base price when the only season is still ahead", () => {
    expect(lodgingPrices([room("a", 1500)], [season("a", 900, "2027-05-01", "2027-05-31")], TODAY)!.makesOffer[0].price).toBe(1500);
  });

  it("is nothing when no house has a price", () => {
    expect(lodgingPrices([], [], TODAY)).toBeNull();
    expect(lodgingPrices([room("a", 0)], [], TODAY)).toBeNull();
  });
});
