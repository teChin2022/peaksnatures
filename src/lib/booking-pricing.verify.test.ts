import { describe, expect, it } from "vitest";
import { computeRoomRateTotal, verifyRoomLineItem, type LineItemInput } from "@/lib/booking-pricing";
import { createSupabaseMock, type SupabaseMockOptions } from "../../test/helpers/supabase";

type ServiceClient = Parameters<typeof verifyRoomLineItem>[0];

/** Room priced at 1000/night, belonging to homestay-1, with no extras configured. */
const roomTables = (over: SupabaseMockOptions["tables"] = {}) => ({
  rooms: { data: { price_per_night: 1000, homestay_id: "homestay-1" } },
  room_seasonal_prices: { data: [] },
  room_special_prices: { data: [] },
  room_options: { data: [] },
  room_guest_pricing: { data: [] },
  ...over,
});

const client = (tables: SupabaseMockOptions["tables"]) =>
  createSupabaseMock({ tables }) as unknown as ServiceClient;

const line = (over: Partial<LineItemInput> = {}): LineItemInput => ({
  room_id: "room-1",
  check_in: "2026-01-12",
  check_out: "2026-01-14", // two nights
  num_guests: 2,
  ...over,
});

const verify = (tables: SupabaseMockOptions["tables"], item = line(), locale?: string) =>
  verifyRoomLineItem(client(tables), "homestay-1", item, locale);

describe("verifyRoomLineItem", () => {
  it("prices a plain two-night stay from the room's own rate", async () => {
    const result = await verify(roomTables());

    expect(result).toEqual({
      ok: true,
      data: {
        room_id: "room-1",
        check_in: "2026-01-12",
        check_out: "2026-01-14",
        nights: 2,
        num_guests: 2,
        base_price: 2000,
        options_total: 0,
        composition_surcharge: 0,
        gross: 2000,
        selected_options: [],
        guest_pricing_label: null,
        guest_pricing_surcharge: 0,
      },
    });
  });

  it("applies seasonal and special pricing from the database", async () => {
    const result = await verify(
      roomTables({
        room_seasonal_prices: {
          data: [{ start_date: "2026-01-01", end_date: "2026-01-31", price_per_night: 1500, name: "High" }],
        },
        room_special_prices: {
          data: [{ rule_type: "weekday", weekdays: [1], dates: [], start_date: null, end_date: null, surcharge: 400 }],
        },
      }),
    );

    // 2026-01-12 is a Monday: 1500 + 400. 2026-01-13 is a Tuesday: 1500.
    expect(result).toMatchObject({ ok: true, data: { base_price: 3400 } });
  });

  describe("rejections", () => {
    it("404s when the room does not exist", async () => {
      const result = await verify(roomTables({ rooms: { data: null } }));
      expect(result).toEqual({ ok: false, error: "Room not found", status: 404 });
    });

    it("404s when the room lookup errors", async () => {
      const result = await verify(roomTables({ rooms: { data: null, error: { message: "boom" } } }));
      expect(result).toEqual({ ok: false, error: "Room not found", status: 404 });
    });

    it("400s when the room belongs to a different homestay", async () => {
      const result = await verify(
        roomTables({ rooms: { data: { price_per_night: 1000, homestay_id: "someone-else" } } }),
      );
      expect(result).toEqual({
        ok: false,
        error: "Room does not belong to this homestay",
        status: 400,
      });
    });

    it("400s on a zero-night or reversed date range", async () => {
      for (const item of [
        line({ check_out: "2026-01-12" }),
        line({ check_in: "2026-01-14", check_out: "2026-01-12" }),
      ]) {
        expect(await verify(roomTables(), item)).toEqual({
          ok: false,
          error: "Invalid date range",
          status: 400,
        });
      }
    });

    it("400s when a chosen guest tier does not belong to the room", async () => {
      const result = await verify(
        roomTables({
          room_guest_pricing: { data: [{ id: "tier-1", adults: 2, children: 0, detail: null, surcharge: 0, sort_order: 0 }] },
        }),
        line({ guest_pricing_ids: ["tier-from-another-room"] }),
      );
      expect(result).toEqual({ ok: false, error: "Invalid guest pricing selection", status: 400 });
    });

    it("400s when two base-tier alternatives are stacked", async () => {
      const result = await verify(
        roomTables({
          room_guest_pricing: {
            data: [
              { id: "base", adults: 2, children: 0, detail: null, surcharge: 0, sort_order: 0 },
              { id: "big", adults: 4, children: 0, detail: null, surcharge: 800, sort_order: 1 },
            ],
          },
        }),
        line({ guest_pricing_ids: ["base", "big"] }),
      );
      expect(result).toEqual({ ok: false, error: "Invalid guest pricing selection", status: 400 });
    });

    it("allows stacking several tiers when none of them is a base tier", async () => {
      const result = await verify(
        roomTables({
          room_guest_pricing: {
            data: [
              { id: "adult", adults: 1, children: 0, detail: null, surcharge: 300, sort_order: 0 },
              { id: "child", adults: 0, children: 1, detail: null, surcharge: 150, sort_order: 1 },
            ],
          },
        }),
        line({ guest_pricing_ids: ["adult", "child"] }),
      );
      expect(result).toMatchObject({
        ok: true,
        data: { num_guests: 4, guest_pricing_surcharge: 450, composition_surcharge: 900 },
      });
    });
  });

  describe("options are priced from the database, never from the client", () => {
    it("charges a per-night option once per night", async () => {
      const result = await verify(
        roomTables({ room_options: { data: [{ id: "opt-1", price: 250, pricing_type: "per_night" }] } }),
        line({ selected_options: [{ id: "opt-1", name: "Breakfast", price: 999999 }] }),
      );

      expect(result).toMatchObject({
        ok: true,
        data: {
          options_total: 500,
          gross: 2500,
          selected_options: [
            { id: "opt-1", name: "Breakfast", price: 500, unit_price: 250, pricing_type: "per_night" },
          ],
        },
      });
    });

    it("charges a per-time option as a flat fee", async () => {
      const result = await verify(
        roomTables({ room_options: { data: [{ id: "opt-1", price: 250, pricing_type: "per_time" }] } }),
        line({ selected_options: [{ id: "opt-1", name: "BBQ set", price: 1 }] }),
      );

      expect(result).toMatchObject({
        ok: true,
        data: { options_total: 250, selected_options: [{ price: 250, unit_price: 250, pricing_type: "per_time" }] },
      });
    });

    it("sums several options", async () => {
      const result = await verify(
        roomTables({
          room_options: {
            data: [
              { id: "a", price: 100, pricing_type: "per_night" },
              { id: "b", price: 300, pricing_type: "per_time" },
            ],
          },
        }),
        line({
          selected_options: [
            { id: "a", name: "A", price: 0 },
            { id: "b", name: "B", price: 0 },
          ],
        }),
      );
      expect(result).toMatchObject({ ok: true, data: { options_total: 500 } });
    });

    it("silently drops an option the room no longer offers", async () => {
      const result = await verify(
        roomTables({ room_options: { data: [] } }),
        line({ selected_options: [{ id: "ghost", name: "Ghost", price: 5000 }] }),
      );
      expect(result).toMatchObject({ ok: true, data: { options_total: 0, selected_options: [] } });
    });

    it("copes with the options query returning nothing at all", async () => {
      const result = await verify(
        roomTables({ room_options: { data: null } }),
        line({ selected_options: [{ id: "opt-1", name: "Breakfast", price: 500 }] }),
      );
      expect(result).toMatchObject({ ok: true, data: { options_total: 0, selected_options: [] } });
    });

    it("does not query room_options when none were chosen", async () => {
      const supabase = createSupabaseMock({ tables: roomTables() });
      await verifyRoomLineItem(supabase as unknown as ServiceClient, "homestay-1", line());
      expect(supabase.calls.map((c) => c.table)).not.toContain("room_options");
    });
  });

  describe("guest composition", () => {
    it("takes the headcount from the chosen tier in base-tier mode", async () => {
      const result = await verify(
        roomTables({
          room_guest_pricing: {
            data: [
              { id: "base", adults: 2, children: 0, detail: null, surcharge: 0, sort_order: 0 },
              { id: "big", adults: 4, children: 2, detail: null, surcharge: 800, sort_order: 1 },
            ],
          },
        }),
        line({ num_guests: 99, guest_pricing_ids: ["big"] }),
      );

      expect(result).toMatchObject({
        ok: true,
        data: {
          num_guests: 6,
          guest_pricing_surcharge: 800,
          composition_surcharge: 1600, // charged per night
          guest_pricing_label: "ผู้ใหญ่ 4 เด็ก 2",
          gross: 3600,
        },
      });
    });

    it("labels the tier in the requested locale", async () => {
      const result = await verify(
        roomTables({
          room_guest_pricing: {
            data: [{ id: "t", adults: 2, children: 1, detail: null, surcharge: 300, sort_order: 0 }],
          },
        }),
        line({ guest_pricing_ids: ["t"] }),
        "en",
      );
      expect(result).toMatchObject({ ok: true, data: { guest_pricing_label: "2 Adults, 1 Children" } });
    });
  });

  it("copes with every related query returning nothing at all", async () => {
    const result = await verify(
      roomTables({
        room_seasonal_prices: { data: null },
        room_special_prices: { data: null },
        room_guest_pricing: { data: null },
      }),
    );
    expect(result).toMatchObject({ ok: true, data: { base_price: 2000, guest_pricing_surcharge: 0 } });
  });

  it("reads only active special prices and active guest tiers", async () => {
    const supabase = createSupabaseMock({ tables: roomTables() });
    await verifyRoomLineItem(supabase as unknown as ServiceClient, "homestay-1", line());

    expect(supabase.builderFor("room_special_prices").eq).toHaveBeenCalledWith("is_active", true);
    expect(supabase.builderFor("room_guest_pricing").eq).toHaveBeenCalledWith("is_active", true);
  });
});

describe("computeRoomRateTotal", () => {
  const rateTables = (over: SupabaseMockOptions["tables"] = {}) => ({
    rooms: { data: { price_per_night: 1000 } },
    room_seasonal_prices: { data: [] },
    room_special_prices: { data: [] },
    ...over,
  });

  it("returns the room's own rate for the stay, ignoring options and guests", async () => {
    const total = await computeRoomRateTotal(client(rateTables()), "room-1", "2026-01-12", "2026-01-14");
    expect(total).toBe(2000);
  });

  it("includes seasonal prices and special surcharges", async () => {
    const total = await computeRoomRateTotal(
      client(
        rateTables({
          room_seasonal_prices: {
            data: [{ start_date: "2026-01-01", end_date: "2026-01-31", price_per_night: 1500 }],
          },
          room_special_prices: {
            data: [{ rule_type: "date", weekdays: [], dates: ["2026-01-12"], start_date: null, end_date: null, surcharge: 500 }],
          },
        }),
      ),
      "room-1",
      "2026-01-12",
      "2026-01-14",
    );
    expect(total).toBe(3500); // (1500 + 500) + 1500
  });

  it("copes with the price queries returning nothing at all", async () => {
    const total = await computeRoomRateTotal(
      client(rateTables({ room_seasonal_prices: { data: null }, room_special_prices: { data: null } })),
      "room-1", "2026-01-12", "2026-01-14",
    );
    expect(total).toBe(2000);
  });

  it("returns null when the room is gone", async () => {
    const total = await computeRoomRateTotal(client(rateTables({ rooms: { data: null } })), "room-1", "2026-01-12", "2026-01-14");
    expect(total).toBeNull();
  });

  it("returns null for a zero-night or reversed range", async () => {
    const c = () => client(rateTables());
    await expect(computeRoomRateTotal(c(), "room-1", "2026-01-12", "2026-01-12")).resolves.toBeNull();
    await expect(computeRoomRateTotal(c(), "room-1", "2026-01-14", "2026-01-12")).resolves.toBeNull();
  });
});
