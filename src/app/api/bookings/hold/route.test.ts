import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "./route";
import { createSupabaseMock, type SupabaseMockOptions } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson, uniqueIp } from "../../../../../test/helpers/request";

const { createServiceRoleClient } = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient }));

const ROOM_ID = "22222222-2222-4222-8222-222222222222";
const HOLD_ID = "33333333-3333-4333-8333-333333333333";

const body = (over: Record<string, unknown> = {}) => ({
  room_id: ROOM_ID,
  check_in: "2026-06-01",
  check_out: "2026-06-03",
  session_id: "session-abc",
  ...over,
});

const acquire = (payload: unknown) =>
  POST(makeRequest("/api/bookings/hold", { body: payload, ip: uniqueIp() }));
const release = (payload: unknown) =>
  DELETE(makeRequest("/api/bookings/hold", { method: "DELETE", body: payload, ip: uniqueIp() }));

function mockClient(options: SupabaseMockOptions) {
  const supabase = createSupabaseMock(options);
  createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const rpcError = (message: string) => ({
  rpc: { acquire_booking_hold: { data: null, error: { message } } },
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockClient({ rpc: { acquire_booking_hold: { data: HOLD_ID } } });
});

describe("POST /api/bookings/hold", () => {
  it("holds the dates for ten minutes and reports when the hold lapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:00:00Z"));

    const { status, body: result } = await readJson(await acquire(body()));

    expect(status).toBe(200);
    expect(result).toEqual({ hold_id: HOLD_ID, expires_at: "2026-05-01T10:10:00.000Z" });
    vi.useRealTimers();
  });

  it("asks the database to acquire the hold atomically", async () => {
    const supabase = mockClient({ rpc: { acquire_booking_hold: { data: HOLD_ID } } });

    await acquire(body({ guest_phone: "0812345678" }));

    expect(supabase.rpc).toHaveBeenCalledWith("acquire_booking_hold", {
      p_room_id: ROOM_ID,
      p_check_in: "2026-06-01",
      p_check_out: "2026-06-03",
      p_session_id: "session-abc",
      p_hold_minutes: 10,
      p_guest_phone: "0812345678",
    });
  });

  it("passes a null phone when the guest has not given one", async () => {
    const supabase = mockClient({ rpc: { acquire_booking_hold: { data: HOLD_ID } } });
    await acquire(body());
    expect(supabase.rpc).toHaveBeenCalledWith("acquire_booking_hold", expect.objectContaining({ p_guest_phone: null }));
  });

  it.each([
    ["a missing room", { room_id: undefined }],
    ["a non-uuid room", { room_id: "not-a-uuid" }],
    ["a malformed check-in", { check_in: "01/06/2026" }],
    ["a malformed check-out", { check_out: "" }],
    ["an empty session id", { session_id: "" }],
  ])("refuses %s", async (_label, over) => {
    const { status, body: result } = await readJson(await acquire(body(over)));
    expect(status).toBe(400);
    expect(result).toMatchObject({ error: "Invalid hold data" });
  });

  it("returns 500 rather than throwing on a body that is not JSON", async () => {
    const req = makeRequest("/api/bookings/hold", { body: "not json", ip: uniqueIp() });
    expect((await POST(req)).status).toBe(500);
  });

  describe("when the dates cannot be held", () => {
    it("reports a conflict when they are already booked", async () => {
      mockClient(rpcError("DATES_UNAVAILABLE: already booked"));
      const { status, body: result } = await readJson(await acquire(body()));

      expect(status).toBe(409);
      expect(result).toMatchObject({ error: "DATES_UNAVAILABLE" });
    });

    it("reports a conflict when another guest is mid-booking", async () => {
      mockClient(rpcError("DATES_HELD by another session"));
      const { status, body: result } = await readJson(await acquire(body()));

      expect(status).toBe(409);
      expect(result).toMatchObject({ error: "DATES_HELD" });
    });

    it("reports 404 when the room is gone", async () => {
      mockClient(rpcError("ROOM_NOT_FOUND"));
      expect((await acquire(body())).status).toBe(404);
    });

    it("reports 500 for any other database failure", async () => {
      mockClient(rpcError("deadlock detected"));
      const { status, body: result } = await readJson(await acquire(body()));

      expect(status).toBe(500);
      expect(result).toEqual({ error: "Failed to acquire hold" });
    });

    it("reports 500 when the error carries no message", async () => {
      mockClient({ rpc: { acquire_booking_hold: { data: null, error: {} } } });
      expect((await acquire(body())).status).toBe(500);
    });
  });

  it("rate limits a client hammering the endpoint", async () => {
    const ip = "203.0.113.20";
    const hammer = () => POST(makeRequest("/api/bookings/hold", { body: body(), ip }));

    for (let i = 0; i < 10; i++) expect((await hammer()).status).toBe(200);
    expect((await hammer()).status).toBe(429);
  });
});

describe("DELETE /api/bookings/hold", () => {
  it("releases every hold in the session when no hold is named", async () => {
    const supabase = mockClient({ tables: { booking_holds: {} } });

    await expect(readJson(await release({ session_id: "session-abc" }))).resolves.toEqual({
      status: 200,
      body: { released: true },
    });

    const builder = supabase.builderFor("booking_holds");
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("session_id", "session-abc");
    expect(builder.eq).toHaveBeenCalledTimes(1);
  });

  it("releases a single hold when one is named", async () => {
    const supabase = mockClient({ tables: { booking_holds: {} } });

    await release({ session_id: "session-abc", hold_id: HOLD_ID });

    const builder = supabase.builderFor("booking_holds");
    expect(builder.eq).toHaveBeenCalledWith("session_id", "session-abc");
    expect(builder.eq).toHaveBeenCalledWith("id", HOLD_ID);
  });

  it.each([
    ["a missing session", {}],
    ["an empty session", { session_id: "" }],
    ["a non-uuid hold id", { session_id: "s", hold_id: "nope" }],
  ])("refuses %s", async (_label, payload) => {
    const { status, body: result } = await readJson(await release(payload));
    expect(status).toBe(400);
    expect(result).toEqual({ error: "Invalid request" });
  });

  it("returns 500 rather than throwing on a body that is not JSON", async () => {
    const req = makeRequest("/api/bookings/hold", { method: "DELETE", body: "not json", ip: uniqueIp() });
    expect((await DELETE(req)).status).toBe(500);
  });
});
