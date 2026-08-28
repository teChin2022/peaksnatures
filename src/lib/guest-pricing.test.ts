import { describe, expect, it } from "vitest";
import {
  composeLineGuestLabel,
  composeTierLabel,
  computeCompositionSurcharge,
  hasDefaultPriceTier,
  resolveGuestPricing,
  type TierPricingInput,
} from "@/lib/guest-pricing";

const tier = (over: Partial<TierPricingInput> = {}): TierPricingInput => ({
  id: "tier-1",
  adults: 2,
  children: 0,
  detail: null,
  surcharge: 0,
  sort_order: 0,
  ...over,
});

describe("composeTierLabel", () => {
  it("defaults to Thai and puts the word before the count", () => {
    expect(composeTierLabel({ adults: 2, children: 1, detail: null })).toBe("ผู้ใหญ่ 2 เด็ก 1");
  });

  it("puts the count before the word in English and joins with a comma", () => {
    expect(composeTierLabel({ adults: 2, children: 1, detail: null }, "en")).toBe("2 Adults, 1 Children");
  });

  it("treats any en-* locale as English", () => {
    expect(composeTierLabel({ adults: 2, children: 0, detail: null }, "en-GB")).toBe("2 Adults");
  });

  it("drops a zero adults count when there are children", () => {
    expect(composeTierLabel({ adults: 0, children: 1, detail: null })).toBe("เด็ก 1");
    expect(composeTierLabel({ adults: 0, children: 1, detail: null }, "en")).toBe("1 Children");
  });

  it("keeps the adults segment when both counts are zero, so the label is never empty", () => {
    expect(composeTierLabel({ adults: 0, children: 0, detail: null })).toBe("ผู้ใหญ่ 0");
  });

  it("omits the children segment when there are none", () => {
    expect(composeTierLabel({ adults: 2, children: 0, detail: null })).toBe("ผู้ใหญ่ 2");
  });

  it("appends trimmed host detail, with a separator only in English", () => {
    expect(composeTierLabel({ adults: 2, children: 1, detail: "  อายุ 0-5 ปี  " })).toBe(
      "ผู้ใหญ่ 2 เด็ก 1 อายุ 0-5 ปี",
    );
    expect(composeTierLabel({ adults: 2, children: 1, detail: "อายุ 0-5 ปี" }, "en")).toBe(
      "2 Adults, 1 Children · อายุ 0-5 ปี",
    );
  });

  it("ignores null, empty and whitespace-only detail", () => {
    for (const detail of [null, "", "   "]) {
      expect(composeTierLabel({ adults: 2, children: 0, detail })).toBe("ผู้ใหญ่ 2");
    }
  });
});

describe("computeCompositionSurcharge", () => {
  it("charges the surcharge once per night", () => {
    expect(computeCompositionSurcharge(500, 3)).toBe(1500);
  });

  it("returns 0 when there is no surcharge", () => {
    expect(computeCompositionSurcharge(0, 3)).toBe(0);
  });

  it("returns 0 for a zero or negative night count", () => {
    expect(computeCompositionSurcharge(500, 0)).toBe(0);
    expect(computeCompositionSurcharge(500, -2)).toBe(0);
  });
});

describe("hasDefaultPriceTier", () => {
  it("is true when some tier charges the room's normal rate", () => {
    expect(hasDefaultPriceTier([{ surcharge: 0 }, { surcharge: 500 }])).toBe(true);
  });

  it("is false when every tier costs extra, or there are no tiers", () => {
    expect(hasDefaultPriceTier([{ surcharge: 300 }, { surcharge: 500 }])).toBe(false);
    expect(hasDefaultPriceTier([])).toBe(false);
  });
});

describe("resolveGuestPricing", () => {
  describe("base-tier mode (a zero-surcharge tier exists)", () => {
    const tiers = [
      tier({ id: "base", adults: 2, children: 0, surcharge: 0, sort_order: 0 }),
      tier({ id: "big", adults: 4, children: 2, surcharge: 800, sort_order: 1 }),
    ];

    it("takes the headcount from the picked tier, ignoring the stepper", () => {
      expect(resolveGuestPricing(tiers, ["big"], 99)).toEqual({
        numGuests: 6,
        surchargePerNight: 800,
        label: "ผู้ใหญ่ 4 เด็ก 2",
      });
    });

    it("falls back to the stepper when nothing is picked", () => {
      expect(resolveGuestPricing(tiers, [], 3)).toEqual({
        numGuests: 3,
        surchargePerNight: 0,
        label: null,
      });
    });

    it("charges nothing extra for the base tier itself", () => {
      expect(resolveGuestPricing(tiers, ["base"], 99)).toMatchObject({ numGuests: 2, surchargePerNight: 0 });
    });
  });

  describe("stepper mode (every tier costs extra)", () => {
    const tiers = [
      tier({ id: "extra-adult", adults: 1, children: 0, surcharge: 300, sort_order: 0 }),
      tier({ id: "extra-child", adults: 0, children: 1, surcharge: 150, sort_order: 1 }),
    ];

    it("adds ticked tiers on top of the stepper and stacks their surcharges", () => {
      expect(resolveGuestPricing(tiers, ["extra-adult", "extra-child"], 4)).toEqual({
        numGuests: 6,
        surchargePerNight: 450,
        label: "ผู้ใหญ่ 1 + เด็ก 1",
      });
    });

    it("returns the bare stepper count when nothing is ticked", () => {
      expect(resolveGuestPricing(tiers, [], 4)).toEqual({
        numGuests: 4,
        surchargePerNight: 0,
        label: null,
      });
    });
  });

  it("orders the label by sort_order, not by the order ids were passed in", () => {
    const tiers = [
      tier({ id: "b", adults: 0, children: 1, surcharge: 150, sort_order: 2 }),
      tier({ id: "a", adults: 1, children: 0, surcharge: 300, sort_order: 1 }),
    ];

    expect(resolveGuestPricing(tiers, ["b", "a"], 2).label).toBe("ผู้ใหญ่ 1 + เด็ก 1");
  });

  it("ignores selected ids that do not belong to the room", () => {
    const tiers = [tier({ id: "known", surcharge: 300 })];
    expect(resolveGuestPricing(tiers, ["known", "ghost"], 2)).toMatchObject({ surchargePerNight: 300 });
  });

  it("handles a room with no tiers at all", () => {
    expect(resolveGuestPricing([], [], 5)).toEqual({ numGuests: 5, surchargePerNight: 0, label: null });
  });

  it("passes the locale through to the label", () => {
    const tiers = [tier({ id: "t", adults: 2, children: 1, surcharge: 300 })];
    expect(resolveGuestPricing(tiers, ["t"], 2, "en").label).toBe("2 Adults, 1 Children");
  });
});

describe("composeLineGuestLabel", () => {
  it("lets the tier label stand alone in base-tier mode", () => {
    const tiers = [
      tier({ id: "base", adults: 2, surcharge: 0 }),
      tier({ id: "big", adults: 4, children: 2, surcharge: 800, sort_order: 1 }),
    ];

    expect(composeLineGuestLabel(tiers, ["big"], 6, "ท่าน")).toBe("ผู้ใหญ่ 4 เด็ก 2");
  });

  it("leads with the headcount and appends the extras in stepper mode", () => {
    const tiers = [
      tier({ id: "extra-adult", adults: 1, children: 0, surcharge: 300, sort_order: 0 }),
      tier({ id: "extra-child", adults: 0, children: 1, surcharge: 150, sort_order: 1 }),
    ];

    expect(composeLineGuestLabel(tiers, ["extra-child", "extra-adult"], 6, "ท่าน")).toBe(
      "6 ท่าน · ผู้ใหญ่ 1 + เด็ก 1",
    );
  });

  it("shows the headcount alone when nothing is ticked", () => {
    const tiers = [tier({ id: "extra", adults: 1, surcharge: 300 })];
    expect(composeLineGuestLabel(tiers, [], 4, "ท่าน")).toBe("4 ท่าน");
  });

  it("shows the headcount alone in base-tier mode when nothing is picked", () => {
    const tiers = [tier({ id: "base", adults: 2, surcharge: 0 })];
    expect(composeLineGuestLabel(tiers, [], 2, "guests", "en")).toBe("2 guests");
  });
});
