import { describe, expect, it } from "vitest";
import { isBookingBarVisible } from "@/components/booking/bar-visibility";

const base = { footerInView: false, step: "dates", cardInView: false } as const;

describe("isBookingBarVisible", () => {
  it("shows the bar while browsing dates and houses", () => {
    expect(isBookingBarVisible(base)).toBe(true);
  });

  it("hides it once the footer scrolls in", () => {
    expect(isBookingBarVisible({ ...base, footerInView: true })).toBe(false);
  });

  it("hides it past step 1 (details, payment)", () => {
    expect(isBookingBarVisible({ ...base, step: "details" })).toBe(false);
    expect(isBookingBarVisible({ ...base, step: "payment" })).toBe(false);
  });

  // The bar is 77px tall and fixed to the bottom; with the checkout card on screen it
  // sat on top of the step-1 "continue" button.
  it("hides it while the booking card is on screen", () => {
    expect(isBookingBarVisible({ ...base, cardInView: true })).toBe(false);
  });
});
