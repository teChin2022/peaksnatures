import { describe, expect, it } from "vitest";
import { parseSavedStay, serializeStay, type SavedLine } from "@/lib/booking-session-store";

const catalog = {
  rooms: [{ id: "a", is_active: true }, { id: "b", is_active: true }, { id: "closed", is_active: false }],
  guestPricing: [{ id: "t-a", room_id: "a" }],
  roomOptions: [{ id: "o-a", room_id: "a" }],
};
const line = (over: Partial<SavedLine> = {}): SavedLine => ({ lineId: "l1", roomId: "a", numGuests: 2, tierIds: ["t-a"], optionIds: ["o-a"], ...over });
const stay = { from: new Date(2026, 11, 20), to: new Date(2026, 11, 22) };
const today = "2026-11-17";

describe("serializeStay / parseSavedStay", () => {
  it("round-trips a stay and its houses, back to local-midnight dates", () => {
    const raw = serializeStay(stay, [line()]);
    expect(raw).toBe('{"from":"2026-12-20","to":"2026-12-22","lines":[{"lineId":"l1","roomId":"a","numGuests":2,"tierIds":["t-a"],"optionIds":["o-a"]}]}');
    const saved = parseSavedStay(raw, catalog, today)!;
    expect(saved.dateRange).toEqual(stay);
    expect(saved.lines).toEqual([line()]);
  });

  it("keeps nothing without a full stay", () => {
    expect(serializeStay(undefined, [])).toBeNull();
    expect(serializeStay({ from: stay.from, to: undefined }, [line()])).toBeNull();
  });

  it("stores no personal details, only dates and house choices", () => {
    expect(Object.keys(JSON.parse(serializeStay(stay, [line()])!))).toEqual(["from", "to", "lines"]);
  });

  it("forgets a stay whose check-in has passed, and keeps one starting today", () => {
    const raw = serializeStay(stay, [line()]);
    expect(parseSavedStay(raw, catalog, "2026-12-21")).toBeNull();
    expect(parseSavedStay(raw, catalog, "2026-12-20")).not.toBeNull();
  });

  it("drops a line whose house is gone or closed, or whose group or add-on was removed", () => {
    const raw = serializeStay(stay, [
      line({ lineId: "gone", roomId: "zz" }),
      line({ lineId: "closed", roomId: "closed", tierIds: [], optionIds: [] }),
      line({ lineId: "old-tier", tierIds: ["t-old"] }),
      line({ lineId: "old-option", optionIds: ["o-old"] }),
      line({ lineId: "ok-b", roomId: "b", tierIds: [], optionIds: [] }),
    ]);
    expect(parseSavedStay(raw, catalog, today)!.lines.map((l) => l.lineId)).toEqual(["ok-b"]);
  });

  it("ignores anything malformed instead of throwing", () => {
    for (const raw of [null, "", "not json", "null", "[]", '{"from":"x","to":"y"}', '{"from":"2026-12-22","to":"2026-12-20","lines":[]}']) {
      expect(parseSavedStay(raw, catalog, today)).toBeNull();
    }
    const raw = JSON.stringify({ from: "2026-12-20", to: "2026-12-22", lines: [null, 5, { lineId: "x", roomId: "a", numGuests: 0, tierIds: [], optionIds: [] }, { lineId: "y", roomId: "a", numGuests: 2, tierIds: "t-a", optionIds: [] }] });
    expect(parseSavedStay(raw, catalog, today)!.lines).toEqual([]);
  });
});
