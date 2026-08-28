import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";
import { type QueryResponse, type SupabaseMockOptions } from "../../../../../../../test/helpers/supabase";
import { signIn, signOut, sessionError } from "../../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  isAdmin: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
  sendHostRejectionEmail: vi.fn(),
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
vi.mock("@/lib/notifications", () => ({ sendHostRejectionEmail: h.sendHostRejectionEmail }));

const HOST_ID = "host-1";
const applicant = { id: HOST_ID, user_id: "auth-user-9", name: "Somchai", email: "somchai@example.com", status: "pending" };
const params = Promise.resolve({ id: HOST_ID });
const del = () => DELETE(makeRequest(`/api/admin/hosts/${HOST_ID}/reject`, { method: "DELETE" }), { params });

const withHost = (hosts: QueryResponse[], extra: Partial<SupabaseMockOptions> = {}) =>
  signIn(h, { tables: { hosts, login_otps: {} }, ...extra });

const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.logEvent.mockResolvedValue(undefined);
  h.sendHostRejectionEmail.mockResolvedValue({ success: true });
  withHost([{ data: applicant }, {}]);
});

describe("DELETE /api/admin/hosts/[id]/reject", () => {
  it("deletes the host, their one-time codes and their login", async () => {
    const sc = withHost([{ data: applicant }, {}]);

    await expect(readJson(await del())).resolves.toEqual({ status: 200, body: { success: true } });

    expect(sc.builderFor("hosts", 1).delete).toHaveBeenCalled();
    expect(sc.builderFor("hosts", 1).eq).toHaveBeenCalledWith("id", HOST_ID);
    expect(sc.builderFor("login_otps").delete).toHaveBeenCalled();
    expect(sc.builderFor("login_otps").eq).toHaveBeenCalledWith("email", "somchai@example.com");
    expect(sc.auth.admin.deleteUser).toHaveBeenCalledWith("auth-user-9");
  });

  it("emails the applicant the decision", async () => {
    await del();
    expect(h.sendHostRejectionEmail).toHaveBeenCalledWith("somchai@example.com", "Somchai");
  });

  it("still rejects when the email fails", async () => {
    h.sendHostRejectionEmail.mockRejectedValue(new Error("resend down"));
    expect((await del()).status).toBe(200);
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
  });

  it("records who rejected the applicant", async () => {
    await del();
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

  it("still reports success when the login could not be removed", async () => {
    withHost([{ data: applicant }, {}], { deleteUserError: { message: "user already gone" } });

    await expect(readJson(await del())).resolves.toEqual({ status: 200, body: { success: true } });
    expect(console.error).toHaveBeenCalledWith(
      "[Admin Reject] delete auth user error:",
      expect.anything(),
    );
  });

  it("refuses an anonymous caller", async () => {
    signOut(h);
    await expect(readJson(await del())).resolves.toEqual({ status: 401, body: { error: "Unauthorized" } });
  });

  it("refuses a caller whose session errored", async () => {
    sessionError(h);
    expect((await del()).status).toBe(401);
  });

  it("refuses a signed-in non-admin", async () => {
    signIn(h, { admin: false });
    expect((await del()).status).toBe(401);
  });

  it("reports 404 for a host that does not exist", async () => {
    withHost([{ data: null }]);
    await expect(readJson(await del())).resolves.toEqual({ status: 404, body: { error: "Host not found" } });
  });

  it("reports 500 when the host row cannot be deleted", async () => {
    withHost([{ data: applicant }, { error: { message: "foreign key" } }]);
    await expect(readJson(await del())).resolves.toEqual({
      status: 500,
      body: { error: "Failed to delete host" },
    });
  });

  it("reports 500 when something unexpected throws", async () => {
    h.createServerSupabaseClient.mockRejectedValue(new Error("no database"));
    await expect(readJson(await del())).resolves.toEqual({
      status: 500,
      body: { error: "Something went wrong" },
    });
  });
});
