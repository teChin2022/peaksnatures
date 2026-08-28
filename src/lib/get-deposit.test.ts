import { describe, expect, it } from "vitest";
import { getDepositForMonth } from "@/lib/get-deposit";

const june = new Date(2026, 5, 15); // month index 5 -> key "6"
const december = new Date(2026, 11, 24); // -> key "12"

describe("getDepositForMonth", () => {
  it("uses the flat deposit when no check-in date is known", () => {
    expect(getDepositForMonth({ deposit_amount: 1500, deposit_by_month: { "6": 3000 } }, undefined)).toBe(1500);
  });

  it("falls back to 0 when no flat deposit is configured", () => {
    expect(getDepositForMonth({ deposit_amount: 0, deposit_by_month: null }, undefined)).toBe(0);
    expect(getDepositForMonth({ deposit_amount: 0, deposit_by_month: null }, june)).toBe(0);
  });

  it("prefers the per-month deposit for the check-in month", () => {
    const host = { deposit_amount: 1500, deposit_by_month: { "6": 3000, "12": 5000 } };
    expect(getDepositForMonth(host, june)).toBe(3000);
    expect(getDepositForMonth(host, december)).toBe(5000);
  });

  it("honours an explicit zero for a month instead of falling back", () => {
    expect(getDepositForMonth({ deposit_amount: 1500, deposit_by_month: { "6": 0 } }, june)).toBe(0);
  });

  it("treats a month key holding no value as no deposit", () => {
    const host = { deposit_amount: 1500, deposit_by_month: { "6": undefined } as unknown as Record<string, number> };
    expect(getDepositForMonth(host, june)).toBe(0);
  });

  it("falls back to the flat deposit for a month with no entry", () => {
    expect(getDepositForMonth({ deposit_amount: 1500, deposit_by_month: { "12": 5000 } }, june)).toBe(1500);
  });

  it("falls back when there is no per-month map at all", () => {
    expect(getDepositForMonth({ deposit_amount: 1500, deposit_by_month: null }, june)).toBe(1500);
  });

  it("keys months without zero padding, so a padded key does not match", () => {
    expect(getDepositForMonth({ deposit_amount: 1500, deposit_by_month: { "06": 3000 } }, june)).toBe(1500);
    // December is two digits either way, so it matches.
    expect(getDepositForMonth({ deposit_amount: 1500, deposit_by_month: { "12": 5000 } }, december)).toBe(5000);
  });

  it("resolves January and December to keys 1 and 12", () => {
    const host = { deposit_amount: 0, deposit_by_month: { "1": 111, "12": 999 } };
    expect(getDepositForMonth(host, new Date(2026, 0, 5))).toBe(111);
    expect(getDepositForMonth(host, new Date(2026, 11, 5))).toBe(999);
  });
});
