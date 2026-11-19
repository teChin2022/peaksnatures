import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";
import { signIn, signOut } from "../../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../../test/helpers/request";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  isAdmin: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
  notifyHostAlert: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock("@/lib/admin", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    mocks.afterCallbacks.push(cb);
  },
}));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: mocks.logEvent,
}));
vi.mock("@/lib/notifications", () => ({ notifyHostAlert: mocks.notifyHostAlert }));

const runAfter = async () => {
  for (const cb of mocks.afterCallbacks.splice(0)) await cb();
};

const HOST_ID = "host-1";
const params = Promise.resolve({ id: HOST_ID });
const patch = (body: unknown) =>
  PATCH(makeRequest(`/api/admin/hosts/${HOST_ID}/ai`, { method: "PATCH", body }), { params });

const HOST_ROW = {
  name: "บ้านม่อน",
  phone: "0800000000",
  email: "host@example.test",
  notification_preference: "line",
  line_channel_access_token: "token",
  line_user_id: "U1",
};
const saved = (status: string, cap = 50) => ({ host_id: HOST_ID, status, daily_reply_cap: cap });

/** settings read → update result; admin name; host row for the alert. */
const withState = (current: { status: string; daily_reply_cap?: number } | null, updated: unknown = null) =>
  signIn(mocks, {
    tables: {
      host_ai_settings: [{ data: current && { daily_reply_cap: 50, ...current } }, { data: updated }],
      platform_admins: { data: { name: "Root" } },
      hosts: { data: HOST_ROW },
    },
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.afterCallbacks.length = 0;
  mocks.logEvent.mockReset().mockResolvedValue(undefined);
  mocks.notifyHostAlert.mockReset().mockResolvedValue({ success: true, channel: "line" });
});

describe("PATCH /api/admin/hosts/[id]/ai", () => {
  it("approves a request, records the admin, logs it and tells the host", async () => {
    const sc = withState({ status: "requested" }, saved("approved"));

    await expect(readJson(await patch({ action: "approve" }))).resolves.toEqual({
      status: 200,
      body: { settings: saved("approved") },
    });
    const update = sc.builderFor("host_ai_settings", 1);
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved", decided_by: "Root", decided_at: expect.any(String) }),
    );
    expect(update.eq).toHaveBeenCalledWith("host_id", HOST_ID);
    // Conditional on the status read, so a concurrent decision is not overwritten.
    expect(update.eq).toHaveBeenCalledWith("status", "requested");

    await runAfter();
    expect(mocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "GUEST_AI_APPROVED",
        actorType: "admin",
        actorId: "user-1",
        data: expect.objectContaining({ from: "requested", to: "approved", admin_name: "Root" }),
      }),
    );
    expect(mocks.notifyHostAlert).toHaveBeenCalledWith(HOST_ROW, expect.stringContaining("อนุมัติ"), expect.any(String));
  });

  it("sets only the daily cap without touching the status or telling the host", async () => {
    const sc = withState({ status: "approved" }, saved("approved", 120));

    expect((await patch({ daily_reply_cap: 120 })).status).toBe(200);
    // Exactly these keys: no status, decided_at or decided_by.
    expect(sc.builderFor("host_ai_settings", 1).update).toHaveBeenCalledWith({
      daily_reply_cap: 120,
      updated_at: expect.any(String),
    });

    await runAfter();
    expect(mocks.logEvent).toHaveBeenCalledTimes(1);
    expect(mocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "GUEST_AI_CAP_CHANGED", data: expect.objectContaining({ from: 50, to: 120 }) }),
    );
    expect(mocks.notifyHostAlert).not.toHaveBeenCalled();
  });

  it.each([
    ["suspend", "requested"],
    ["resume", "approved"],
    ["reject", "approved"],
    ["approve", "suspended"],
  ])("answers 409 to %s while %s and writes nothing", async (action, status) => {
    const sc = withState({ status });
    expect((await patch({ action })).status).toBe(409);
    expect(sc.calls.filter((c) => c.table === "host_ai_settings")).toHaveLength(1);
  });

  it("answers 409 when another admin changed the status in between", async () => {
    withState({ status: "requested" }, null);
    await expect(readJson(await patch({ action: "approve" }))).resolves.toEqual({
      status: 409,
      body: { error: "Status changed, reload" },
    });
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it("answers 404 when the host never asked", async () => {
    withState(null);
    expect((await patch({ action: "approve" })).status).toBe(404);
  });

  it.each([[{}], [{ action: "delete" }], [{ daily_reply_cap: 5000 }], [{ action: "approve", status: "approved" }], ["x"]])(
    "answers 400 to %j before reading anything",
    async (body) => {
      const sc = withState({ status: "requested" });
      expect((await patch(body)).status).toBe(400);
      expect(sc.calls).toHaveLength(0);
    },
  );

  it("answers 401 to a non-admin and to no session", async () => {
    signIn(mocks, { admin: false });
    expect((await patch({ action: "approve" })).status).toBe(401);
    signOut(mocks);
    expect((await patch({ action: "approve" })).status).toBe(401);
  });

  it("answers 500 when the update fails", async () => {
    signIn(mocks, {
      tables: {
        host_ai_settings: [{ data: { status: "requested", daily_reply_cap: 50 } }, { error: { message: "boom" } }],
        platform_admins: { data: { name: "Root" } },
      },
    });
    expect((await patch({ action: "approve" })).status).toBe(500);
  });

  it("still succeeds when telling the host fails", async () => {
    withState({ status: "approved" }, saved("suspended"));
    mocks.notifyHostAlert.mockRejectedValue(new Error("LINE down"));
    expect((await patch({ action: "suspend" })).status).toBe(200);
    await expect(runAfter()).resolves.toBeUndefined();
  });
});
