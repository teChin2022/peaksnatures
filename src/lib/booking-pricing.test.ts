import { describe, expect, it } from "vitest";
import { splitProportional } from "@/lib/booking-pricing";

describe("splitProportional", () => {
  it("splits exactly when the weights divide evenly", () => {
    expect(splitProportional(300, [1, 1, 1])).toEqual([100, 100, 100]);
    expect(splitProportional(1000, [3, 1])).toEqual([750, 250]);
  });

  it("hands the rounding remainder to the largest fractional parts", () => {
    expect(splitProportional(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  it("breaks a fractional tie in favour of the earlier index", () => {
    // Every part is exactly 3.33…, so the two spare baht go to indexes 0 and 1.
    const parts = splitProportional(11, [1, 1, 1]);
    expect(parts).toEqual([4, 4, 3]);
  });

  it("always sums back to the total, whatever the weights", () => {
    const cases: Array<[number, number[]]> = [
      [10, [1, 1, 1]],
      [9999, [7, 11, 13, 17]],
      [1, [1, 1, 1, 1, 1]],
      [12345, [1, 2, 3]],
      [100, [99999, 1]],
      [7, [0, 0, 0]],
    ];
    for (const [total, weights] of cases) {
      const parts = splitProportional(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts).toHaveLength(weights.length);
    }
  });

  it("gives a zero-weight line nothing when others carry weight", () => {
    expect(splitProportional(100, [1, 0])).toEqual([100, 0]);
  });

  it("splits as evenly as it can when every weight is zero", () => {
    expect(splitProportional(9, [0, 0, 0])).toEqual([3, 3, 3]);
    expect(splitProportional(10, [0, 0, 0])).toEqual([4, 3, 3]);
  });

  it("treats weights that sum to zero or less as no weights at all", () => {
    expect(splitProportional(10, [-1, 1])).toEqual([5, 5]);
  });

  it("returns an empty split for no lines", () => {
    expect(splitProportional(100, [])).toEqual([]);
    expect(splitProportional(0, [])).toEqual([]);
  });

  it("gives every line zero when there is nothing to split", () => {
    expect(splitProportional(0, [5, 3, 2])).toEqual([0, 0, 0]);
  });

  it("gives a single line the whole total", () => {
    expect(splitProportional(1234, [7])).toEqual([1234]);
    expect(splitProportional(1234, [0])).toEqual([1234]);
  });

  it("never produces a negative part for a positive total", () => {
    const parts = splitProportional(1000, [1, 2, 3, 4]);
    expect(parts.every((p) => p >= 0)).toBe(true);
  });

  it("does not mutate the caller's weights", () => {
    const weights = [3, 1, 2];
    splitProportional(100, weights);
    expect(weights).toEqual([3, 1, 2]);
  });
});
