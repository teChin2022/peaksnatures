import { describe, expect, it } from "vitest";
import {
  buildAvailabilityLookup,
  firstUnavailableNight,
  getFullyBookedForRoom,
  getStayNightKeys,
  makeStayDisabledMatcher,
} from "@/lib/booking-dates";

const d = (day: number) => new Date(2026, 0, day); // January 2026, local
const key = (day: number) => `2026-01-${String(day).padStart(2, "0")}`;

const range = (over: Partial<{ room_id: string | null; check_in: string; check_out: string }> = {}) => ({
  room_id: "room-a",
  check_in: "2026-01-12",
  check_out: "2026-01-14",
  ...over,
});

describe("getStayNightKeys", () => {
  it("covers check-in through the night before check-out", () => {
    expect(getStayNightKeys(d(12), d(14))).toEqual(["2026-01-12", "2026-01-13"]);
  });

  it("returns a single night for a one-night stay", () => {
    expect(getStayNightKeys(d(12), d(13))).toEqual(["2026-01-12"]);
  });

  it("occupies nothing for a half-picked range where from equals to", () => {
    expect(getStayNightKeys(d(12), d(12))).toEqual([]);
  });

  it("occupies nothing when check-out precedes check-in", () => {
    expect(getStayNightKeys(d(14), d(12))).toEqual([]);
  });

  it("spans a month boundary", () => {
    expect(getStayNightKeys(new Date(2026, 0, 30), new Date(2026, 1, 2))).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
    ]);
  });
});

describe("firstUnavailableNight", () => {
  it("returns null when every night of the stay is free", () => {
    expect(firstUnavailableNight(new Set([key(20)]), d(12), d(14))).toBeNull();
  });

  it("names the earliest blocked night, not just any of them", () => {
    expect(firstUnavailableNight(new Set([key(13), key(12)]), d(12), d(15))).toBe("2026-01-12");
  });

  it("ignores a blocked check-out date, which is never slept in", () => {
    expect(firstUnavailableNight(new Set([key(14)]), d(12), d(14))).toBeNull();
  });
});

describe("makeStayDisabledMatcher", () => {
  it("always enables a free night", () => {
    const disabled = makeStayDisabledMatcher(new Set([key(14)]), null);
    expect(disabled(d(13))).toBe(false);
  });

  it("disables an occupied night when no stay is in progress", () => {
    const disabled = makeStayDisabledMatcher(new Set([key(14)]), null);
    expect(disabled(d(14))).toBe(true);
  });

  it("lets a guest check out on an occupied night when the nights between are free", () => {
    const disabled = makeStayDisabledMatcher(new Set([key(14)]), d(12));
    expect(disabled(d(14))).toBe(false);
  });

  it("still disables an occupied night that a stay would have to run across", () => {
    const disabled = makeStayDisabledMatcher(new Set([key(13), key(14)]), d(12));
    expect(disabled(d(14))).toBe(true);
  });

  it("disables an occupied night at or before the pending check-in", () => {
    const disabled = makeStayDisabledMatcher(new Set([key(10), key(12)]), d(12));
    expect(disabled(d(12))).toBe(true);
    expect(disabled(d(10))).toBe(true);
  });

  it("re-disables every occupied night once the range is complete", () => {
    const nights = new Set([key(14)]);
    expect(makeStayDisabledMatcher(nights, d(12))(d(14))).toBe(false);
    expect(makeStayDisabledMatcher(nights, null)(d(14))).toBe(true);
  });
});

describe("getFullyBookedForRoom", () => {
  it("marks the occupied nights of a single-unit room, excluding check-out", () => {
    expect([...getFullyBookedForRoom("room-a", 1, [range()])].sort()).toEqual(["2026-01-12", "2026-01-13"]);
  });

  it("ignores bookings for other rooms", () => {
    expect(getFullyBookedForRoom("room-a", 1, [range({ room_id: "room-b" })]).size).toBe(0);
  });

  it("needs as many overlapping bookings as the room has units", () => {
    const two = [range(), range()];
    expect(getFullyBookedForRoom("room-a", 2, [range()]).size).toBe(0);
    expect([...getFullyBookedForRoom("room-a", 2, two)].sort()).toEqual(["2026-01-12", "2026-01-13"]);
  });

  it("marks only the nights that reach the unit count", () => {
    const ranges = [range(), range({ check_in: "2026-01-13", check_out: "2026-01-15" })];
    expect([...getFullyBookedForRoom("room-a", 2, ranges)]).toEqual(["2026-01-13"]);
  });

  it("skips a zero-night range", () => {
    expect(getFullyBookedForRoom("room-a", 1, [range({ check_out: "2026-01-12" })]).size).toBe(0);
  });

  it("does not throw on malformed dates", () => {
    const ranges = [range({ check_in: "not-a-date", check_out: "also-bad" }), range()];
    expect(() => getFullyBookedForRoom("room-a", 1, ranges)).not.toThrow();
    expect([...getFullyBookedForRoom("room-a", 1, ranges)].sort()).toEqual(["2026-01-12", "2026-01-13"]);
  });

  it("returns an empty set when there are no bookings", () => {
    expect(getFullyBookedForRoom("room-a", 1, []).size).toBe(0);
  });
});

describe("buildAvailabilityLookup", () => {
  const rooms = [
    { id: "room-a", quantity: 2 },
    { id: "room-b", quantity: 1 },
  ];

  it("reports available when nothing is booked or blocked", () => {
    expect(buildAvailabilityLookup(rooms, [], []).getStatus(key(12))).toBe("available");
  });

  it("reports partial when some units are taken and some remain", () => {
    const lookup = buildAvailabilityLookup(rooms, [range()], []);
    expect(lookup.getStatus(key(12))).toBe("partial");
  });

  it("reports full only once every unit is taken", () => {
    const ranges = [range(), range(), range({ room_id: "room-b" })];
    expect(buildAvailabilityLookup(rooms, ranges, []).getStatus(key(12))).toBe("full");
  });

  it("clamps an over-booked room so it cannot swallow another room's units", () => {
    // Four bookings on a 2-unit room must not make the 3-unit homestay look full.
    const ranges = [range(), range(), range(), range()];
    expect(buildAvailabilityLookup(rooms, ranges, []).getStatus(key(12))).toBe("partial");
  });

  it("treats a homestay-wide block as full", () => {
    const lookup = buildAvailabilityLookup(rooms, [], [{ room_id: null, date: key(12) }]);
    expect(lookup.getStatus(key(12))).toBe("full");
    expect(lookup.getStatus(key(13))).toBe("available");
  });

  it("counts a room block as that room's whole quantity", () => {
    const lookup = buildAvailabilityLookup(rooms, [], [{ room_id: "room-a", date: key(12) }]);
    expect(lookup.getStatus(key(12))).toBe("partial");

    const both = buildAvailabilityLookup(rooms, [], [
      { room_id: "room-a", date: key(12) },
      { room_id: "room-b", date: key(12) },
    ]);
    expect(both.getStatus(key(12))).toBe("full");
  });

  it("reports available for a homestay with no rooms", () => {
    expect(buildAvailabilityLookup([], [range()], []).getStatus(key(12))).toBe("available");
  });

  it("treats a null quantity as one unit", () => {
    const lookup = buildAvailabilityLookup([{ id: "room-a", quantity: null }], [range()], []);
    expect(lookup.getStatus(key(12))).toBe("full");
  });

  it("ignores group-level ranges that name no room", () => {
    expect(buildAvailabilityLookup(rooms, [range({ room_id: null })], []).getStatus(key(12))).toBe("available");
  });

  it("does not throw on malformed booking dates", () => {
    expect(() => buildAvailabilityLookup(rooms, [range({ check_in: "nope" })], []).getStatus(key(12))).not.toThrow();
  });

  it("ignores a zero-night range", () => {
    const lookup = buildAvailabilityLookup(rooms, [range({ check_out: "2026-01-12" })], []);
    expect(lookup.getStatus(key(12))).toBe("available");
  });

  it("leaves other rooms alone on a day that blocks only one of them", () => {
    const lookup = buildAvailabilityLookup(rooms, [], [{ room_id: "room-a", date: key(12) }]);
    expect(lookup.getBreakdown(key(12))).toEqual([
      { roomId: "room-a", total: 2, booked: 0, free: 0, blocked: true },
      { roomId: "room-b", total: 1, booked: 0, free: 1, blocked: false },
    ]);
  });

  describe("getBreakdown", () => {
    it("reports each room's units in room order", () => {
      const lookup = buildAvailabilityLookup(rooms, [range()], []);
      expect(lookup.getBreakdown(key(12))).toEqual([
        { roomId: "room-a", total: 2, booked: 1, free: 1, blocked: false },
        { roomId: "room-b", total: 1, booked: 0, free: 1, blocked: false },
      ]);
    });

    it("hides the booking count behind a room block", () => {
      const lookup = buildAvailabilityLookup(rooms, [range()], [{ room_id: "room-a", date: key(12) }]);
      expect(lookup.getBreakdown(key(12))[0]).toEqual({
        roomId: "room-a",
        total: 2,
        booked: 0,
        free: 0,
        blocked: true,
      });
    });

    it("marks every room blocked on a homestay-wide block", () => {
      const lookup = buildAvailabilityLookup(rooms, [], [{ room_id: null, date: key(12) }]);
      expect(lookup.getBreakdown(key(12)).every((r) => r.blocked && r.free === 0)).toBe(true);
    });

    it("treats a null quantity as one unit", () => {
      const lookup = buildAvailabilityLookup([{ id: "room-a", quantity: null }], [], []);
      expect(lookup.getBreakdown(key(12))).toEqual([
        { roomId: "room-a", total: 1, booked: 0, free: 1, blocked: false },
      ]);
    });

    it("clamps booked to the room's own unit count", () => {
      const lookup = buildAvailabilityLookup(rooms, [range(), range(), range()], []);
      expect(lookup.getBreakdown(key(12))[0]).toMatchObject({ total: 2, booked: 2, free: 0 });
    });
  });
});
