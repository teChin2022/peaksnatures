import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "./route";
import { type QueryResponse } from "../../../../../../../../test/helpers/supabase";
import { signIn, signOut, sessionError } from "../../../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../../../test/helpers/request";

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

const LOG_ID = "22222222-2222-4222-8222-222222222222";
const url = `/api/admin/payments/rejected/${LOG_ID}/settle`;
const settle = (body: unknown = { note: "  Topped up ฿450  " }, id = LOG_ID) =>
  POST(makeRequest(url, { method: "POST", body }), { params: Promise.resolve({ id }) });
const undo = (id = LOG_ID) => DELETE(makeRequest(url, { method: "DELETE" }), { params: Promise.resolve({ id }) });
const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};
const rejectedLog = { data: { id: LOG_ID, data: { host_id: "h1", trans_ref: "TX1" } } };
const withTables = (tables: Record<string, QueryResponse | QueryResponse[]>) =>
  signIn(h, { tables: { history_logs: rejectedLog, platform_admins: { data: { name: "Root" } }, ...tables } });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.logEvent.mockReset().mockResolvedValue(undefined);
});

describe("POST settle", () => {
  it("records who settled it, with the trimmed note, and logs it", async () => {
    const sc = withTables({ platform_payment_settlements: { data: { created_at: "2026-11-18T03:00:00Z" } } });

    await expect(readJson(await settle())).resolves.toEqual({
      status: 200,
      body: { settled_at: "2026-11-18T03:00:00Z", settled_by_name: "Root", note: "Topped up ฿450" },
    });
    expect(sc.builderFor("platform_payment_settlements").insert).toHaveBeenCalledWith({
      history_log_id: LOG_ID,
      settled_by: "user-1",
      settled_by_name: "Root",
      note: "Topped up ฿450",
    });
    // Only a PLATFORM_PAYMENT_REJECTED entry can be settled.
    expect(sc.builderFor("history_logs").eq).toHaveBeenCalledWith("event_type", "PLATFORM_PAYMENT_REJECTED");

    await runAfter();
    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "billing",
        entityId: LOG_ID,
        eventType: "PLATFORM_PAYMENT_SETTLED",
        actorType: "admin",
        actorId: "user-1",
        data: { host_id: "h1", note: "Topped up ฿450" },
      }),
    );
  });

  it("accepts no note at all", async () => {
    const sc = withTables({ platform_payment_settlements: { data: { created_at: "2026-11-18T03:00:00Z" } } });
    expect((await settle({})).status).toBe(200);
    expect(sc.builderFor("platform_payment_settlements").insert).toHaveBeenCalledWith(
      expect.objectContaining({ note: null }),
    );
  });

  it("answers 409 when another admin settled it first", async () => {
    withTables({ platform_payment_settlements: { error: { code: "23505", message: "duplicate key" } } });
    await expect(readJson(await settle())).resolves.toEqual({ status: 409, body: { error: "Already settled" } });
    await runAfter();
    expect(h.logEvent).not.toHaveBeenCalled();
  });

  it("refuses an entry that is not a rejected payment", async () => {
    const sc = withTables({ history_logs: { data: null } });
    await expect(readJson(await settle())).resolves.toEqual({
      status: 404,
      body: { error: "Rejected payment not found" },
    });
    expect(sc.calls.filter((c) => c.table === "platform_payment_settlements")).toHaveLength(0);
  });

  it.each([
    ["a malformed id", () => settle(undefined, "1 or 1=1")],
    ["a note over 500 characters", () => settle({ note: "x".repeat(501) })],
    ["a note that is not text", () => settle({ note: 42 })],
  ])("refuses %s", async (_, call) => {
    withTables({});
    await expect(readJson(await call())).resolves.toEqual({ status: 400, body: { error: "Invalid request" } });
  });

  it("answers a generic 500 when the insert fails", async () => {
    withTables({ platform_payment_settlements: { error: { code: "42P01", message: "relation does not exist" } } });
    await expect(readJson(await settle())).resolves.toEqual({ status: 500, body: { error: "Failed to mark settled" } });
  });

  it("refuses a signed-in non-admin", async () => {
    signIn(h, { admin: false });
    expect((await settle()).status).toBe(401);
  });

  it("refuses an anonymous caller", async () => {
    signOut(h);
    expect((await settle()).status).toBe(401);
  });

  it("refuses a caller whose session errored", async () => {
    sessionError(h);
    expect((await settle()).status).toBe(401);
  });
});

describe("DELETE settle (undo)", () => {
  it("removes the mark and logs who had settled it", async () => {
    const sc = withTables({ platform_payment_settlements: { data: { settled_by_name: "Root", note: "oops" } } });

    await expect(readJson(await undo())).resolves.toEqual({ status: 200, body: { success: true } });
    expect(sc.builderFor("platform_payment_settlements").eq).toHaveBeenCalledWith("history_log_id", LOG_ID);

    await runAfter();
    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "PLATFORM_PAYMENT_UNSETTLED",
        actorType: "admin",
        data: { previously_settled_by: "Root", previous_note: "oops" },
      }),
    );
  });

  it("answers 404 when it was not settled", async () => {
    withTables({ platform_payment_settlements: { data: null } });
    await expect(readJson(await undo())).resolves.toEqual({ status: 404, body: { error: "Not settled" } });
  });

  it("refuses a malformed id", async () => {
    withTables({});
    expect((await undo("nope")).status).toBe(400);
  });

  it("answers a generic 500 when the delete fails", async () => {
    withTables({ platform_payment_settlements: { error: { message: "db down" } } });
    await expect(readJson(await undo())).resolves.toEqual({ status: 500, body: { error: "Failed to undo" } });
  });

  it("refuses a signed-in non-admin", async () => {
    signIn(h, { admin: false });
    expect((await undo()).status).toBe(401);
  });
});
