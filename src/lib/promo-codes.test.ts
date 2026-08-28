import { describe, expect, it, vi } from "vitest";
import { computeCommissionAmount, computePromoDiscount, evaluatePromoCode } from "@/lib/promo-codes";
import { makePromoCode } from "../../test/fixtures/db";

const NOW = new Date(2026, 5, 15); // 2026-06-15, local

describe("evaluatePromoCode", () => {
  it("accepts a plain active code", () => {
    expect(evaluatePromoCode(makePromoCode(), { now: NOW })).toEqual({ ok: true });
  });

  it("rejects an inactive code before looking at anything else", () => {
    const promo = makePromoCode({ is_active: false, expires_at: "2020-01-01", max_uses: 0 });
    expect(evaluatePromoCode(promo, { now: NOW })).toEqual({ ok: false, reason: "INACTIVE" });
  });

  it("rejects a code whose start date has not arrived", () => {
    const promo = makePromoCode({ start_at: "2026-07-01" });
    expect(evaluatePromoCode(promo, { now: NOW })).toEqual({ ok: false, reason: "NOT_STARTED" });
  });

  it("accepts a code on its first and last day", () => {
    expect(evaluatePromoCode(makePromoCode({ start_at: "2026-06-15" }), { now: NOW })).toEqual({ ok: true });
    expect(evaluatePromoCode(makePromoCode({ expires_at: "2026-06-15" }), { now: NOW })).toEqual({ ok: true });
  });

  it("rejects a code the day after it expires", () => {
    const promo = makePromoCode({ expires_at: "2026-06-14" });
    expect(evaluatePromoCode(promo, { now: NOW })).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("prefers NOT_STARTED over EXPIRED when a window is inverted", () => {
    const promo = makePromoCode({ start_at: "2026-07-01", expires_at: "2026-01-01" });
    expect(evaluatePromoCode(promo, { now: NOW })).toEqual({ ok: false, reason: "NOT_STARTED" });
  });

  it("rejects a code that has reached max_uses", () => {
    expect(evaluatePromoCode(makePromoCode({ max_uses: 5, times_used: 5 }), { now: NOW })).toEqual({
      ok: false,
      reason: "MAX_USES",
    });
    expect(evaluatePromoCode(makePromoCode({ max_uses: 5, times_used: 6 }), { now: NOW })).toEqual({
      ok: false,
      reason: "MAX_USES",
    });
  });

  it("treats max_uses 0 as immediately exhausted, and null as unlimited", () => {
    expect(evaluatePromoCode(makePromoCode({ max_uses: 0 }), { now: NOW })).toEqual({
      ok: false,
      reason: "MAX_USES",
    });
    expect(evaluatePromoCode(makePromoCode({ max_uses: null, times_used: 9999 }), { now: NOW })).toEqual({
      ok: true,
    });
  });

  it("falls back to the current date when no now is injected", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(evaluatePromoCode(makePromoCode({ expires_at: "2026-06-14" }))).toEqual({
      ok: false,
      reason: "EXPIRED",
    });
    vi.useRealTimers();
  });
});

describe("computePromoDiscount", () => {
  it("takes a percentage of the subtotal, floored", () => {
    const promo = makePromoCode({ discount_type: "percentage", discount_value: 10 });
    expect(computePromoDiscount(promo, 1000)).toBe(100);
    expect(computePromoDiscount(promo, 1055)).toBe(105); // 105.5 floored
  });

  it("takes a fixed amount, floored", () => {
    const promo = makePromoCode({ discount_type: "fixed", discount_value: 250.9 });
    expect(computePromoDiscount(promo, 1000)).toBe(250);
  });

  it("never discounts more than the subtotal", () => {
    expect(computePromoDiscount(makePromoCode({ discount_type: "fixed", discount_value: 5000 }), 1000)).toBe(1000);
    expect(
      computePromoDiscount(makePromoCode({ discount_type: "percentage", discount_value: 150 }), 1000),
    ).toBe(1000);
  });

  it("returns 0 for a non-positive subtotal", () => {
    const promo = makePromoCode({ discount_type: "fixed", discount_value: 250 });
    expect(computePromoDiscount(promo, 0)).toBe(0);
    expect(computePromoDiscount(promo, -100)).toBe(0);
  });

  it("returns 0 for a missing, zero, negative or non-finite discount value", () => {
    for (const discount_value of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(computePromoDiscount(makePromoCode({ discount_type: "fixed", discount_value }), 1000)).toBe(0);
    }
  });
});

describe("computeCommissionAmount", () => {
  const recommender = { recommender_name: "Ann", commission_type: "percentage" as const, commission_value: 5 };

  it("pays a percentage of the subtotal, floored", () => {
    expect(computeCommissionAmount(makePromoCode(recommender), 1000)).toBe(50);
    expect(computeCommissionAmount(makePromoCode(recommender), 1019)).toBe(50); // 50.95 floored
  });

  it("pays a fixed amount, floored", () => {
    const promo = makePromoCode({ ...recommender, commission_type: "fixed", commission_value: 99.9 });
    expect(computeCommissionAmount(promo, 1000)).toBe(99);
  });

  it("returns 0 unless a recommender, a type and a value are all present", () => {
    expect(computeCommissionAmount(makePromoCode({ ...recommender, recommender_name: null }), 1000)).toBe(0);
    expect(computeCommissionAmount(makePromoCode({ ...recommender, commission_type: null }), 1000)).toBe(0);
    expect(computeCommissionAmount(makePromoCode({ ...recommender, commission_value: null }), 1000)).toBe(0);
  });

  it("treats a zero commission value as no commission", () => {
    expect(computeCommissionAmount(makePromoCode({ ...recommender, commission_value: 0 }), 1000)).toBe(0);
  });

  it("returns 0 for a non-positive subtotal", () => {
    expect(computeCommissionAmount(makePromoCode(recommender), 0)).toBe(0);
    expect(computeCommissionAmount(makePromoCode(recommender), -100)).toBe(0);
  });

  // KNOWN GAP: unlike computePromoDiscount, this is clamped at 0 only — not at the
  // subtotal — so a misconfigured code can pay a recommender more than the booking.
  it("is NOT clamped to the subtotal, so an over-100% commission is permitted", () => {
    const promo = makePromoCode({ ...recommender, commission_value: 150 });
    expect(computeCommissionAmount(promo, 1000)).toBe(1500);
  });
});
