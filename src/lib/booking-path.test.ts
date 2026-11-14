import { describe, expect, it } from "vitest";
import { bookingPath } from "@/lib/booking-path";

describe("bookingPath", () => {
  it("links to the booking page when there is no promo", () => {
    expect(bookingPath("baan-mai")).toBe("/baan-mai/book");
  });

  it("trims and encodes the promo code", () => {
    expect(bookingPath("baan-mai", " a b ")).toBe("/baan-mai/book?promo=a%20b");
    expect(bookingPath("baan-mai", "A&B")).toBe("/baan-mai/book?promo=A%26B");
  });

  it("uses the first value when the param repeats", () => {
    expect(bookingPath("baan-mai", ["SUMMER", "WINTER"])).toBe("/baan-mai/book?promo=SUMMER");
  });

  it("drops a blank code", () => {
    expect(bookingPath("baan-mai", "  ")).toBe("/baan-mai/book");
    expect(bookingPath("baan-mai", [])).toBe("/baan-mai/book");
  });
});
