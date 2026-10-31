import { describe, expect, it } from "vitest";
import { TOPUP_AMOUNTS, isTopupAmount } from "./topup-amounts";

describe("TOPUP_AMOUNTS", () => {
  // Pinned deliberately: the wallet page and /api/host/wallet/topup both render
  // or enforce this exact list, so a silent edit here should fail rather than
  // quietly widen what a host can send.
  it("offers exactly ฿500, ฿1,000 and ฿1,500", () => {
    expect(TOPUP_AMOUNTS).toEqual([500, 1000, 1500]);
  });

  it("is ordered smallest first, for rendering left to right", () => {
    expect([...TOPUP_AMOUNTS]).toEqual([...TOPUP_AMOUNTS].sort((a, b) => a - b));
  });
});

describe("isTopupAmount", () => {
  it.each(TOPUP_AMOUNTS)("accepts ฿%i", (amount) => {
    expect(isTopupAmount(amount)).toBe(true);
  });

  it.each([300, 499, 501, 999, 1001, 2000, 3000, 5000])("rejects ฿%i", (amount) => {
    expect(isTopupAmount(amount)).toBe(false);
  });

  it("rejects zero, negatives and fractions", () => {
    expect(isTopupAmount(0)).toBe(false);
    expect(isTopupAmount(-1000)).toBe(false);
    expect(isTopupAmount(1000.5)).toBe(false);
  });

  it("rejects the values a bad request body coerces to", () => {
    expect(isTopupAmount(Number("one thousand"))).toBe(false);
    expect(isTopupAmount(Number(""))).toBe(false);
    expect(isTopupAmount(Infinity)).toBe(false);
  });
});
