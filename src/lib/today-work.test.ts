import { describe, expect, it } from "vitest";
import { todayWorkCounts } from "./today-work";

const b = (status: string, check_in: string, check_out: string) => ({ status, check_in, check_out });

describe("todayWorkCounts", () => {
  it("counts what needs the host today", () => {
    const counts = todayWorkCounts(
      [
        b("pending", "2026-12-01", "2026-12-02"),
        b("verified", "2026-12-05", "2026-12-06"),
        b("confirmed", "2026-11-17", "2026-11-18"), // arrives today
        b("completed", "2026-11-17", "2026-11-18"), // arrived today, already checked out early
        b("confirmed", "2026-11-15", "2026-11-17"), // leaves today
        b("completed", "2026-11-15", "2026-11-17"), // already checked out: nothing to do
        b("cancelled", "2026-11-17", "2026-11-18"),
        b("rejected", "2026-11-17", "2026-11-17"),
      ],
      "2026-11-17",
    );
    expect(counts).toEqual({ needsAction: 2, checkins: 2, checkouts: 1 });
  });

  it("is all zeros with no bookings", () => {
    expect(todayWorkCounts([], "2026-11-17")).toEqual({ needsAction: 0, checkins: 0, checkouts: 0 });
  });
});
