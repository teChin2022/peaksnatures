import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock, type QueryResponse, type SupabaseMockOptions } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: h.createServiceRoleClient }));
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

const BOOKING_ID = "booking-1";
const EMAIL = "guest@example.com";

const booking = (over: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  homestay_id: "homestay-1",
  status: "confirmed",
  guest_name: "Nok Suwan",
  guest_email: EMAIL,
  check_in: "2026-06-01",
  check_out: "2026-06-03",
  checked_in_at: null,
  checked_out_at: null,
  total_price: 2000,
  amount_paid: 2000,
  payment_type: "full",
  ...over,
});

function mockClient(bookings: QueryResponse | QueryResponse[] = { data: booking() }, options: Partial<SupabaseMockOptions> = {}) {
  const supabase = createSupabaseMock({ tables: { bookings }, ...options });
  h.createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const post = (payload: unknown) => POST(makeRequest("/api/bookings/checkin", { body: payload }));
const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.logEvent.mockResolvedValue(undefined);
  mockClient();
});

describe("POST /api/bookings/checkin", () => {
  describe("checking in", () => {
    it("stamps the arrival time", async () => {
      const supabase = mockClient();

      await expect(readJson(await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkin" }))).resolves.toEqual({
        status: 200,
        body: { success: true, action: "checkin" },
      });
      expect(supabase.builderFor("bookings", 1).update).toHaveBeenCalledWith({
        checked_in_at: expect.any(String),
        updated_by: "Nok Suwan",
      });
    });

    it("refuses a guest who has already arrived", async () => {
      mockClient({ data: booking({ checked_in_at: "2026-06-01T14:00:00Z" }) });

      const { status, body } = await readJson(await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkin" }));
      expect(status).toBe(409);
      expect(body).toMatchObject({ error: "ALREADY_CHECKED_IN" });
    });

    it("reports 500 when the stamp cannot be written", async () => {
      mockClient([{ data: booking() }, { error: { message: "constraint" } }]);
      await expect(readJson(await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkin" }))).resolves.toEqual({
        status: 500,
        body: { error: "Failed to check in" },
      });
    });

    it("logs the arrival afterwards", async () => {
      await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkin" });
      expect(h.logEvent).not.toHaveBeenCalled();

      await runAfter();
      expect(h.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: BOOKING_ID, actorType: "guest", data: { guest_email: EMAIL } }),
      );
    });
  });

  describe("checking out", () => {
    const checkedIn = (over: Record<string, unknown> = {}) =>
      booking({ checked_in_at: "2026-06-01T14:00:00Z", ...over });

    it("stamps the departure and completes the booking", async () => {
      const supabase = mockClient({ data: checkedIn() });

      await expect(readJson(await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkout" }))).resolves.toEqual({
        status: 200,
        body: { success: true, action: "checkout" },
      });
      expect(supabase.builderFor("bookings", 1).update).toHaveBeenCalledWith({
        checked_out_at: expect.any(String),
        status: "completed",
        updated_by: "Nok Suwan",
      });
    });

    it("refuses a guest who never checked in", async () => {
      const { status, body } = await readJson(await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkout" }));
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: "NOT_CHECKED_IN" });
    });

    it("refuses a guest who has already left", async () => {
      mockClient({ data: checkedIn({ checked_out_at: "2026-06-03T11:00:00Z" }) });

      const { status, body } = await readJson(await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkout" }));
      expect(status).toBe(409);
      expect(body).toMatchObject({ error: "ALREADY_CHECKED_OUT" });
    });

    it("holds the guest at checkout while a balance is outstanding", async () => {
      mockClient({ data: checkedIn({ total_price: 2000, amount_paid: 500 }) });

      const { status, body } = await readJson(await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkout" }));
      expect(status).toBe(402);
      expect(body).toMatchObject({ error: "BALANCE_DUE", balance_due: 1500 });
      expect((body as { message: string }).message).toContain("฿1,500");
    });

    it("treats a missing paid amount as nothing paid", async () => {
      mockClient({ data: checkedIn({ total_price: 2000, amount_paid: 0 }) });
      const { status, body } = await readJson(await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkout" }));
      expect(status).toBe(402);
      expect(body).toMatchObject({ balance_due: 2000 });
    });

    it("lets an overpaid booking check out", async () => {
      mockClient({ data: checkedIn({ total_price: 2000, amount_paid: 2500 }) });
      expect((await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkout" })).status).toBe(200);
    });

    it("reports 500 when the stamp cannot be written", async () => {
      mockClient([{ data: checkedIn() }, { error: { message: "constraint" } }]);
      await expect(readJson(await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkout" }))).resolves.toEqual({
        status: 500,
        body: { error: "Failed to check out" },
      });
    });

    it("logs the departure afterwards", async () => {
      mockClient({ data: checkedIn() });
      await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkout" });
      await runAfter();

      expect(h.logEvent).toHaveBeenCalledWith(expect.objectContaining({ entityId: BOOKING_ID }));
    });
  });

  describe("validation", () => {
    it.each([
      ["no booking id", { guest_email: EMAIL, action: "checkin" }],
      ["no email", { booking_id: BOOKING_ID, action: "checkin" }],
      ["no action", { booking_id: BOOKING_ID, guest_email: EMAIL }],
    ])("refuses %s", async (_label, payload) => {
      const { status, body } = await readJson(await post(payload));
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: expect.stringContaining("required") });
    });

    it("refuses an unknown action", async () => {
      const { status, body } = await readJson(await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "cancel" }));
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: "action must be 'checkin' or 'checkout'" });
    });

    it("refuses a body that is not JSON", async () => {
      expect((await POST(makeRequest("/api/bookings/checkin", { body: "not json" }))).status).toBe(400);
    });

    it("reports 404 for a booking that does not exist", async () => {
      mockClient({ data: null });
      await expect(readJson(await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkin" }))).resolves.toEqual({
        status: 404,
        body: { error: "Booking not found" },
      });
    });

    it("refuses somebody else's email", async () => {
      await expect(
        readJson(await post({ booking_id: BOOKING_ID, guest_email: "someone@else.com", action: "checkin" })),
      ).resolves.toEqual({ status: 403, body: { error: "Email does not match the booking" } });
    });

    it("matches the guest's email regardless of case", async () => {
      expect((await post({ booking_id: BOOKING_ID, guest_email: "GUEST@Example.COM", action: "checkin" })).status).toBe(200);
    });

    it.each(["pending", "verified", "cancelled"])("refuses a %s booking", async (current) => {
      mockClient({ data: booking({ status: current }) });
      const { status, body } = await readJson(await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkin" }));
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: "INVALID_STATUS" });
    });

    it("still allows a completed booking to be worked with", async () => {
      mockClient({ data: booking({ status: "completed" }) });
      expect((await post({ booking_id: BOOKING_ID, guest_email: EMAIL, action: "checkin" })).status).toBe(200);
    });
  });
});
