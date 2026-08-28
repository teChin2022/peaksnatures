import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateTotalPrice,
  getPriceRange,
  type SeasonEntry,
  type SpecialPriceEntry,
} from "@/lib/calculate-price";

/** Local-time date, so the night keys don't depend on how the string is parsed. */
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

/** 2026-01-03 is a Saturday, 01-04 a Sunday, 01-05 a Monday. */
const SAT = d(2026, 1, 3);
const SUN = d(2026, 1, 4);
const MON = d(2026, 1, 5);
const TUE = d(2026, 1, 6);

const season = (over: Partial<SeasonEntry> = {}): SeasonEntry => ({
  start_date: "2026-01-01",
  end_date: "2026-01-31",
  price_per_night: 2000,
  name: "High season",
  ...over,
});

const special = (over: Partial<SpecialPriceEntry> = {}): SpecialPriceEntry => ({
  rule_type: "weekday",
  weekdays: [6],
  dates: [],
  start_date: null,
  end_date: null,
  surcharge: 500,
  ...over,
});

describe("calculateTotalPrice", () => {
  it("charges the base price for every night with no seasons or specials", () => {
    const { total, breakdown } = calculateTotalPrice({
      basePricePerNight: 1000,
      checkIn: SAT,
      checkOut: MON,
      seasons: [],
      specialPrices: [],
    });

    expect(total).toBe(2000);
    expect(breakdown).toEqual([
      { date: "2026-01-03", price: 1000, seasonName: undefined, rateKind: undefined, surcharge: undefined },
      { date: "2026-01-04", price: 1000, seasonName: undefined, rateKind: undefined, surcharge: undefined },
    ]);
  });

  it("occupies check_in through check_out - 1, never the check-out night", () => {
    const { breakdown } = calculateTotalPrice({
      basePricePerNight: 1000,
      checkIn: SAT,
      checkOut: TUE,
      seasons: [],
      specialPrices: [],
    });

    expect(breakdown.map((n) => n.date)).toEqual(["2026-01-03", "2026-01-04", "2026-01-05"]);
  });

  it("returns an empty stay when check-out is on or before check-in", () => {
    for (const checkOut of [SAT, d(2026, 1, 2)]) {
      expect(
        calculateTotalPrice({
          basePricePerNight: 1000,
          checkIn: SAT,
          checkOut,
          seasons: [],
          specialPrices: [],
        }),
      ).toEqual({ total: 0, breakdown: [] });
    }
  });

  it("replaces the base price with the seasonal price where a season covers the night", () => {
    const { total, breakdown } = calculateTotalPrice({
      basePricePerNight: 1000,
      checkIn: SAT,
      checkOut: MON,
      seasons: [season({ price_per_night: 2000 })],
      specialPrices: [],
    });

    expect(total).toBe(4000);
    expect(breakdown[0]).toMatchObject({ price: 2000, rateKind: "season", seasonName: "High season" });
  });

  it("uses the first overlapping season in array order", () => {
    const { breakdown } = calculateTotalPrice({
      basePricePerNight: 1000,
      checkIn: SAT,
      checkOut: SUN,
      seasons: [season({ name: "First", price_per_night: 2000 }), season({ name: "Second", price_per_night: 3000 })],
      specialPrices: [],
    });

    expect(breakdown[0]).toMatchObject({ price: 2000, seasonName: "First" });
  });

  it("adds the special surcharge on top of the base price", () => {
    const { total, breakdown } = calculateTotalPrice({
      basePricePerNight: 1000,
      checkIn: SAT,
      checkOut: SUN,
      seasons: [],
      specialPrices: [special({ weekdays: [6], surcharge: 500, name: "Saturday" })],
    });

    expect(total).toBe(1500);
    expect(breakdown[0]).toMatchObject({
      price: 1500,
      rateKind: "special",
      surcharge: 500,
      seasonName: "Saturday",
    });
  });

  it("adds the surcharge on top of the seasonal price, not the base price", () => {
    const { total } = calculateTotalPrice({
      basePricePerNight: 1000,
      checkIn: SAT,
      checkOut: SUN,
      seasons: [season({ price_per_night: 2000 })],
      specialPrices: [special({ weekdays: [6], surcharge: 500 })],
    });

    // 2000 (season) + 500 (surcharge), not 1000 + 500.
    expect(total).toBe(2500);
  });

  it("never stacks two matching surcharges on one night", () => {
    const { total } = calculateTotalPrice({
      basePricePerNight: 1000,
      checkIn: SAT,
      checkOut: SUN,
      seasons: [],
      specialPrices: [
        special({ weekdays: [6], surcharge: 500 }),
        special({ weekdays: [0, 6], surcharge: 300 }),
      ],
    });

    expect(total).toBe(1500);
  });

  it("only charges a weekday rule on its own weekdays", () => {
    const { breakdown } = calculateTotalPrice({
      basePricePerNight: 1000,
      checkIn: SAT,
      checkOut: MON,
      seasons: [],
      specialPrices: [special({ weekdays: [6], surcharge: 500 })],
    });

    expect(breakdown.map((n) => n.price)).toEqual([1500, 1000]);
  });

  it("honours a weekday rule's start/end window and its open-ended bounds", () => {
    const priceOn = (over: Partial<SpecialPriceEntry>) =>
      calculateTotalPrice({
        basePricePerNight: 1000,
        checkIn: SAT,
        checkOut: SUN,
        seasons: [],
        specialPrices: [special({ weekdays: [6], surcharge: 500, ...over })],
      }).total;

    expect(priceOn({ start_date: "2026-01-01", end_date: "2026-01-31" })).toBe(1500);
    expect(priceOn({ start_date: "2026-02-01", end_date: null })).toBe(1000); // starts later
    expect(priceOn({ start_date: null, end_date: "2025-12-31" })).toBe(1000); // already ended
    expect(priceOn({ start_date: "2026-01-01", end_date: null })).toBe(1500); // open-ended right
    expect(priceOn({ start_date: null, end_date: "2026-01-31" })).toBe(1500); // open-ended left
  });

  it("matches a date rule only against its explicit date list", () => {
    const { breakdown } = calculateTotalPrice({
      basePricePerNight: 1000,
      checkIn: SAT,
      checkOut: MON,
      seasons: [],
      specialPrices: [special({ rule_type: "date", weekdays: [], dates: ["2026-01-04"], surcharge: 700 })],
    });

    expect(breakdown.map((n) => n.price)).toEqual([1000, 1700]);
  });

  it("treats is_active undefined as active and excludes only explicit false", () => {
    const totalFor = (is_active: boolean | undefined) =>
      calculateTotalPrice({
        basePricePerNight: 1000,
        checkIn: SAT,
        checkOut: SUN,
        seasons: [],
        specialPrices: [special({ weekdays: [6], surcharge: 500, is_active })],
      }).total;

    expect(totalFor(undefined)).toBe(1500);
    expect(totalFor(true)).toBe(1500);
    expect(totalFor(false)).toBe(1000);
  });

  describe("rule precedence", () => {
    const winningSurchargeOn = (specialPrices: SpecialPriceEntry[]) =>
      calculateTotalPrice({
        basePricePerNight: 1000,
        checkIn: SAT,
        checkOut: SUN,
        seasons: [],
        specialPrices,
      }).breakdown[0].surcharge;

    it("prefers an explicit date rule over a weekday rule", () => {
      const rules = [
        special({ weekdays: [6], surcharge: 500 }),
        special({ rule_type: "date", weekdays: [], dates: ["2026-01-03"], surcharge: 900 }),
      ];

      expect(winningSurchargeOn(rules)).toBe(900);
      expect(winningSurchargeOn([...rules].reverse())).toBe(900);
    });

    it("prefers a bounded window over an open-ended rule", () => {
      const rules = [
        special({ weekdays: [6], surcharge: 500, start_date: null, end_date: null }),
        special({ weekdays: [6], surcharge: 900, start_date: "2026-01-01", end_date: null }),
      ];

      expect(winningSurchargeOn(rules)).toBe(900);
      expect(winningSurchargeOn([...rules].reverse())).toBe(900);
    });

    it("prefers the narrower weekday rule: [Sat] beats [Sat, Sun]", () => {
      const rules = [
        special({ weekdays: [0, 6], surcharge: 500 }),
        special({ weekdays: [6], surcharge: 900 }),
      ];

      expect(winningSurchargeOn(rules)).toBe(900);
      expect(winningSurchargeOn([...rules].reverse())).toBe(900);
    });

    it("breaks a genuine tie with the newest created_at", () => {
      const rules = [
        special({ weekdays: [6], surcharge: 500, created_at: "2026-01-01T00:00:00Z" }),
        special({ weekdays: [6], surcharge: 900, created_at: "2026-02-01T00:00:00Z" }),
      ];

      expect(winningSurchargeOn(rules)).toBe(900);
      expect(winningSurchargeOn([...rules].reverse())).toBe(900);
    });

    it("breaks a tie between two date rules on created_at, without weekday breadth", () => {
      const onDate = (surcharge: number, created_at: string) =>
        special({ rule_type: "date", weekdays: [], dates: ["2026-01-03"], surcharge, created_at });
      const rules = [onDate(500, "2026-01-01T00:00:00Z"), onDate(900, "2026-02-01T00:00:00Z")];

      expect(winningSurchargeOn(rules)).toBe(900);
      expect(winningSurchargeOn([...rules].reverse())).toBe(900);
    });

    it("treats a rule with no created_at as the oldest", () => {
      const dated = special({ weekdays: [6], surcharge: 900, created_at: "2020-01-01T00:00:00Z" });
      const undated = special({ weekdays: [6], surcharge: 500 });

      expect(winningSurchargeOn([undated, dated])).toBe(900);
      expect(winningSurchargeOn([dated, undated])).toBe(900);
    });

    it("keeps a stable answer when neither rule has a created_at", () => {
      const rules = [special({ weekdays: [6], surcharge: 500 }), special({ weekdays: [6], surcharge: 900 })];
      expect(winningSurchargeOn(rules)).toBe(500);
      expect(winningSurchargeOn([...rules].reverse())).toBe(900);
    });

    it("gives the same answer whatever order the DB returns the rules in", () => {
      // "every weekend ฿2,500" then "every Saturday ฿3,000" — the narrower rule wins.
      const weekend = special({ weekdays: [0, 6], surcharge: 1500, created_at: "2026-01-01T00:00:00Z" });
      const saturday = special({ weekdays: [6], surcharge: 2000, created_at: "2025-01-01T00:00:00Z" });

      expect(winningSurchargeOn([weekend, saturday])).toBe(2000);
      expect(winningSurchargeOn([saturday, weekend])).toBe(2000);
    });
  });

  it("names the night after the special rule when one applies, else the season", () => {
    const { breakdown } = calculateTotalPrice({
      basePricePerNight: 1000,
      checkIn: SAT,
      checkOut: MON,
      seasons: [season({ name: "Songkran" })],
      specialPrices: [special({ weekdays: [6], surcharge: 500, name: "Weekend" })],
    });

    expect(breakdown[0].seasonName).toBe("Weekend"); // Saturday: special wins the label
    expect(breakdown[1].seasonName).toBe("Songkran"); // Sunday: season names it
  });

  it("does not mutate the caller's dates or arrays", () => {
    const checkIn = d(2026, 1, 3);
    const checkOut = d(2026, 1, 6);
    const specialPrices = [special({ weekdays: [0] }), special({ rule_type: "date", dates: ["2026-01-03"] })];
    const order = specialPrices.map((s) => s.rule_type);

    calculateTotalPrice({ basePricePerNight: 1000, checkIn, checkOut, seasons: [], specialPrices });

    expect(checkIn).toEqual(d(2026, 1, 3));
    expect(checkOut).toEqual(d(2026, 1, 6));
    expect(specialPrices.map((s) => s.rule_type)).toEqual(order);
  });
});

describe("getPriceRange", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("spans the base price alone when there is nothing else configured", () => {
    expect(getPriceRange({ basePricePerNight: 1000, seasons: [], specialPrices: [] })).toEqual({
      min: 1000,
      max: 1000,
    });
  });

  it("takes the floor from the cheapest tier and the ceiling from the dearest plus the largest surcharge", () => {
    expect(
      getPriceRange({
        basePricePerNight: 1000,
        seasons: [season({ price_per_night: 2500 }), season({ price_per_night: 800 })],
        specialPrices: [special({ surcharge: 300 }), special({ surcharge: 700 })],
      }),
    ).toEqual({ min: 800, max: 3200 });
  });

  it("ignores special rules whose window has already elapsed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(d(2026, 6, 1));

    expect(
      getPriceRange({
        basePricePerNight: 1000,
        seasons: [],
        specialPrices: [
          special({ surcharge: 5000, end_date: "2026-01-31" }), // spent
          special({ surcharge: 400, end_date: "2026-12-31" }), // still live
        ],
      }),
    ).toEqual({ min: 1000, max: 1400 });
  });

  it("keeps an open-ended special rule and one ending today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(d(2026, 6, 1));

    expect(
      getPriceRange({
        basePricePerNight: 1000,
        seasons: [],
        specialPrices: [special({ surcharge: 400, end_date: null })],
      }).max,
    ).toBe(1400);

    expect(
      getPriceRange({
        basePricePerNight: 1000,
        seasons: [],
        specialPrices: [special({ surcharge: 400, end_date: "2026-06-01" })],
      }).max,
    ).toBe(1400);
  });

  it("ignores deactivated special rules", () => {
    expect(
      getPriceRange({
        basePricePerNight: 1000,
        seasons: [],
        specialPrices: [special({ surcharge: 5000, is_active: false })],
      }),
    ).toEqual({ min: 1000, max: 1000 });
  });
});
