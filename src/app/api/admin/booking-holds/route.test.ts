import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";
import { type QueryResponse } from "../../../../../test/helpers/supabase";
import { signIn, signOut } from "../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  isAdmin: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("@/lib/admin", () => ({ isAdmin: h.isAdmin }));
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

const hold = { room_id: "room-1", check_in: "2026-12-01", check_out: "2026-12-03" };
const del = (body: unknown = { id: "hold-1" }) =>
  DELETE(makeRequest("/api/admin/booking-holds", { method: "DELETE", body }));
const withHold = (response: QueryResponse) => signIn(h, { tables: { booking_holds: response } });
const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.logEvent.mockReset().mockResolvedValue(undefined);
  withHold({ data: hold });
});

describe("DELETE /api/admin/booking-holds", () => {
  it("releases the hold and records it in the audit log", async () => {
    const sc = withHold({ data: hold });

    await expect(readJson(await del())).resolves.toEqual({ status: 200, body: { success: true } });
    expect(sc.builderFor("booking_holds").eq).toHaveBeenCalledWith("id", "hold-1");

    await runAfter();
    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "booking_hold",
        entityId: "hold-1",
        eventType: "BOOKING_HOLD_RELEASED",
        actorType: "admin",
        actorId: "user-1",
        data: hold,
      }),
    );
  });

  it("logs nothing when the hold had already expired away", async () => {
    withHold({ data: null });
    expect((await del()).status).toBe(200);
    await runAfter();
    expect(h.logEvent).not.toHaveBeenCalled();
  });

  it("refuses a missing hold id", async () => {
    await expect(readJson(await del({}))).resolves.toEqual({ status: 400, body: { error: "Missing hold id" } });
  });

  it("refuses a signed-in non-admin", async () => {
    signIn(h, { admin: false });
    expect((await del()).status).toBe(401);
  });

  it("refuses an anonymous caller", async () => {
    signOut(h);
    expect((await del()).status).toBe(401);
  });

  it("reports 500 and logs nothing when the delete fails", async () => {
    withHold({ error: { message: "db down" } });
    await expect(readJson(await del())).resolves.toEqual({ status: 500, body: { error: "Failed to delete hold" } });
    await runAfter();
    expect(h.logEvent).not.toHaveBeenCalled();
  });
});
