import { describe, expect, it } from "vitest";
import { cardPrice, homestayPrice, upcomingSeasons } from "@/lib/room-rates";

const TODAY = "2026-11-05";

describe("upcomingSeasons", () => {
  it("drops a season that ended before today and keeps one ending today or later", () => {
    const seasons = [
      { id: "aug", end_date: "2026-08-31" },
      { id: "today", end_date: "2026-11-05" },
      { id: "dec", end_date: "2026-12-31" },
    ];
    expect(upcomingSeasons(seasons, TODAY).map((s) => s.id)).toEqual(["today", "dec"]);
  });
});

const season = (start_date: string, end_date: string, price_per_night: number) => ({ start_date, end_date, price_per_night });

describe("cardPrice", () => {
  it("is the base price when no season covers tonight", () => {
    expect(cardPrice(1500, [], TODAY)).toBe(1500);
  });

  it("is the season's price when one covers tonight, dearer or cheaper", () => {
    expect(cardPrice(1500, [season("2026-11-01", "2026-11-30", 2500)], TODAY)).toBe(2500);
    expect(cardPrice(1500, [season("2026-11-01", "2026-11-30", 1200)], TODAY)).toBe(1200);
  });

  it("never quotes a cheaper season that has not started, or one that has ended", () => {
    expect(cardPrice(1500, [season("2027-05-01", "2027-05-31", 900)], TODAY)).toBe(1500);
    expect(cardPrice(1500, [season("2026-08-01", "2026-08-31", 900)], TODAY)).toBe(1500);
  });

  it("counts a season's first and last day as in it", () => {
    expect(cardPrice(1500, [season("2026-11-05", "2026-11-10", 2000)], TODAY)).toBe(2000);
    expect(cardPrice(1500, [season("2026-11-01", "2026-11-05", 2000)], TODAY)).toBe(2000);
  });
});

describe("homestayPrice", () => {
  const room = (id: string, price_per_night: number) => ({ id, price_per_night });
  const own = (room_id: string, price: number) => ({ ...season("2026-11-01", "2026-11-30", price), room_id });

  it("is the one price, not 'from', when every house costs the same tonight", () => {
    expect(homestayPrice([room("a", 1500), room("b", 1500)], [], TODAY)).toEqual({ price: 1500, from: false });
  });

  it("is the cheapest house tonight, marked 'from', when they differ", () => {
    expect(homestayPrice([room("a", 1500), room("b", 900)], [], TODAY)).toEqual({ price: 900, from: true });
  });

  it("prices each house over its own season only", () => {
    expect(homestayPrice([room("a", 1500), room("b", 1500)], [own("a", 2500)], TODAY)).toEqual({ price: 1500, from: true });
    expect(homestayPrice([room("a", 1500)], [own("b", 500)], TODAY)).toEqual({ price: 1500, from: false });
  });

  it("is null when no house has a price", () => {
    expect(homestayPrice([], [], TODAY)).toBeNull();
    expect(homestayPrice([room("a", 0)], [], TODAY)).toBeNull();
  });
});
