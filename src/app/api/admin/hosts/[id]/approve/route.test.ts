import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";
import { type QueryResponse } from "../../../../../../../test/helpers/supabase";
import { signIn, signOut, sessionError } from "../../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  isAdmin: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
  sendHostApprovalEmail: vi.fn(),
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
vi.mock("@/lib/notifications", () => ({ sendHostApprovalEmail: h.sendHostApprovalEmail }));

const HOST_ID = "host-1";
const pending = { id: HOST_ID, name: "Somchai", email: "somchai@example.com", status: "pending" };
const params = Promise.resolve({ id: HOST_ID });
const patch = () => PATCH(makeRequest(`/api/admin/hosts/${HOST_ID}/approve`, { method: "PATCH" }), { params });

const withHost = (hosts: QueryResponse[]) =>
  signIn(h, { tables: { platform_admins: { data: { name: "Root" } }, hosts } });

const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.logEvent.mockResolvedValue(undefined);
  h.sendHostApprovalEmail.mockResolvedValue({ success: true });
  withHost([{ data: pending }, {}]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PATCH /api/admin/hosts/[id]/approve", () => {
  it("approves the host onto a free plan expiring in a month", async () => {
    const sc = withHost([{ data: pending }, {}]);

    await expect(readJson(await patch())).resolves.toEqual({
      status: 200,
      body: { id: HOST_ID, status: "approved" },
    });
    expect(sc.builderFor("hosts", 1).update).toHaveBeenCalledWith({
      status: "approved",
      plan_type: "free",
      plan_free_expires_at: new Date("2026-07-15T00:00:00Z").toISOString(),
      updated_by: "Root",
    });
  });

  it("emails the host the good news", async () => {
    await patch();
    expect(h.sendHostApprovalEmail).toHaveBeenCalledWith("somchai@example.com", "Somchai");
  });

  it("still approves when the welcome email fails", async () => {
    h.sendHostApprovalEmail.mockRejectedValue(new Error("resend down"));
    expect((await patch()).status).toBe(200);
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
  });

  it("records who approved the host", async () => {
    await patch();
    await runAfter();

    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "host",
        entityId: HOST_ID,
        actorType: "admin",
        actorId: "user-1",
        data: { host_name: "Somchai", host_email: "somchai@example.com" },
      }),
    );
  });

  it("falls back to the auth id when the admin has no name on file", async () => {
    const sc = signIn(h, {
      tables: { platform_admins: { data: null }, hosts: [{ data: pending }, {}] },
    });

    await patch();
    expect(sc.builderFor("hosts", 1).update).toHaveBeenCalledWith(
      expect.objectContaining({ updated_by: "user-1" }),
    );
  });

  it("refuses to approve a host who already is", async () => {
    withHost([{ data: { ...pending, status: "approved" } }]);
    await expect(readJson(await patch())).resolves.toEqual({
      status: 400,
      body: { error: "Host is already approved" },
    });
    expect(h.sendHostApprovalEmail).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    signOut(h);
    await expect(readJson(await patch())).resolves.toEqual({ status: 401, body: { error: "Unauthorized" } });
  });

  it("refuses a caller whose session errored", async () => {
    sessionError(h);
    expect((await patch()).status).toBe(401);
  });

  it("refuses a signed-in non-admin", async () => {
    signIn(h, { admin: false });
    expect((await patch()).status).toBe(401);
  });

  it("reports 404 for a host that does not exist", async () => {
    withHost([{ data: null }]);
    await expect(readJson(await patch())).resolves.toEqual({ status: 404, body: { error: "Host not found" } });
  });

  it("reports 500 when the approval cannot be written", async () => {
    withHost([{ data: pending }, { error: { message: "constraint" } }]);
    await expect(readJson(await patch())).resolves.toEqual({
      status: 500,
      body: { error: "Failed to approve" },
    });
  });

  it("reports 500 when something unexpected throws", async () => {
    h.createServerSupabaseClient.mockRejectedValue(new Error("no database"));
    await expect(readJson(await patch())).resolves.toEqual({
      status: 500,
      body: { error: "Something went wrong" },
    });
  });
});
