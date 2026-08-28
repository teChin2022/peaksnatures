import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock, type QueryResponse, type SupabaseMockOptions } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
  getHostBlockState: vi.fn(),
  isHostBlocked: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
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
vi.mock("@/lib/billing", () => ({ getHostBlockState: h.getHostBlockState }));
vi.mock("@/lib/plan-expiry", () => ({ isHostBlocked: h.isHostBlocked }));

const BOOKING_ID = "booking-1";
const owned = { host_id: "host-1", hosts: { id: "host-1", name: "Somchai", user_id: "user-1" } };

const booking = (over: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  homestay_id: "homestay-1",
  status: "confirmed",
  checked_in_at: null,
  ...over,
});

function mockClient(
  tables: Record<string, QueryResponse | QueryResponse[]> = { bookings: { data: booking() }, homestays: { data: owned } },
  options: Partial<SupabaseMockOptions> = {},
) {
  h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: { id: "user-1" } }));
  const supabase = createSupabaseMock({ tables, ...options });
  h.createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const post = (payload: unknown) => POST(makeRequest("/api/bookings/host-checkin", { body: payload }));
const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.logEvent.mockResolvedValue(undefined);
  h.getHostBlockState.mockResolvedValue(null);
  h.isHostBlocked.mockReturnValue(false);
  mockClient();
});

describe("POST /api/bookings/host-checkin", () => {
  it("stamps the arrival in the host's name and reports when", async () => {
    const supabase = mockClient();

    const { status, body } = await readJson(await post({ booking_id: BOOKING_ID }));

    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, checked_in_at: expect.any(String) });
    expect(supabase.builderFor("bookings", 1).update).toHaveBeenCalledWith({
      checked_in_at: expect.any(String),
      updated_by: "Somchai",
    });
  });

  it("logs the arrival against the host afterwards", async () => {
    await post({ booking_id: BOOKING_ID });
    expect(h.logEvent).not.toHaveBeenCalled();

    await runAfter();
    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "host", actorId: "user-1", data: { source: "host_dashboard" } }),
    );
  });

  describe("validation", () => {
    it("requires a booking id", async () => {
      await expect(readJson(await post({}))).resolves.toEqual({
        status: 400,
        body: { error: "booking_id is required" },
      });
    });

    it("refuses a body that is not JSON", async () => {
      expect((await POST(makeRequest("/api/bookings/host-checkin", { body: "not json" }))).status).toBe(400);
    });

    it("refuses an anonymous caller", async () => {
      h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: null }));
      await expect(readJson(await post({ booking_id: BOOKING_ID }))).resolves.toEqual({
        status: 401,
        body: { error: "Unauthorized" },
      });
    });

    it("reports 404 for a booking that does not exist", async () => {
      mockClient({ bookings: { data: null }, homestays: { data: owned } });
      await expect(readJson(await post({ booking_id: BOOKING_ID }))).resolves.toEqual({
        status: 404,
        body: { error: "Booking not found" },
      });
    });

    it("refuses a host who does not own the homestay", async () => {
      mockClient({
        bookings: { data: booking() },
        homestays: { data: { host_id: "host-2", hosts: { id: "host-2", name: "Other", user_id: "user-2" } } },
      });
      await expect(readJson(await post({ booking_id: BOOKING_ID }))).resolves.toEqual({
        status: 403,
        body: { error: "Forbidden" },
      });
    });

    it("refuses when the homestay has no host attached", async () => {
      mockClient({ bookings: { data: booking() }, homestays: { data: { host_id: "host-1", hosts: null } } });
      expect((await post({ booking_id: BOOKING_ID })).status).toBe(403);
    });

    it("refuses a host who is behind on billing", async () => {
      h.getHostBlockState.mockResolvedValue({ plan_type: "free", plan_free_expires_at: "2020-01-01" });
      h.isHostBlocked.mockReturnValue(true);

      const { status, body } = await readJson(await post({ booking_id: BOOKING_ID }));
      expect(status).toBe(403);
      expect(body).toMatchObject({ error: "HOST_BLOCKED" });
    });

    it.each(["pending", "verified", "cancelled"])("refuses a %s booking", async (current) => {
      mockClient({ bookings: { data: booking({ status: current }) }, homestays: { data: owned } });
      const { status, body } = await readJson(await post({ booking_id: BOOKING_ID }));
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: "INVALID_STATUS" });
    });

    it("accepts a completed booking", async () => {
      mockClient({ bookings: { data: booking({ status: "completed" }) }, homestays: { data: owned } });
      expect((await post({ booking_id: BOOKING_ID })).status).toBe(200);
    });

    it("refuses a guest who has already arrived, saying when", async () => {
      mockClient({
        bookings: { data: booking({ checked_in_at: "2026-06-01T14:00:00Z" }) },
        homestays: { data: owned },
      });

      const { status, body } = await readJson(await post({ booking_id: BOOKING_ID }));
      expect(status).toBe(409);
      expect(body).toMatchObject({ error: "ALREADY_CHECKED_IN", checked_in_at: "2026-06-01T14:00:00Z" });
    });

    it("reports 500 when the stamp cannot be written", async () => {
      mockClient({
        bookings: [{ data: booking() }, { error: { message: "constraint" } }],
        homestays: { data: owned },
      });
      await expect(readJson(await post({ booking_id: BOOKING_ID }))).resolves.toEqual({
        status: 500,
        body: { error: "Failed to check in" },
      });
    });

    it("reports 400 when something unexpected throws", async () => {
      h.createServerSupabaseClient.mockRejectedValue(new Error("no database"));
      await expect(readJson(await post({ booking_id: BOOKING_ID }))).resolves.toEqual({
        status: 400,
        body: { error: "Invalid request" },
      });
    });
  });
});
