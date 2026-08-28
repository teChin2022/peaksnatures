import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock, type QueryResponse, type SupabaseMockOptions } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  revalidateTag: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
  cancelRedemptionForBooking: vi.fn(),
  dispatchHostNotification: vi.fn(),
  sendHostCancellationSmsNotification: vi.fn(),
  sendHostCancellationLineNotification: vi.fn(),
  buildCancellationMessage: vi.fn(() => "message"),
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
vi.mock("@/lib/promo-redemptions-server", () => ({
  cancelRedemptionForBooking: h.cancelRedemptionForBooking,
}));
vi.mock("@/lib/notifications", () => ({
  dispatchHostNotification: h.dispatchHostNotification,
  sendHostCancellationSmsNotification: h.sendHostCancellationSmsNotification,
  sendHostCancellationLineNotification: h.sendHostCancellationLineNotification,
  buildCancellationMessage: h.buildCancellationMessage,
}));

const BOOKING_ID = "booking-1";
const HOMESTAY_ID = "homestay-1";
const NOW = new Date("2026-06-01T09:00:00+07:00");

const booking = (over: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  homestay_id: HOMESTAY_ID,
  room_id: "room-1",
  status: "confirmed",
  guest_name: "Nok Suwan",
  check_in: "2026-06-20",
  ...over,
});

const homestayWithHost = (cancellationDays = 7) => ({
  id: HOMESTAY_ID,
  name: "Retreat",
  hosts: { id: "host-1", name: "Somchai", cancellation_days: cancellationDays },
});

function tables(over: Record<string, QueryResponse | QueryResponse[]> = {}) {
  return {
    bookings: { data: booking() },
    homestays: { data: homestayWithHost() },
    rooms: { data: { id: "room-1", name: "Pine House" } },
    date_change_requests: {},
    ...over,
  };
}

function mockClient(options: Partial<SupabaseMockOptions> = {}) {
  const supabase = createSupabaseMock({ tables: tables(), ...options });
  h.createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const post = (payload: unknown) => POST(makeRequest("/api/bookings/cancel", { body: payload }));
const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.dispatchHostNotification.mockResolvedValue(undefined);
  h.logEvent.mockResolvedValue(undefined);
  h.cancelRedemptionForBooking.mockResolvedValue(undefined);
  mockClient();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/bookings/cancel", () => {
  it("cancels the booking in the guest's name", async () => {
    const supabase = mockClient();

    await expect(readJson(await post({ booking_id: BOOKING_ID }))).resolves.toEqual({
      status: 200,
      body: { success: true },
    });
    expect(supabase.builderFor("bookings", 1).update).toHaveBeenCalledWith({
      status: "cancelled",
      cancelled_by: "Nok Suwan",
      cancelled_at: expect.any(String),
      updated_by: "Nok Suwan",
    });
  });

  it("records the guest's reason when they gave one", async () => {
    const supabase = mockClient();
    await post({ booking_id: BOOKING_ID, reason: "Plans changed" });
    expect(supabase.builderFor("bookings", 1).update).toHaveBeenCalledWith(
      expect.objectContaining({ cancel_reason: "Plans changed" }),
    );
  });

  it("rejects any pending date-change request and cancels the recommender payout", async () => {
    const supabase = mockClient();

    await post({ booking_id: BOOKING_ID });

    expect(supabase.builderFor("date_change_requests").update).toHaveBeenCalledWith({
      status: "rejected",
      reject_reason: "Booking cancelled",
      updated_by: "Nok Suwan",
    });
    expect(h.cancelRedemptionForBooking).toHaveBeenCalledWith(expect.anything(), BOOKING_ID, "Nok Suwan");
  });

  it("busts the availability and stats caches", async () => {
    await post({ booking_id: BOOKING_ID });
    expect(h.revalidateTag).toHaveBeenCalledWith("admin-stats", "max");
    expect(h.revalidateTag).toHaveBeenCalledWith(`booking-availability:${HOMESTAY_ID}`, "max");
  });

  describe("the cancellation window", () => {
    it("allows a cancellation comfortably ahead of check-in", async () => {
      mockClient({ tables: tables({ homestays: { data: homestayWithHost(7) } }) });
      expect((await post({ booking_id: BOOKING_ID })).status).toBe(200);
    });

    it("allows a cancellation exactly on the boundary", async () => {
      // Check-in on the 8th is 7 days after the 1st.
      mockClient({
        tables: tables({ bookings: { data: booking({ check_in: "2026-06-08" }) }, homestays: { data: homestayWithHost(7) } }),
      });
      expect((await post({ booking_id: BOOKING_ID })).status).toBe(200);
    });

    it("refuses a cancellation a day inside the window", async () => {
      mockClient({
        tables: tables({ bookings: { data: booking({ check_in: "2026-06-07" }) }, homestays: { data: homestayWithHost(7) } }),
      });

      const { status, body } = await readJson(await post({ booking_id: BOOKING_ID }));
      expect(status).toBe(403);
      expect(body).toMatchObject({
        error: "TOO_LATE",
        cancellation_days: 7,
        message: expect.stringContaining("at least 7 days"),
      });
    });

    it("refuses a cancellation after check-in has passed", async () => {
      mockClient({ tables: tables({ bookings: { data: booking({ check_in: "2026-05-01" }) } }) });
      expect((await post({ booking_id: BOOKING_ID })).status).toBe(403);
    });

    it("refuses when the host has not enabled guest cancellation", async () => {
      mockClient({ tables: tables({ homestays: { data: homestayWithHost(0) } }) });

      const { status, body } = await readJson(await post({ booking_id: BOOKING_ID }));
      expect(status).toBe(403);
      expect(body).toMatchObject({ error: "CANCELLATION_DISABLED" });
    });
  });

  describe("validation", () => {
    it("requires a booking id", async () => {
      await expect(readJson(await post({}))).resolves.toEqual({
        status: 400,
        body: { error: "booking_id is required" },
      });
    });

    it("refuses a body that is not JSON", async () => {
      expect((await POST(makeRequest("/api/bookings/cancel", { body: "not json" }))).status).toBe(500);
    });

    it("reports 404 for a booking that does not exist", async () => {
      mockClient({ tables: tables({ bookings: { data: null } }) });
      await expect(readJson(await post({ booking_id: BOOKING_ID }))).resolves.toEqual({
        status: 404,
        body: { error: "Booking not found" },
      });
    });

    it.each(["pending", "verified", "cancelled", "completed"])(
      "refuses to cancel a %s booking",
      async (current) => {
        mockClient({ tables: tables({ bookings: { data: booking({ status: current }) } }) });

        const { status, body } = await readJson(await post({ booking_id: BOOKING_ID }));
        expect(status).toBe(400);
        expect(body).toMatchObject({ error: "INVALID_STATUS" });
      },
    );

    it("reports 404 when the homestay is missing", async () => {
      mockClient({ tables: tables({ homestays: { data: null } }) });
      await expect(readJson(await post({ booking_id: BOOKING_ID }))).resolves.toEqual({
        status: 404,
        body: { error: "Homestay not found" },
      });
    });

    it("reports 404 when the homestay has no host attached", async () => {
      mockClient({ tables: tables({ homestays: { data: { id: HOMESTAY_ID, hosts: null } } }) });
      await expect(readJson(await post({ booking_id: BOOKING_ID }))).resolves.toEqual({
        status: 404,
        body: { error: "Host not found" },
      });
    });

    it("reports 500 when the cancellation write fails", async () => {
      mockClient({ tables: tables({ bookings: [{ data: booking() }, { error: { message: "constraint" } }] }) });
      await expect(readJson(await post({ booking_id: BOOKING_ID }))).resolves.toEqual({
        status: 500,
        body: { error: "Failed to cancel booking" },
      });
    });

    it("reports 500 when something unexpected throws", async () => {
      h.createServiceRoleClient.mockImplementation(() => {
        throw new Error("no database");
      });
      expect((await post({ booking_id: BOOKING_ID })).status).toBe(500);
    });
  });

  describe("deferred work", () => {
    it("logs the cancellation and tells the host afterwards", async () => {
      await post({ booking_id: BOOKING_ID, reason: "Plans changed" });
      expect(h.logEvent).not.toHaveBeenCalled();

      await runAfter();

      expect(h.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: BOOKING_ID,
          actorType: "guest",
          data: { guest_name: "Nok Suwan", reason: "Plans changed" },
        }),
      );
      expect(h.dispatchHostNotification).toHaveBeenCalled();
    });

    it("looks up the room for the host's message", async () => {
      h.dispatchHostNotification.mockImplementation(
        async (_d: unknown, sms: () => unknown, line: () => unknown, _s: string, build: () => string) => {
          await sms();
          await line();
          build();
        },
      );

      await post({ booking_id: BOOKING_ID });
      await runAfter();

      expect(h.sendHostCancellationSmsNotification).toHaveBeenCalledWith(
        expect.objectContaining({ room: { id: "room-1", name: "Pine House" } }),
      );
      expect(h.buildCancellationMessage).toHaveBeenCalled();
    });

    it("copes with a booking that names no room", async () => {
      mockClient({ tables: tables({ bookings: { data: booking({ room_id: null }) } }) });

      await post({ booking_id: BOOKING_ID });
      await runAfter();

      expect(h.dispatchHostNotification).toHaveBeenCalledWith(
        expect.objectContaining({ room: undefined }),
        expect.anything(), expect.anything(), expect.anything(), expect.anything(),
      );
    });

    it("survives a notification failure", async () => {
      h.dispatchHostNotification.mockRejectedValue(new Error("sms down"));

      await post({ booking_id: BOOKING_ID });
      await expect(runAfter()).resolves.toBeUndefined();
      expect(console.error).toHaveBeenCalled();
    });
  });
});
