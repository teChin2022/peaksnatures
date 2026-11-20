import { describe, expect, it } from "vitest";
import { homestayCapacity } from "./homestay-capacity";

describe("homestayCapacity", () => {
  it("adds every active house's guests times how many of it there are", () => {
    // Pinned from the 2026-11-20 review: five 6-guest tents told guests "up to 2".
    expect(homestayCapacity([
      { max_guests: 2, quantity: 1, is_active: true },
      { max_guests: 6, quantity: 5, is_active: true },
    ])).toBe(32);
  });

  it("leaves out houses that are switched off", () => {
    expect(homestayCapacity([
      { max_guests: 4, quantity: 1, is_active: true },
      { max_guests: 10, quantity: 2, is_active: false },
    ])).toBe(4);
  });

  it("counts a missing quantity as one house, and no houses as 0 (the page hides the line)", () => {
    expect(homestayCapacity([{ max_guests: 3, quantity: null }])).toBe(3);
    expect(homestayCapacity([])).toBe(0);
  });
});
