import { describe, expect, it } from "vitest";
import { availabilityFacts, bookingTermsFacts, extrasFacts, priceCalendarFacts, reviewFacts, shareExtras } from "./page-facts";

const TODAY = "2026-11-19"; // a Thursday

describe("availabilityFacts", () => {
  const rooms = [
    { id: "a", name: "บ้าน A", quantity: 1 },
    { id: "b", name: "บ้าน B", quantity: 2 },
  ];

  it("lists each house's full nights in the window as ranges, as the page's calendar counts them", () => {
    const facts = availabilityFacts(
      rooms,
      [
        // a: nights 21 and 22; b: one of two units on the 21st only (still free).
        { room_id: "a", check_in: "2026-11-21", check_out: "2026-11-23" },
        { room_id: "b", check_in: "2026-11-21", check_out: "2026-11-22" },
        // b: both units on the 28th.
        { room_id: "b", check_in: "2026-11-28", check_out: "2026-11-29" },
        { room_id: "b", check_in: "2026-11-28", check_out: "2026-11-29" },
      ],
      // The whole homestay closed on 1 Dec; a alone on 5 Dec.
      [
        { room_id: null, date: "2026-12-01" },
        { room_id: "a", date: "2026-12-05" },
      ],
      TODAY,
      30,
    );
    expect(facts).toEqual({
      window: "2026-11-19 to 2026-12-18",
      rule: "every night in the window is free except those listed for that house",
      full_nights_by_house: {
        "บ้าน A": ["2026-11-21 to 2026-11-22", "2026-12-01", "2026-12-05"],
        "บ้าน B": ["2026-11-28", "2026-12-01"],
      },
    });
  });

  it("ignores nights outside the window", () => {
    const facts = availabilityFacts(rooms, [{ room_id: "a", check_in: "2026-11-10", check_out: "2026-11-12" }], [], TODAY, 10);
    expect(facts.full_nights_by_house).toEqual({ "บ้าน A": [], "บ้าน B": [] });
  });
});

describe("priceCalendarFacts", () => {
  const room = {
    price_per_night: 1000,
    room_seasonal_prices: [{ name: "ปีใหม่", start_date: "2026-12-28", end_date: "2027-01-03", price_per_night: 2000 }],
    room_special_prices: [
      { name: "เสาร์", rule_type: "weekday" as const, weekdays: [6], dates: [], start_date: null, end_date: null, surcharge: 300, is_active: true },
    ],
  };

  it("gives each month's cheapest and dearest night, priced as the page prices it", () => {
    const facts = priceCalendarFacts(room, TODAY, 60);
    // 28–31 Dec are the season's weekdays; its Saturday (2 Jan) is in January.
    expect(facts.by_month).toEqual(["2026-11: 1000-1300", "2026-12: 1000-2000", "2027-01: 1000-2300"]);
    expect(facts.cheapest_per_night).toBe(1000);
  });

  it("names the first stretches at the cheapest price", () => {
    const facts = priceCalendarFacts(room, TODAY, 14);
    // Saturdays (21st, 28th) cost more: the cheap stretches run around them.
    expect(facts.cheapest_nights).toEqual(["2026-11-19 to 2026-11-20", "2026-11-22 to 2026-11-27", "2026-11-29 to 2026-12-02"]);
  });
});

describe("extrasFacts", () => {
  it("keeps active add-ons and guest-count surcharges in plain words", () => {
    expect(
      extrasFacts({
        room_options: [
          { name: "อาหารเช้า", price: 150, pricing_type: "per_night", is_active: true },
          { name: "รับส่ง", price: 500, pricing_type: "per_time", is_active: true },
          { name: "เลิกแล้ว", price: 1, pricing_type: "per_time", is_active: false },
        ],
        room_guest_pricing: [
          { adults: 2, children: 1, detail: "(เด็กอายุเกิน 12 ปี)", surcharge: 100, is_active: true },
          { adults: 2, children: 0, detail: null, surcharge: 0, is_active: true },
          { adults: 3, children: 0, detail: null, surcharge: 200, is_active: true },
        ],
      }),
    ).toEqual({
      add_ons: ["อาหารเช้า: 150 baht per night", "รับส่ง: 500 baht once per stay"],
      // The free group size is left out.
      guest_surcharges: ["2 adults + 1 children (เด็กอายุเกิน 12 ปี): +100 baht per night", "3 adults: +200 baht per night"],
    });
  });

  it("copes with a house that has none", () => {
    expect(extrasFacts({})).toEqual({ add_ons: [], guest_surcharges: [] });
  });
});

describe("bookingTermsFacts", () => {
  it("gives the deposit by check-in month and the free-cancellation window", () => {
    expect(bookingTermsFacts({ deposit_amount: 500, deposit_by_month: { "12": 1000 }, cancellation_days: 7 })).toEqual({
      deposit: { default_baht: 500, by_check_in_month: { "12": 1000 } },
      free_cancellation_days_before_check_in: 7,
    });
    expect(bookingTermsFacts({ deposit_amount: 0, deposit_by_month: null, cancellation_days: 0 })).toEqual({
      deposit: { default_baht: 0, by_check_in_month: {} },
      free_cancellation_days_before_check_in: null,
    });
  });
});

describe("reviewFacts", () => {
  it("gives the average and the count, never review text", () => {
    expect(reviewFacts([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({ average_rating: 4.3, count: 3 });
    expect(reviewFacts([])).toEqual({ average_rating: null, count: 0 });
  });
});

describe("shareExtras", () => {
  const house = (id: string, add_ons: string[]) => ({ id, add_ons, guest_surcharges: ["3 adults: +5 baht per night"] });

  it("lifts extras every house shares to the homestay, once", () => {
    const { shared, houses } = shareExtras([house("a", ["x: 5 baht per night"]), house("b", ["x: 5 baht per night"])]);
    expect(shared).toEqual({ add_ons: ["x: 5 baht per night"], guest_surcharges: ["3 adults: +5 baht per night"] });
    expect(houses).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("keeps each house's own lists when they differ", () => {
    const input = [house("a", ["x: 5 baht per night"]), house("b", [])];
    expect(shareExtras(input)).toEqual({ shared: null, houses: input });
  });
});
