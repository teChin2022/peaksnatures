import { describe, expect, it } from "vitest";
import { isLinkedRowError, roomDeleteVerdict } from "./room-delete";

describe("roomDeleteVerdict", () => {
  it("refuses while the house has a booking that has not ended (owner's rule, 2026-11-20)", () => {
    expect(roomDeleteVerdict({ unfinished: 1, total: 4 })).toEqual({ allowed: false, unfinished: 1 });
  });

  it("allows a house with past bookings only, and says how many lose its name", () => {
    expect(roomDeleteVerdict({ unfinished: 0, total: 3 })).toEqual({ allowed: true, past: 3 });
  });

  it("allows a house that was never booked", () => {
    expect(roomDeleteVerdict({ unfinished: 0, total: 0 })).toEqual({ allowed: true, past: 0 });
  });
});

describe("isLinkedRowError", () => {
  it("recognises the foreign-key refusal a date-change request causes", () => {
    expect(isLinkedRowError({ code: "23503" })).toBe(true);
    expect(isLinkedRowError({ code: "42501" })).toBe(false);
    expect(isLinkedRowError(null)).toBe(false);
  });
});
