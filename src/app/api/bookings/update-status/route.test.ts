import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock, type QueryResponse, type SupabaseMockOptions } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../test/helpers/request";
const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  revalidateTag: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
  deductCommission: vi.fn(),
  cancelRedemptionForBooking: vi.fn(),
  sendBookingStatusUpdateEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
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
vi.mock("@/lib/billing", () => ({ deductCommission: h.deductCommission }));
vi.mock("@/lib/promo-redemptions-server", () => ({
  cancelRedemptionForBooking: h.cancelRedemptionForBooking,
}));
vi.mock("@/lib/notifications", () => ({
  sendBookingStatusUpdateEmail: h.sendBookingStatusUpdateEmail,
}));

const BOOKING_ID = "booking-1";
const HOMESTAY_ID = "homestay-1";

const booking = (over: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  homestay_id: HOMESTAY_ID,
  room_id: "room-1",
  status: "pending",
  group_id: null,
  guest_name: "Nok Suwan",
  ...over,
});

const ownedHomestay = { host_id: "host-1", hosts: { id: "host-1", name: "Somchai", user_id: "user-1" } };

function tables(over: Record<string, QueryResponse | QueryResponse[]> = {}) {
  return {
    bookings: { data: booking() },
    homestays: { data: ownedHomestay },
    rooms: { data: { id: "room-1", name: "Pine House" } },
    booking_groups: {},
    date_change_requests: {},
    ...over,
  };
}

function mockClient(options: Partial<SupabaseMockOptions> = {}) {
  h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: { id: "user-1" } }));
  const supabase = createSupabaseMock({ tables: tables(), ...options });
  h.createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const post = (payload: unknown) => POST(makeRequest("/api/bookings/update-status", { body: payload }));
const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.sendBookingStatusUpdateEmail.mockResolvedValue(undefined);
  h.deductCommission.mockResolvedValue(undefined);
  h.logEvent.mockResolvedValue(undefined);
  h.cancelRedemptionForBooking.mockResolvedValue(undefined);
  mockClient();
});

describe("POST /api/bookings/update-status", () => {
  it("confirms a pending booking", async () => {
    const supabase = mockClient();

    await expect(readJson(await post({ booking_id: BOOKING_ID, status: "confirmed" }))).resolves.toEqual({
      status: 200,
      body: { success: true, status: "confirmed" },
    });
    expect(supabase.builderFor("bookings", 1).update).toHaveBeenCalledWith({
      status: "confirmed",
      updated_by: "Somchai",
    });
  });

  it("cancels a booking, recording who and when", async () => {
    const supabase = mockClient();

    await post({ booking_id: BOOKING_ID, status: "cancelled", reason: "Room flooded" });

    expect(supabase.builderFor("bookings", 1).update).toHaveBeenCalledWith({
      status: "cancelled",
      updated_by: "Somchai",
      cancelled_by: "Somchai",
      cancelled_at: expect.any(String),
      cancel_reason: "Room flooded",
    });
  });

  it("omits the reason when the host gave none", async () => {
    const supabase = mockClient();
    await post({ booking_id: BOOKING_ID, status: "cancelled" });
    expect(supabase.builderFor("bookings", 1).update).toHaveBeenCalledWith(
      expect.not.objectContaining({ cancel_reason: expect.anything() }),
    );
  });

  it("busts the availability and stats caches", async () => {
    await post({ booking_id: BOOKING_ID, status: "confirmed" });
    expect(h.revalidateTag).toHaveBeenCalledWith("admin-stats", "max");
    expect(h.revalidateTag).toHaveBeenCalledWith(`booking-availability:${HOMESTAY_ID}`, "max");
  });

  describe("validation", () => {
    it.each([
      ["no booking id", { status: "confirmed" }],
      ["no status", { booking_id: BOOKING_ID }],
      ["an unknown status", { booking_id: BOOKING_ID, status: "refunded" }],
    ])("refuses %s", async (_label, payload) => {
      const { status } = await readJson(await post(payload));
      expect(status).toBe(400);
    });

    it("refuses a body that is not JSON", async () => {
      expect((await POST(makeRequest("/api/bookings/update-status", { body: "not json" }))).status).toBe(500);
    });

    it("refuses an anonymous caller", async () => {
      h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: null }));
      await expect(readJson(await post({ booking_id: BOOKING_ID, status: "confirmed" }))).resolves.toEqual({
        status: 401,
        body: { error: "Unauthorized" },
      });
    });

    it("reports 404 for a booking that does not exist", async () => {
      mockClient({ tables: tables({ bookings: { data: null } }) });
      await expect(readJson(await post({ booking_id: BOOKING_ID, status: "confirmed" }))).resolves.toEqual({
        status: 404,
        body: { error: "Booking not found" },
      });
    });

    it("refuses a host who does not own the homestay", async () => {
      mockClient({
        tables: tables({ homestays: { data: { host_id: "host-2", hosts: { id: "host-2", name: "Other", user_id: "user-2" } } } }),
      });
      await expect(readJson(await post({ booking_id: BOOKING_ID, status: "confirmed" }))).resolves.toEqual({
        status: 403,
        body: { error: "Forbidden" },
      });
    });

    it("refuses when the homestay has no host row", async () => {
      mockClient({ tables: tables({ homestays: { data: { host_id: "host-1", hosts: null } } }) });
      expect((await post({ booking_id: BOOKING_ID, status: "confirmed" })).status).toBe(403);
    });
  });

  describe("status transitions", () => {
    it("lets a confirmed booking be cancelled", async () => {
      mockClient({ tables: tables({ bookings: { data: booking({ status: "confirmed" }) } }) });
      expect((await post({ booking_id: BOOKING_ID, status: "cancelled" })).status).toBe(200);
    });

    it("refuses to re-confirm a confirmed booking", async () => {
      mockClient({ tables: tables({ bookings: { data: booking({ status: "confirmed" }) } }) });
      const { status, body } = await readJson(await post({ booking_id: BOOKING_ID, status: "confirmed" }));

      expect(status).toBe(400);
      expect(body).toMatchObject({ error: "INVALID_STATUS", message: "Confirmed bookings can only be cancelled" });
    });

    it("accepts a verified booking", async () => {
      mockClient({ tables: tables({ bookings: { data: booking({ status: "verified" }) } }) });
      expect((await post({ booking_id: BOOKING_ID, status: "confirmed" })).status).toBe(200);
    });

    it.each(["cancelled", "rejected", "completed"])("refuses to update a %s booking", async (current) => {
      mockClient({ tables: tables({ bookings: { data: booking({ status: current }) } }) });
      const { status, body } = await readJson(await post({ booking_id: BOOKING_ID, status: "cancelled" }));

      expect(status).toBe(400);
      expect(body).toMatchObject({ message: expect.stringContaining("Only pending, verified, or confirmed") });
    });

    it("reports 500 when the update itself fails", async () => {
      mockClient({
        tables: tables({ bookings: [{ data: booking() }, { error: { message: "constraint" } }] }),
      });
      await expect(readJson(await post({ booking_id: BOOKING_ID, status: "confirmed" }))).resolves.toEqual({
        status: 500,
        body: { error: "Failed to update booking status" },
      });
    });
  });

  describe("multi-room carts", () => {
    const groupTables = (siblings: unknown[]) =>
      tables({
        bookings: [
          { data: booking({ group_id: "group-1" }) },
          {},
          { data: siblings },
          {},
        ],
      });

    it("cascades the change to every sibling room and the cart parent", async () => {
      const supabase = mockClient({ tables: groupTables([{ id: "booking-2" }, { id: "booking-3" }]) });

      await post({ booking_id: BOOKING_ID, status: "confirmed" });

      expect(supabase.builderFor("bookings", 3).in).toHaveBeenCalledWith("id", ["booking-2", "booking-3"]);
      expect(supabase.builderFor("booking_groups").update).toHaveBeenCalledWith({
        status: "confirmed",
        updated_by: "Somchai",
      });
    });

    it("still updates the cart parent when this is the only room left", async () => {
      const supabase = mockClient({ tables: groupTables([]) });

      await post({ booking_id: BOOKING_ID, status: "confirmed" });

      expect(supabase.builderFor("booking_groups").update).toHaveBeenCalled();
      expect(supabase.calls.filter((c) => c.table === "bookings")).toHaveLength(3);
    });

    it("charges commission for every room in the cart", async () => {
      mockClient({ tables: groupTables([{ id: "booking-2" }]) });

      await post({ booking_id: BOOKING_ID, status: "confirmed" });
      await runAfter();

      expect(h.deductCommission).toHaveBeenCalledWith(BOOKING_ID);
      expect(h.deductCommission).toHaveBeenCalledWith("booking-2");
    });

    it("cancels the recommender commission for every room in the cart", async () => {
      mockClient({ tables: groupTables([{ id: "booking-2" }]) });

      await post({ booking_id: BOOKING_ID, status: "cancelled" });

      expect(h.cancelRedemptionForBooking).toHaveBeenCalledWith(expect.anything(), BOOKING_ID, "Somchai");
      expect(h.cancelRedemptionForBooking).toHaveBeenCalledWith(expect.anything(), "booking-2", "Somchai");
    });
  });

  describe("cancellation side effects", () => {
    it("rejects any pending date-change request", async () => {
      const supabase = mockClient();

      await post({ booking_id: BOOKING_ID, status: "cancelled" });

      const builder = supabase.builderFor("date_change_requests");
      expect(builder.update).toHaveBeenCalledWith({
        status: "rejected",
        reject_reason: "Booking cancelled by host",
        updated_by: "Somchai",
      });
      expect(builder.eq).toHaveBeenCalledWith("status", "pending");
    });

    it("leaves date-change requests alone when confirming", async () => {
      const supabase = mockClient();
      await post({ booking_id: BOOKING_ID, status: "confirmed" });
      expect(supabase.calls.map((c) => c.table)).not.toContain("date_change_requests");
    });

    it("charges no commission on cancellation, by policy", async () => {
      await post({ booking_id: BOOKING_ID, status: "cancelled" });
      await runAfter();
      expect(h.deductCommission).not.toHaveBeenCalled();
    });
  });

  describe("deferred work", () => {
    it("logs and emails the guest afterwards", async () => {
      await post({ booking_id: BOOKING_ID, status: "confirmed" });
      expect(h.logEvent).not.toHaveBeenCalled();

      await runAfter();

      expect(h.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          actorType: "host",
          actorId: "user-1",
          data: expect.objectContaining({ previous_status: "pending", new_status: "confirmed" }),
        }),
      );
      expect(h.sendBookingStatusUpdateEmail).toHaveBeenCalledWith(
        expect.objectContaining({ room: { id: "room-1", name: "Pine House" } }),
        "confirmed",
        "th",
        undefined,
      );
    });

    it("passes the guest's locale and the reason to the email", async () => {
      await post({ booking_id: BOOKING_ID, status: "cancelled", reason: "Flooded", locale: "en" });
      await runAfter();

      expect(h.sendBookingStatusUpdateEmail).toHaveBeenCalledWith(
        expect.anything(), "cancelled", "en", "Flooded",
      );
    });

    it("emails without a room when the booking names none", async () => {
      mockClient({ tables: tables({ bookings: { data: booking({ room_id: null }) } }) });

      await post({ booking_id: BOOKING_ID, status: "confirmed" });
      await runAfter();

      expect(h.sendBookingStatusUpdateEmail).toHaveBeenCalledWith(
        expect.objectContaining({ room: undefined }), "confirmed", "th", undefined,
      );
    });

    it("stays quiet when the homestay or host cannot be read", async () => {
      mockClient({ tables: tables({ homestays: [{ data: ownedHomestay }, { data: null }] }) });

      await post({ booking_id: BOOKING_ID, status: "confirmed" });
      await runAfter();

      expect(h.sendBookingStatusUpdateEmail).not.toHaveBeenCalled();
    });

    it("stays quiet when the homestay has no host attached", async () => {
      mockClient({
        tables: tables({ homestays: [{ data: ownedHomestay }, { data: { id: HOMESTAY_ID, hosts: null } }] }),
      });

      await post({ booking_id: BOOKING_ID, status: "confirmed" });
      await runAfter();

      expect(h.sendBookingStatusUpdateEmail).not.toHaveBeenCalled();
    });

    it("survives an email failure", async () => {
      h.sendBookingStatusUpdateEmail.mockRejectedValue(new Error("resend down"));

      await post({ booking_id: BOOKING_ID, status: "confirmed" });
      await expect(runAfter()).resolves.toBeUndefined();
      expect(console.error).toHaveBeenCalled();
    });
  });

  it("reports 500 when something unexpected throws", async () => {
    h.createServiceRoleClient.mockImplementation(() => {
      throw new Error("no database");
    });
    await expect(readJson(await post({ booking_id: BOOKING_ID, status: "confirmed" }))).resolves.toEqual({
      status: 500,
      body: { error: "Failed to update booking status" },
    });
  });
});
