import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock, type QueryResponse, type SupabaseMockOptions } from "../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../test/helpers/request";
import { makePromoCode } from "../../../../test/fixtures/db";

const h = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  revalidateTag: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
  deductCommission: vi.fn(),
  getHostBlockState: vi.fn(),
  isHostBlocked: vi.fn(),
  sendBookingConfirmationEmail: vi.fn(),
  dispatchHostNotification: vi.fn(),
  sendRecommenderPromoUsedNotification: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: h.createServiceRoleClient }));
vi.mock("next/cache", () => ({ revalidateTag: h.revalidateTag }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    h.afterCallbacks.push(cb);
  },
}));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: h.logEvent,
}));
vi.mock("@/lib/billing", () => ({
  deductCommission: h.deductCommission,
  getHostBlockState: h.getHostBlockState,
}));
vi.mock("@/lib/plan-expiry", () => ({ isHostBlocked: h.isHostBlocked }));
vi.mock("@/lib/notifications", () => ({
  sendBookingConfirmationEmail: h.sendBookingConfirmationEmail,
  sendHostLineNotification: vi.fn(),
  sendHostSmsNotification: vi.fn(),
  dispatchHostNotification: h.dispatchHostNotification,
  buildNewBookingMessage: vi.fn(() => "message"),
  sendRecommenderPromoUsedNotification: h.sendRecommenderPromoUsedNotification,
}));

const uuid = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
const HOMESTAY_ID = uuid(1);
const ROOM_ID = uuid(2);
const PROMO_ID = uuid(3);
const TIER_ID = uuid(4);
const OPTION_ID = uuid(5);
const BOOKING_ID = "booking-created";

const body = (over: Record<string, unknown> = {}) => ({
  homestay_id: HOMESTAY_ID,
  room_id: ROOM_ID,
  guest_name: "Nok Suwan",
  guest_email: "guest@example.com",
  guest_phone: "0898765432",
  check_in: "2026-01-12",
  check_out: "2026-01-14",
  num_guests: 2,
  total_price: 2000,
  slip_hash: "a".repeat(64),
  ...over,
});

/** The table script for a plain two-night booking at 1000/night. */
function tables(over: Record<string, QueryResponse | QueryResponse[]> = {}) {
  return {
    homestays: [{ data: { host_id: "host-1" } }],
    rooms: { data: { price_per_night: 1000 } },
    room_seasonal_prices: { data: [] },
    room_special_prices: { data: [] },
    room_options: { data: [] },
    room_guest_pricing: { data: [] },
    bookings: {
      data: {
        id: BOOKING_ID,
        total_price: 2000,
        homestay: { id: HOMESTAY_ID, name: "Retreat", host: { id: "host-1", name: "Somchai" } },
        room: { id: ROOM_ID, name: "Pine House" },
      },
    },
    promo_codes: { data: null },
    promo_redemptions: { data: [] },
    ...over,
  };
}

function mockClient(options: Partial<SupabaseMockOptions> = {}) {
  const supabase = createSupabaseMock({
    tables: tables(),
    rpc: { create_booking_atomic: { data: BOOKING_ID } },
    ...options,
  });
  h.createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const post = (payload: unknown) => POST(makeRequest("/api/bookings", { body: payload }));

const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.sendBookingConfirmationEmail.mockResolvedValue(undefined);
  // Invoke the channel callbacks the route hands over, so the closures that
  // build the SMS, LINE and email bodies actually run.
  h.dispatchHostNotification.mockImplementation(
    async (
      _details: unknown,
      sendSmsFn: () => unknown,
      sendLineFn: () => unknown,
      _subject: string,
      buildEmailBody: () => string,
    ) => {
      await sendSmsFn();
      await sendLineFn();
      buildEmailBody();
    },
  );
  h.sendRecommenderPromoUsedNotification.mockResolvedValue({ success: true });
  h.deductCommission.mockResolvedValue(undefined);
  h.logEvent.mockResolvedValue(undefined);
  h.getHostBlockState.mockResolvedValue(null);
  h.isHostBlocked.mockReturnValue(false);
  mockClient();
});

describe("POST /api/bookings", () => {
  it("creates the booking atomically and returns it", async () => {
    const supabase = mockClient();

    const { status, body: result } = await readJson(await post(body()));

    expect(status).toBe(201);
    expect(result).toMatchObject({ booking: { id: BOOKING_ID, total_price: 2000 } });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_booking_atomic",
      expect.objectContaining({
        p_homestay_id: HOMESTAY_ID,
        p_room_id: ROOM_ID,
        p_total_price: 2000,
        p_status: "confirmed",
        p_amount_paid: 2000,
      }),
    );
  });

  it("marks an unverified slip as pending rather than confirmed", async () => {
    const supabase = mockClient();
    await post(body({ easyslip_verified: false }));

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_booking_atomic",
      expect.objectContaining({ p_status: "pending", p_easyslip_verified: false }),
    );
    expect(h.deductCommission).not.toHaveBeenCalled();
  });

  it("charges commission only once the slip is verified", async () => {
    await post(body());
    expect(h.deductCommission).toHaveBeenCalledWith(BOOKING_ID);
  });

  it("busts the availability and stats caches", async () => {
    await post(body());
    expect(h.revalidateTag).toHaveBeenCalledWith(`booking-availability:${HOMESTAY_ID}`, "max");
    expect(h.revalidateTag).toHaveBeenCalledWith("admin-stats", "max");
  });

  it("leaves the stats cache alone for an unverified booking", async () => {
    await post(body({ easyslip_verified: false }));
    expect(h.revalidateTag).not.toHaveBeenCalledWith("admin-stats", "max");
  });

  describe("validation", () => {
    it.each([
      ["a missing homestay", { homestay_id: undefined }],
      ["a non-uuid homestay", { homestay_id: "nope" }],
      ["a missing name", { guest_name: "" }],
      ["an invalid email", { guest_email: "not-an-email" }],
      ["a missing phone", { guest_phone: "" }],
      ["a malformed check-in", { check_in: "12/01/2026" }],
      ["zero guests", { num_guests: 0 }],
      ["a negative price", { total_price: -1 }],
      ["a missing slip hash", { slip_hash: "" }],
      ["an unknown payment type", { payment_type: "invoice" }],
    ])("refuses %s", async (_label, over) => {
      const { status, body: result } = await readJson(await post(body(over)));
      expect(status).toBe(400);
      expect(result).toMatchObject({ error: "Invalid booking data" });
    });

    it("refuses a body that is not JSON", async () => {
      const req = makeRequest("/api/bookings", { body: "not json" });
      expect((await POST(req)).status).toBe(500);
    });

    it("refuses a zero-night or reversed stay", async () => {
      for (const over of [{ check_out: "2026-01-12" }, { check_in: "2026-01-14", check_out: "2026-01-12" }]) {
        const { status, body: result } = await readJson(await post(body(over)));
        expect(status).toBe(400);
        expect(result).toEqual({ error: "Invalid date range" });
      }
    });

    it("reports 404 when the room does not exist", async () => {
      mockClient({ tables: tables({ rooms: { data: null } }) });
      await expect(readJson(await post(body()))).resolves.toEqual({
        status: 404,
        body: { error: "Room not found" },
      });
    });
  });

  describe("blocked hosts", () => {
    it("refuses a booking for a host who is soft-blocked", async () => {
      h.getHostBlockState.mockResolvedValue({ plan_type: "free", plan_free_expires_at: "2020-01-01" });
      h.isHostBlocked.mockReturnValue(true);

      await expect(readJson(await post(body()))).resolves.toEqual({
        status: 403,
        body: { error: "This homestay is temporarily unavailable for new bookings" },
      });
    });

    it("proceeds when the host is in good standing", async () => {
      h.getHostBlockState.mockResolvedValue({ plan_type: "commission", plan_free_expires_at: null });
      h.isHostBlocked.mockReturnValue(false);
      expect((await post(body())).status).toBe(201);
    });

    it("proceeds when the homestay has no host row to check", async () => {
      mockClient({ tables: tables({ homestays: [{ data: null }] }) });
      expect((await post(body())).status).toBe(201);
      expect(h.getHostBlockState).not.toHaveBeenCalled();
    });
  });

  describe("server-side price verification", () => {
    it("overrides a client price that does not match the room's rate", async () => {
      const supabase = mockClient();
      await post(body({ total_price: 1 }));

      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_atomic",
        expect.objectContaining({ p_total_price: 2000 }),
      );
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Price mismatch"));
    });

    it("prices seasonal and special nights from the database", async () => {
      const supabase = mockClient({
        tables: tables({
          room_seasonal_prices: { data: [{ start_date: "2026-01-01", end_date: "2026-01-31", price_per_night: 1500 }] },
          room_special_prices: {
            data: [{ rule_type: "weekday", weekdays: [1], dates: [], start_date: null, end_date: null, surcharge: 400 }],
          },
        }),
      });

      await post(body({ total_price: 0 }));
      // Monday 12th: 1500 + 400. Tuesday 13th: 1500.
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_atomic",
        expect.objectContaining({ p_total_price: 3400 }),
      );
    });

    it("re-prices options from the database, ignoring what the client sent", async () => {
      const supabase = mockClient({
        tables: tables({ room_options: { data: [{ id: OPTION_ID, price: 250, pricing_type: "per_night" }] } }),
      });

      await post(body({
        total_price: 0,
        selected_options: [{ id: OPTION_ID, name: "Breakfast", price: 999999 }],
      }));

      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_atomic",
        expect.objectContaining({
          p_total_price: 2500, // 2000 + 250 x 2 nights
          p_selected_options: [
            { id: OPTION_ID, name: "Breakfast", price: 500, unit_price: 250, pricing_type: "per_night" },
          ],
        }),
      );
    });

    it("charges a per-time option as a flat fee", async () => {
      const supabase = mockClient({
        tables: tables({ room_options: { data: [{ id: OPTION_ID, price: 250, pricing_type: "per_time" }] } }),
      });

      await post(body({ total_price: 0, selected_options: [{ id: OPTION_ID, name: "BBQ", price: 0 }] }));
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_atomic",
        expect.objectContaining({ p_total_price: 2250 }),
      );
    });

    it("drops an option the room no longer offers", async () => {
      const supabase = mockClient({ tables: tables({ room_options: { data: [] } }) });
      await post(body({ total_price: 0, selected_options: [{ id: OPTION_ID, name: "Ghost", price: 5000 }] }));
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_atomic",
        expect.objectContaining({ p_total_price: 2000 }),
      );
    });

    it("charges the guest-composition surcharge per night and snapshots the label", async () => {
      const supabase = mockClient({
        tables: tables({
          room_guest_pricing: {
            data: [
              { id: uuid(7), adults: 2, children: 0, detail: null, surcharge: 0, sort_order: 0 },
              { id: TIER_ID, adults: 4, children: 2, detail: null, surcharge: 800, sort_order: 1 },
            ],
          },
        }),
      });

      await post(body({ total_price: 0, guest_pricing_ids: [TIER_ID] }));

      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_atomic",
        expect.objectContaining({ p_total_price: 3600, p_num_guests: 6 }),
      );
      expect(supabase.builderFor("bookings", 0).update).toHaveBeenCalledWith({
        guest_pricing_label: "ผู้ใหญ่ 4 เด็ก 2",
        guest_pricing_surcharge: 800,
      });
    });

    it("refuses a tier that belongs to another room", async () => {
      mockClient({ tables: tables({ room_guest_pricing: { data: [] } }) });
      await expect(readJson(await post(body({ guest_pricing_ids: [TIER_ID] })))).resolves.toEqual({
        status: 400,
        body: { error: "Invalid guest pricing selection" },
      });
    });

    it("refuses two stacked base-tier alternatives", async () => {
      const other = uuid(6);
      mockClient({
        tables: tables({
          room_guest_pricing: {
            data: [
              { id: TIER_ID, adults: 2, children: 0, detail: null, surcharge: 0, sort_order: 0 },
              { id: other, adults: 4, children: 0, detail: null, surcharge: 800, sort_order: 1 },
            ],
          },
        }),
      });

      const { status } = await readJson(await post(body({ guest_pricing_ids: [TIER_ID, other] })));
      expect(status).toBe(400);
    });

    it("logs the snapshot failure without failing the booking", async () => {
      const supabase = mockClient({
        tables: tables({
          room_guest_pricing: {
            data: [{ id: TIER_ID, adults: 2, children: 0, detail: null, surcharge: 300, sort_order: 0 }],
          },
          bookings: [
            { error: { message: "column missing" } },
            { data: { id: BOOKING_ID } },
            { data: { id: BOOKING_ID, homestay: { id: HOMESTAY_ID, host: { id: "host-1" } } } },
          ],
        }),
      });

      expect((await post(body({ total_price: 0, guest_pricing_ids: [TIER_ID] }))).status).toBe(201);
      expect(supabase.builderFor("bookings", 0).update).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith("[GuestPricing] Failed to persist snapshot:", expect.anything());
    });
  });

  describe("promo codes", () => {
    const promoTables = (over: Record<string, QueryResponse | QueryResponse[]> = {}) =>
      tables({
        homestays: [{ data: { host_id: "host-1" } }, { data: { promo_codes_enabled: true } }],
        promo_codes: { data: makePromoCode({ id: PROMO_ID, discount_value: 10 }) },
        promo_redemptions: { data: [] },
        ...over,
      });

    it("discounts the stay and records the redemption", async () => {
      const supabase = mockClient({ tables: promoTables() });

      const { status } = await readJson(await post(body({ total_price: 0, promo_code_id: PROMO_ID })));

      expect(status).toBe(201);
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_atomic",
        expect.objectContaining({ p_total_price: 1800, p_discount_amount: 200 }),
      );
      expect(supabase.builderFor("promo_redemptions").insert).toHaveBeenCalledWith(
        expect.objectContaining({
          promo_code_id: PROMO_ID,
          booking_id: BOOKING_ID,
          discount_amount: 200,
          payout_status: "pending",
          guest_email: "guest@example.com",
        }),
      );
    });

    it("ticks the usage counter once the redemption is recorded", async () => {
      const supabase = mockClient({
        tables: promoTables({ promo_codes: { data: makePromoCode({ id: PROMO_ID, times_used: 4 }) } }),
      });

      await post(body({ total_price: 0, promo_code_id: PROMO_ID }));
      expect(supabase.builderFor("promo_codes", 1).update).toHaveBeenCalledWith({ times_used: 5 });
    });

    it("does not tick the counter when the redemption could not be written", async () => {
      const supabase = mockClient({
        tables: promoTables({ promo_redemptions: [{ error: { message: "constraint" } }] }),
      });

      await post(body({ total_price: 0, promo_code_id: PROMO_ID }));
      expect(supabase.calls.filter((c) => c.table === "promo_codes")).toHaveLength(1);
    });

    it("records an attribution-only code that discounts nothing", async () => {
      const supabase = mockClient({
        tables: promoTables({
          promo_codes: { data: makePromoCode({ id: PROMO_ID, discount_value: 0, recommender_name: "Ann" }) },
        }),
      });

      await post(body({ total_price: 0, promo_code_id: PROMO_ID }));
      expect(supabase.builderFor("promo_redemptions").insert).toHaveBeenCalledWith(
        expect.objectContaining({ discount_amount: 0 }),
      );
    });

    it("refuses a code when the homestay has promo codes switched off", async () => {
      mockClient({
        tables: promoTables({
          homestays: [{ data: { host_id: "host-1" } }, { data: { promo_codes_enabled: false } }],
        }),
      });

      await expect(readJson(await post(body({ promo_code_id: PROMO_ID })))).resolves.toEqual({
        status: 400,
        body: { error: "Promo codes are not enabled for this homestay" },
      });
    });

    it("refuses a code that belongs to another homestay", async () => {
      mockClient({ tables: promoTables({ promo_codes: { data: null } }) });
      await expect(readJson(await post(body({ promo_code_id: PROMO_ID })))).resolves.toEqual({
        status: 400,
        body: { error: "Invalid promo code" },
      });
    });

    it("passes the rejection reason through", async () => {
      mockClient({
        tables: promoTables({ promo_codes: { data: makePromoCode({ id: PROMO_ID, is_active: false }) } }),
      });

      await expect(readJson(await post(body({ promo_code_id: PROMO_ID })))).resolves.toEqual({
        status: 400,
        body: { error: "Promo code rejected (INACTIVE)" },
      });
    });

    it("refuses a single-use code the guest already redeemed", async () => {
      mockClient({
        tables: promoTables({
          promo_codes: { data: makePromoCode({ id: PROMO_ID, one_use_per_guest: true }) },
          promo_redemptions: { data: [{ id: "redemption-1" }] },
        }),
      });

      await expect(readJson(await post(body({ promo_code_id: PROMO_ID })))).resolves.toEqual({
        status: 400,
        body: { error: "Promo code already used by this guest" },
      });
    });

    it("allows a single-use code for a guest who has not used it", async () => {
      mockClient({
        tables: promoTables({
          promo_codes: { data: makePromoCode({ id: PROMO_ID, one_use_per_guest: true }) },
          promo_redemptions: [{ data: [] }, { data: [] }],
        }),
      });
      expect((await post(body({ total_price: 0, promo_code_id: PROMO_ID }))).status).toBe(201);
    });
  });

  describe("deposits", () => {
    const depositTables = (deposit: unknown) =>
      tables({
        homestays: [{ data: { host_id: "host-1" } }, { data: { hosts: deposit } }],
      });

    it("charges the host's configured deposit rather than the client's figure", async () => {
      const supabase = mockClient({
        tables: depositTables({ deposit_amount: 500, deposit_by_month: null }),
      });

      await post(body({ payment_type: "deposit", amount_paid: 1 }));
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_atomic",
        expect.objectContaining({ p_payment_type: "deposit", p_amount_paid: 500 }),
      );
    });

    it("uses the deposit configured for the check-in month", async () => {
      const supabase = mockClient({
        tables: depositTables({ deposit_amount: 500, deposit_by_month: { "1": 900 } }),
      });

      await post(body({ payment_type: "deposit" }));
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_atomic",
        expect.objectContaining({ p_amount_paid: 900 }),
      );
    });

    it("refuses a deposit when the host has not enabled one", async () => {
      mockClient({ tables: depositTables({ deposit_amount: 0, deposit_by_month: null }) });
      await expect(readJson(await post(body({ payment_type: "deposit" })))).resolves.toEqual({
        status: 400,
        body: { error: "Deposit payment is not enabled for this homestay" },
      });
    });

    it("refuses a deposit when the host row cannot be read", async () => {
      mockClient({ tables: depositTables(null) });
      expect((await post(body({ payment_type: "deposit" }))).status).toBe(400);
    });

    it("pays the full price when no deposit was requested", async () => {
      const supabase = mockClient();
      await post(body());
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_atomic",
        expect.objectContaining({ p_payment_type: "full", p_amount_paid: 2000 }),
      );
    });
  });

  describe("when the dates cannot be taken", () => {
    const rpcFails = (message: string) =>
      mockClient({ rpc: { create_booking_atomic: { data: null, error: { message } } } });

    it("reports a conflict when the room was taken first", async () => {
      rpcFails("DATES_UNAVAILABLE");
      await expect(readJson(await post(body()))).resolves.toEqual({
        status: 409,
        body: { error: "Selected dates are no longer available for this room" },
      });
    });

    it("reports a conflict when the host has closed those dates", async () => {
      rpcFails("DATES_BLOCKED");
      await expect(readJson(await post(body()))).resolves.toEqual({
        status: 409,
        body: { error: "Some selected dates are blocked by the host" },
      });
    });

    it("reports 404 when the room vanished mid-flight", async () => {
      rpcFails("ROOM_NOT_FOUND");
      expect((await post(body())).status).toBe(404);
    });

    it("reports 500 for any other database failure", async () => {
      rpcFails("deadlock detected");
      await expect(readJson(await post(body()))).resolves.toEqual({
        status: 500,
        body: { error: "Failed to create booking" },
      });
    });

    it("reports 500 when the error carries no message", async () => {
      mockClient({ rpc: { create_booking_atomic: { data: null, error: {} } } });
      expect((await post(body()))).toMatchObject({ status: 500 });
    });
  });

  describe("deferred work", () => {
    it("logs the booking and notifies afterwards, not before responding", async () => {
      await post(body());
      expect(h.logEvent).not.toHaveBeenCalled();

      await runAfter();

      expect(h.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: "booking", entityId: BOOKING_ID, actorType: "guest" }),
      );
      expect(h.sendBookingConfirmationEmail).toHaveBeenCalled();
      expect(h.dispatchHostNotification).toHaveBeenCalled();
    });

    it("tells the recommender their code earned a commission", async () => {
      mockClient({
        tables: tables({
          homestays: [{ data: { host_id: "host-1" } }, { data: { promo_codes_enabled: true } }],
          promo_codes: {
            data: makePromoCode({
              id: PROMO_ID,
              recommender_name: "Ann",
              recommender_phone: "0899999999",
              commission_type: "percentage",
              commission_value: 5,
            }),
          },
        }),
      });

      await post(body({ total_price: 0, promo_code_id: PROMO_ID }));
      await runAfter();

      expect(h.sendRecommenderPromoUsedNotification).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: BOOKING_ID, guestName: "Nok Suwan" }),
        "th",
      );
    });

    it("stays quiet to the recommender until the slip is verified", async () => {
      mockClient({
        tables: tables({
          homestays: [{ data: { host_id: "host-1" } }, { data: { promo_codes_enabled: true } }],
          promo_codes: { data: makePromoCode({ id: PROMO_ID, recommender_name: "Ann" }) },
        }),
      });

      await post(body({ total_price: 0, promo_code_id: PROMO_ID, easyslip_verified: false }));
      await runAfter();

      expect(h.sendRecommenderPromoUsedNotification).not.toHaveBeenCalled();
    });

    it("survives a notification failure without affecting the booking", async () => {
      h.sendBookingConfirmationEmail.mockRejectedValue(new Error("resend down"));
      expect((await post(body())).status).toBe(201);
      await expect(runAfter()).resolves.toBeUndefined();
    });
  });

  describe("a booking with no room", () => {
    const noRoom = () => body({ room_id: undefined });

    it("inserts directly, skipping the atomic room reservation", async () => {
      const supabase = mockClient();

      const { status, body: result } = await readJson(await post(noRoom()));

      expect(status).toBe(201);
      expect(result).toMatchObject({ booking: { id: BOOKING_ID } });
      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(supabase.builderFor("bookings").insert).toHaveBeenCalledWith(
        expect.objectContaining({
          homestay_id: HOMESTAY_ID,
          room_id: null,
          status: "confirmed",
          payment_type: "full",
          amount_paid: 2000,
          discount_amount: 0,
        }),
      );
    });

    it("takes the client price as given, since there is no room to price against", async () => {
      const supabase = mockClient();
      await post(body({ room_id: undefined, total_price: 4242 }));

      expect(supabase.builderFor("bookings").insert).toHaveBeenCalledWith(
        expect.objectContaining({ total_price: 4242, amount_paid: 4242 }),
      );
    });

    it("records an unverified booking as pending and charges no commission", async () => {
      const supabase = mockClient();
      await post(body({ room_id: undefined, easyslip_verified: false }));

      expect(supabase.builderFor("bookings").insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pending", easyslip_verified: false }),
      );
      expect(h.deductCommission).not.toHaveBeenCalled();
    });

    it("charges commission on a verified booking", async () => {
      await post(noRoom());
      expect(h.deductCommission).toHaveBeenCalledWith(BOOKING_ID);
    });

    it("still honours the host's deposit configuration", async () => {
      const supabase = mockClient({
        tables: tables({
          homestays: [{ data: { host_id: "host-1" } }, { data: { hosts: { deposit_amount: 500, deposit_by_month: null } } }],
        }),
      });

      await post(body({ room_id: undefined, payment_type: "deposit" }));
      expect(supabase.builderFor("bookings").insert).toHaveBeenCalledWith(
        expect.objectContaining({ payment_type: "deposit", amount_paid: 500 }),
      );
    });

    it("busts the availability cache and defers the notifications", async () => {
      await post(noRoom());
      expect(h.revalidateTag).toHaveBeenCalledWith(`booking-availability:${HOMESTAY_ID}`, "max");

      await runAfter();
      expect(h.logEvent).toHaveBeenCalledWith(expect.objectContaining({ entityId: BOOKING_ID }));
      expect(h.dispatchHostNotification).toHaveBeenCalled();
    });

    it("reports 500 when the insert fails", async () => {
      mockClient({ tables: tables({ bookings: { data: null, error: { message: "constraint" } } }) });
      await expect(readJson(await post(noRoom()))).resolves.toEqual({
        status: 500,
        body: { error: "Failed to create booking" },
      });
    });
  });

  describe("notification lookups that come up empty", () => {
    const expectQuietAfter = async () => {
      await runAfter();
      expect(h.sendBookingConfirmationEmail).not.toHaveBeenCalled();
      expect(h.dispatchHostNotification).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    };

    it("gives up when the booking cannot be read back", async () => {
      mockClient({
        tables: tables({ bookings: [{ data: { id: BOOKING_ID } }, { data: null }] }),
      });
      await post(body());
      await expectQuietAfter();
    });

    it("gives up when the booking has no homestay attached", async () => {
      mockClient({
        tables: tables({ bookings: [{ data: { id: BOOKING_ID } }, { data: { id: BOOKING_ID, homestay: null } }] }),
      });
      await post(body());
      await expectQuietAfter();
    });

    it("gives up when the homestay has no host attached", async () => {
      mockClient({
        tables: tables({
          bookings: [
            { data: { id: BOOKING_ID } },
            { data: { id: BOOKING_ID, homestay: { id: HOMESTAY_ID, host: null } } },
          ],
        }),
      });
      await post(body());
      await expectQuietAfter();
    });
  });

  it("logs but does not rethrow when the recommender notice fails", async () => {
    mockClient({
      tables: tables({
        homestays: [{ data: { host_id: "host-1" } }, { data: { promo_codes_enabled: true } }],
        promo_codes: { data: makePromoCode({ id: PROMO_ID, recommender_name: "Ann" }) },
      }),
    });
    h.sendRecommenderPromoUsedNotification.mockRejectedValue(new Error("sms down"));

    await post(body({ total_price: 0, promo_code_id: PROMO_ID }));
    await expect(runAfter()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[Promo] Recommender notify failed:", expect.anything());
  });

  it("reports 500 when something unexpected throws", async () => {
    h.createServiceRoleClient.mockImplementation(() => {
      throw new Error("no database");
    });
    await expect(readJson(await post(body()))).resolves.toEqual({
      status: 500,
      body: { error: "Failed to create booking" },
    });
  });
});
