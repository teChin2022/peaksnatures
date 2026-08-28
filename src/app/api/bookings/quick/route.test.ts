import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock, type QueryResponse, type SupabaseMockOptions } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  logEvent: vi.fn(),
  deductCommission: vi.fn(),
  getHostBlockState: vi.fn(),
  isHostBlocked: vi.fn(),
  computeRoomRateTotal: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
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
vi.mock("@/lib/booking-pricing", () => ({ computeRoomRateTotal: h.computeRoomRateTotal }));

const uuid = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
const HOMESTAY_ID = uuid(1);
const ROOM_ID = uuid(2);
const BOOKING_ID = "booking-created";

const body = (over: Record<string, unknown> = {}) => ({
  homestay_id: HOMESTAY_ID,
  room_id: ROOM_ID,
  guest_name: "Walk-in Guest",
  guest_phone: "0898765432",
  check_in: "2026-06-01",
  check_out: "2026-06-03",
  num_guests: 2,
  total_price: 2000,
  ...over,
});

function tables(over: Record<string, QueryResponse | QueryResponse[]> = {}) {
  return {
    hosts: { data: { id: "host-1", name: "Somchai" } },
    homestays: { data: { id: HOMESTAY_ID } },
    booking_holds: { count: 0 },
    bookings: [{}, { data: { id: BOOKING_ID, total_price: 2000 } }],
    rooms: { data: { quantity: 1 } },
    ...over,
  };
}

function mockClient(options: Partial<SupabaseMockOptions> = {}) {
  h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: { id: "user-1" } }));
  const supabase = createSupabaseMock({
    tables: tables(),
    rpc: { create_booking_atomic: { data: BOOKING_ID } },
    ...options,
  });
  h.createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const post = (payload: unknown) => POST(makeRequest("/api/bookings/quick", { body: payload }));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  h.getHostBlockState.mockResolvedValue(null);
  h.isHostBlocked.mockReturnValue(false);
  h.computeRoomRateTotal.mockResolvedValue(3000);
  h.deductCommission.mockResolvedValue(undefined);
  h.logEvent.mockResolvedValue(undefined);
  mockClient();
});

describe("POST /api/bookings/quick", () => {
  it("records a confirmed walk-in booking in the host's name", async () => {
    const supabase = mockClient();

    const { status, body: result } = await readJson(await post(body()));

    expect(status).toBe(201);
    expect(result).toMatchObject({ booking: { id: BOOKING_ID } });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_booking_atomic",
      expect.objectContaining({
        p_status: "confirmed",
        p_easyslip_verified: true,
        p_created_by: "Somchai",
        p_booking_source: "other",
        p_payment_type: "full",
        p_amount_paid: 2000,
        p_payment_slip_hash: expect.stringMatching(/^quick_\d+$/),
      }),
    );
  });

  it("records the booking source the host chose", async () => {
    const supabase = mockClient();
    await post(body({ booking_source: "agoda" }));
    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_booking_atomic",
      expect.objectContaining({ p_booking_source: "agoda" }),
    );
  });

  describe("what the guest handed over", () => {
    it("treats an omitted amount as paid in full", async () => {
      const supabase = mockClient();
      await post(body({ total_price: 2000 }));
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_atomic",
        expect.objectContaining({ p_amount_paid: 2000, p_payment_type: "full" }),
      );
    });

    it("treats a shortfall as a deposit with a balance owing", async () => {
      const supabase = mockClient();
      await post(body({ total_price: 2000, amount_paid: 500 }));
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_atomic",
        expect.objectContaining({ p_amount_paid: 500, p_payment_type: "deposit" }),
      );
    });

    it("clamps an overpayment down to the agreed price", async () => {
      const supabase = mockClient();
      await post(body({ total_price: 2000, amount_paid: 9999 }));
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_atomic",
        expect.objectContaining({ p_amount_paid: 2000, p_payment_type: "full" }),
      );
    });

    it("accepts a booking recorded at no charge", async () => {
      const supabase = mockClient();
      await post(body({ total_price: 0 }));
      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_booking_atomic",
        expect.objectContaining({ p_total_price: 0, p_amount_paid: 0, p_payment_type: "full" }),
      );
    });
  });

  describe("commission", () => {
    it("charges on the room's own rate, not the host-entered price", async () => {
      const supabase = mockClient();

      await post(body({ total_price: 0 }));

      expect(h.computeRoomRateTotal).toHaveBeenCalledWith(expect.anything(), ROOM_ID, "2026-06-01", "2026-06-03");
      expect(supabase.builderFor("bookings", 0).update).toHaveBeenCalledWith({ commission_base: 3000 });
      expect(h.deductCommission).toHaveBeenCalledWith(BOOKING_ID, 3000);
    });

    it("falls back to the booking total when the room has no resolvable rate", async () => {
      h.computeRoomRateTotal.mockResolvedValue(null);

      await post(body());

      expect(h.deductCommission).toHaveBeenCalledWith(BOOKING_ID, undefined);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("No room rate resolved"),
        expect.anything(),
      );
    });

    it("treats a zero room rate as no base", async () => {
      h.computeRoomRateTotal.mockResolvedValue(0);
      await post(body());
      expect(h.deductCommission).toHaveBeenCalledWith(BOOKING_ID, undefined);
    });

    it("still charges when the base could not be persisted", async () => {
      mockClient({
        tables: tables({
          bookings: [{ error: { message: "column missing" } }, { data: { id: BOOKING_ID } }],
        }),
      });

      expect((await post(body())).status).toBe(201);
      expect(h.deductCommission).toHaveBeenCalledWith(BOOKING_ID, 3000);
      expect(console.error).toHaveBeenCalledWith(
        "[QuickBooking] Failed to persist commission_base:",
        expect.anything(),
      );
    });
  });

  describe("validation", () => {
    it("refuses an anonymous caller", async () => {
      h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: null }));
      await expect(readJson(await post(body()))).resolves.toEqual({
        status: 401,
        body: { error: "Unauthorized" },
      });
    });

    it.each([
      ["a non-uuid homestay", { homestay_id: "nope" }],
      ["a missing room", { room_id: undefined }],
      ["a missing name", { guest_name: "" }],
      ["a missing phone", { guest_phone: "" }],
      ["an invalid email", { guest_email: "not-an-email" }],
      ["a malformed date", { check_in: "01/06/2026" }],
      ["zero guests", { num_guests: 0 }],
      ["a negative price", { total_price: -1 }],
    ])("refuses %s", async (_label, over) => {
      const { status, body: result } = await readJson(await post(body(over)));
      expect(status).toBe(400);
      expect(result).toMatchObject({ error: "Invalid booking data" });
    });

    it("accepts an empty email, since a walk-in guest may not give one", async () => {
      expect((await post(body({ guest_email: "" }))).status).toBe(201);
    });

    it("refuses a zero-night stay", async () => {
      await expect(readJson(await post(body({ check_out: "2026-06-01" })))).resolves.toEqual({
        status: 400,
        body: { error: "Invalid date range" },
      });
    });

    it("reports 404 when the caller is not a host", async () => {
      mockClient({ tables: tables({ hosts: { data: null } }) });
      await expect(readJson(await post(body()))).resolves.toEqual({
        status: 404,
        body: { error: "Host not found" },
      });
    });

    it("refuses a homestay the host does not own", async () => {
      mockClient({ tables: tables({ homestays: { data: null } }) });
      await expect(readJson(await post(body()))).resolves.toEqual({
        status: 403,
        body: { error: "Homestay not found or not owned by host" },
      });
    });

    it("refuses a host who is soft-blocked over billing", async () => {
      h.getHostBlockState.mockResolvedValue({ plan_type: "free", plan_free_expires_at: "2020-01-01" });
      h.isHostBlocked.mockReturnValue(true);

      const { status, body: result } = await readJson(await post(body()));
      expect(status).toBe(403);
      expect(result).toMatchObject({ error: expect.stringContaining("temporarily blocked") });
    });
  });

  describe("competing with a guest mid-booking", () => {
    it("refuses when live holds plus bookings fill the room", async () => {
      mockClient({
        tables: tables({
          booking_holds: { count: 1 },
          bookings: [{ count: 0 }, {}, { data: { id: BOOKING_ID } }],
          rooms: { data: { quantity: 1 } },
        }),
      });

      const { status, body: result } = await readJson(await post(body()));
      expect(status).toBe(409);
      expect(result).toMatchObject({ error: "DATES_HELD" });
    });

    it("proceeds when the room still has a spare unit", async () => {
      mockClient({
        tables: tables({
          booking_holds: { count: 1 },
          bookings: [{ count: 0 }, {}, { data: { id: BOOKING_ID } }],
          rooms: { data: { quantity: 3 } },
        }),
      });
      expect((await post(body())).status).toBe(201);
    });

    it("treats a room with no quantity as fully held", async () => {
      mockClient({
        tables: tables({
          booking_holds: { count: 1 },
          bookings: [{ count: 0 }, {}, { data: { id: BOOKING_ID } }],
          rooms: { data: null },
        }),
      });
      expect((await post(body())).status).toBe(409);
    });

    it("skips the hold check entirely when nothing is held", async () => {
      const supabase = mockClient({ tables: tables({ booking_holds: { count: 0 } }) });
      await post(body());
      expect(supabase.calls.map((c) => c.table)).not.toContain("rooms");
    });
  });

  describe("when the dates cannot be taken", () => {
    const rpcFails = (message: string) =>
      mockClient({ rpc: { create_booking_atomic: { data: null, error: { message } } } });

    it.each([
      ["DATES_UNAVAILABLE", 409],
      ["DATES_BLOCKED", 409],
      ["ROOM_NOT_FOUND", 404],
    ])("maps %s to %i", async (message, expected) => {
      rpcFails(message);
      const { status, body: result } = await readJson(await post(body()));
      expect(status).toBe(expected);
      expect(result).toEqual({ error: message });
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
      expect((await post(body())).status).toBe(500);
    });
  });

  it("logs the booking against the host", async () => {
    await post(body({ booking_source: "walk_in", amount_paid: 500 }));

    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: BOOKING_ID,
        actorType: "host",
        actorId: "user-1",
        data: expect.objectContaining({ booking_source: "walk_in", amount_paid: 500, quick_booking: true }),
      }),
    );
  });

  it("still returns the booking when logging fails", async () => {
    h.logEvent.mockRejectedValue(new Error("log table gone"));
    expect((await post(body())).status).toBe(201);
    expect(console.error).toHaveBeenCalledWith("Log error (non-blocking):", expect.anything());
  });

  it("reports 500 when something unexpected throws", async () => {
    h.createServerSupabaseClient.mockRejectedValue(new Error("no database"));
    await expect(readJson(await post(body()))).resolves.toEqual({
      status: 500,
      body: { error: "Internal server error" },
    });
  });
});
