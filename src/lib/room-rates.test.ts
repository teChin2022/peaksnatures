import { describe, expect, it } from "vitest";
import { cardPrice, upcomingSeasons } from "@/lib/room-rates";

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

describe("cardPrice", () => {
  const season = (price: number) => ({ start_date: "2026-12-01", end_date: "2026-12-31", price_per_night: price });
  const special = (surcharge: number) => ({ id: "s", room_id: "r", name: "weekend", surcharge, start_date: null, end_date: null, day_of_week: [6], is_active: true });

  it("is the one rate, with no 'from', when the house has only its base price", () => {
    expect(cardPrice(1500, [], [])).toEqual({ price: 1500, from: false });
  });

  it("is the lowest night, marked 'from', when a season is cheaper", () => {
    expect(cardPrice(1500, [season(1200)], [])).toEqual({ price: 1200, from: true });
  });

  it("stays the base price, marked 'from', when a season or a special only costs more", () => {
    expect(cardPrice(1500, [season(2000)], [])).toEqual({ price: 1500, from: true });
    expect(cardPrice(1500, [], [special(300)] as never)).toEqual({ price: 1500, from: true });
  });
});
