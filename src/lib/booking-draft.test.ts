import { describe, expect, it } from "vitest";
import { sanitizePhoneInput } from "@/lib/utils";
import {
  draftExpiresAt,
  isStorableDraftPhone,
  normalizeDraftEmail,
  normalizeDraftPhone,
  reconcileDraftWithCatalog,
  type DraftLine,
  type ReconcileContext,
} from "@/lib/booking-draft";
import type { Room, RoomOption, RoomGuestPricing } from "@/types/database";

function room(over: Partial<Room> & { id: string; name: string }): Room {
  return {
    homestay_id: "h1",
    description: null,
    price_per_night: 1000,
    max_guests: 4,
    quantity: 1,
    images: [],
    is_active: true,
    created_at: "", created_by: "system", updated_at: "", updated_by: "system",
    ...over,
  } as Room;
}

function option(id: string, roomId: string): RoomOption {
  return {
    id, room_id: roomId, name: `opt-${id}`, price: 100, pricing_type: "per_night",
    sort_order: 0, is_active: true,
    created_at: "", created_by: "system", updated_at: "", updated_by: "system",
  } as RoomOption;
}

function tier(id: string, roomId: string): RoomGuestPricing {
  return {
    id, room_id: roomId, adults: 2, children: 0, detail: null, surcharge: 200,
    sort_order: 0, is_active: true,
    created_at: "", created_by: "system", updated_at: "", updated_by: "system",
  } as RoomGuestPricing;
}

function line(over: Partial<DraftLine> & { room_id: string }): DraftLine {
  return { num_guests: 2, tier_ids: [], option_ids: [], ...over };
}

const R1 = room({ id: "r1", name: "Baan Suan" });
const R2 = room({ id: "r2", name: "Baan Rim Nam" });

function ctx(over: Partial<ReconcileContext> = {}): ReconcileContext {
  return {
    rooms: [R1, R2],
    roomOptions: [option("o1", "r1"), option("o2", "r2")],
    guestPricing: [tier("t1", "r1"), tier("t2", "r2")],
    isRoomAvailableForRange: () => true,
    todayStr: "2026-09-01",
    ...over,
  };
}

describe("normalizeDraftPhone", () => {
  it("strips separators down to digits", () => {
    expect(normalizeDraftPhone("081-234-5678")).toBe("0812345678");
    expect(normalizeDraftPhone("(081) 234 5678")).toBe("0812345678");
  });

  it("caps at 10 digits", () => {
    expect(normalizeDraftPhone("08123456789999")).toBe("0812345678");
  });

  // Load-bearing: booking_holds.guest_phone is written through
  // sanitizePhoneInput, and migration 049's same-phone takeover matches it with
  // `=`. If these two rules ever diverge, restore silently stops reclaiming the
  // guest's own hold and they get DATES_HELD against themselves.
  it("agrees byte-for-byte with sanitizePhoneInput", () => {
    for (const input of ["081-234-5678", "  0812345678 ", "+66812345678", "08123456789999", "abc081x234y5678"]) {
      expect(normalizeDraftPhone(input)).toBe(sanitizePhoneInput(input));
    }
  });
});

describe("normalizeDraftEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeDraftEmail("  Guest@Example.COM ")).toBe("guest@example.com");
  });
});

describe("isStorableDraftPhone", () => {
  it("accepts exactly ten digits and nothing else", () => {
    expect(isStorableDraftPhone("0812345678")).toBe(true);
    expect(isStorableDraftPhone("081234567")).toBe(false);
    expect(isStorableDraftPhone("+66812345678")).toBe(false);
  });
});

describe("draftExpiresAt", () => {
  it("stamps the retention window forward from now", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    expect(draftExpiresAt(24, now)).toBe("2026-09-02T00:00:00.000Z");
    expect(draftExpiresAt(6, now)).toBe("2026-09-01T06:00:00.000Z");
  });
});

describe("reconcileDraftWithCatalog", () => {
  it("keeps a clean draft untouched", () => {
    const r = reconcileDraftWithCatalog(
      { check_in: "2026-09-10", lines: [line({ room_id: "r1", option_ids: ["o1"], tier_ids: ["t1"] })] },
      ctx(),
    );
    expect(r.reason).toBeNull();
    expect(r.droppedRoomNames).toEqual([]);
    expect(r.droppedCount).toBe(0);
    expect(r.lines).toEqual([{ room_id: "r1", num_guests: 2, tier_ids: ["t1"], option_ids: ["o1"] }]);
  });

  // The check the hold RPC and create_booking_atomic do NOT do.
  it("refuses a draft whose check-in has already passed", () => {
    const r = reconcileDraftWithCatalog(
      { check_in: "2026-08-31", lines: [line({ room_id: "r1" })] },
      ctx({ todayStr: "2026-09-01" }),
    );
    expect(r.reason).toBe("past_dates");
    expect(r.lines).toEqual([]);
  });

  it("accepts a check-in of today itself", () => {
    const r = reconcileDraftWithCatalog(
      { check_in: "2026-09-01", lines: [line({ room_id: "r1" })] },
      ctx({ todayStr: "2026-09-01" }),
    );
    expect(r.reason).toBeNull();
  });

  it("drops a house that is gone from the catalog, and cannot name it", () => {
    const r = reconcileDraftWithCatalog(
      { check_in: "2026-09-10", lines: [line({ room_id: "deleted" }), line({ room_id: "r1" })] },
      ctx(),
    );
    expect(r.lines.map((l) => l.room_id)).toEqual(["r1"]);
    expect(r.droppedCount).toBe(1);
    expect(r.droppedRoomNames).toEqual([]);
  });

  it("drops a house that is no longer available for the range, and names it", () => {
    const r = reconcileDraftWithCatalog(
      { check_in: "2026-09-10", lines: [line({ room_id: "r1" }), line({ room_id: "r2" })] },
      ctx({ isRoomAvailableForRange: (rm) => rm.id !== "r1" }),
    );
    expect(r.lines.map((l) => l.room_id)).toEqual(["r2"]);
    expect(r.droppedRoomNames).toEqual(["Baan Suan"]);
  });

  it("drops lines beyond the house's remaining quantity", () => {
    const twoUnits = room({ id: "r1", name: "Baan Suan", quantity: 2 });
    const r = reconcileDraftWithCatalog(
      { check_in: "2026-09-10", lines: [line({ room_id: "r1" }), line({ room_id: "r1" }), line({ room_id: "r1" })] },
      ctx({ rooms: [twoUnits] }),
    );
    expect(r.lines).toHaveLength(2);
    expect(r.droppedCount).toBe(1);
    expect(r.droppedRoomNames).toEqual(["Baan Suan"]);
  });

  it("strips a stale add-on but keeps the line", () => {
    const r = reconcileDraftWithCatalog(
      { check_in: "2026-09-10", lines: [line({ room_id: "r1", option_ids: ["o1", "gone"] })] },
      ctx(),
    );
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].option_ids).toEqual(["o1"]);
    expect(r.droppedCount).toBe(0);
  });

  it("strips an add-on that now belongs to a different house", () => {
    const r = reconcileDraftWithCatalog(
      { check_in: "2026-09-10", lines: [line({ room_id: "r1", option_ids: ["o2"] })] },
      ctx(),
    );
    expect(r.lines[0].option_ids).toEqual([]);
  });

  it("strips a stale tier but keeps the line", () => {
    const r = reconcileDraftWithCatalog(
      { check_in: "2026-09-10", lines: [line({ room_id: "r1", tier_ids: ["t1", "gone"] })] },
      ctx(),
    );
    expect(r.lines[0].tier_ids).toEqual(["t1"]);
  });

  // /api/bookings validates num_guests as z.number().int().min(1) with no upper
  // bound, so this clamp is the only thing standing between a stale draft and
  // an over-occupied house.
  it("clamps num_guests to the house's current max", () => {
    const r = reconcileDraftWithCatalog(
      { check_in: "2026-09-10", lines: [line({ room_id: "r1", num_guests: 9 })] },
      ctx({ rooms: [room({ id: "r1", name: "Baan Suan", max_guests: 4 })] }),
    );
    expect(r.lines[0].num_guests).toBe(4);
  });

  it("floors num_guests at 1", () => {
    const r = reconcileDraftWithCatalog(
      { check_in: "2026-09-10", lines: [line({ room_id: "r1", num_guests: 0 })] },
      ctx(),
    );
    expect(r.lines[0].num_guests).toBe(1);
  });

  it("reports no_rooms when every line is dropped", () => {
    const r = reconcileDraftWithCatalog(
      { check_in: "2026-09-10", lines: [line({ room_id: "r1" }), line({ room_id: "r2" })] },
      ctx({ isRoomAvailableForRange: () => false }),
    );
    expect(r.reason).toBe("no_rooms");
    expect(r.lines).toEqual([]);
    expect(r.droppedRoomNames).toEqual(["Baan Suan", "Baan Rim Nam"]);
  });
});
