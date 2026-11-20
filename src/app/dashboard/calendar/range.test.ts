import { describe, expect, it } from "vitest";
import { calendarGridRange, dayOrder } from "./range";

describe("calendarGridRange", () => {
  it("spans the whole weeks the month grid shows, Sunday to Saturday", () => {
    // November 2026: the 1st is a Sunday, the 30th a Monday.
    expect(calendarGridRange(new Date(2026, 10, 15))).toEqual({ from: "2026-11-01", to: "2026-12-05" });
    // February 2026: the 1st is a Sunday, the 28th a Saturday.
    expect(calendarGridRange(new Date(2026, 1, 1))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("reaches back into the previous year when the month starts mid-week", () => {
    // January 2027: the 1st is a Friday.
    expect(calendarGridRange(new Date(2027, 0, 31))).toEqual({ from: "2026-12-27", to: "2027-02-06" });
  });
});

describe("dayOrder", () => {
  it("puts arrivals before stays and departures", () => {
    const order = ["end", "middle", "start", "single"].sort((a, b) => dayOrder(a as never) - dayOrder(b as never));
    expect(order.slice(0, 2).sort()).toEqual(["single", "start"]);
    expect(order[2]).toBe("middle");
    expect(order[3]).toBe("end");
  });
});
