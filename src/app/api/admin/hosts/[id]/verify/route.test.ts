import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";
import { createSupabaseMock, type QueryResponse } from "../../../../../../../test/helpers/supabase";
import { signIn, signOut, sessionError } from "../../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../../test/helpers/request";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  isAdmin: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
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

const runAfter = async () => {
  for (const cb of mocks.afterCallbacks.splice(0)) await cb();
};

const HOST_ID = "host-1";
const params = Promise.resolve({ id: HOST_ID });
const patch = () => PATCH(makeRequest(`/api/admin/hosts/${HOST_ID}/verify`, { method: "PATCH" }), { params });

const withHost = (host: unknown, hosts?: QueryResponse[]) =>
  signIn(mocks, {
    tables: {
      platform_admins: { data: { name: "Root" } },
      hosts: hosts ?? [{ data: host }, {}],
    },
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.afterCallbacks.length = 0;
  mocks.logEvent.mockReset().mockResolvedValue(undefined);
  withHost({ id: HOST_ID, name: "Somchai", is_verified: false });
});

describe("PATCH /api/admin/hosts/[id]/verify", () => {
  it("marks an unverified host as verified", async () => {
    const sc = withHost({ id: HOST_ID, name: "Somchai", is_verified: false });

    await expect(readJson(await patch())).resolves.toEqual({
      status: 200,
      body: { id: HOST_ID, is_verified: true },
    });
    expect(sc.builderFor("hosts", 1).update).toHaveBeenCalledWith({ is_verified: true, updated_by: "Root" });
  });

  it("toggles a verified host back off", async () => {
    const sc = withHost({ id: HOST_ID, name: "Somchai", is_verified: true });

    await expect(readJson(await patch())).resolves.toEqual({
      status: 200,
      body: { id: HOST_ID, is_verified: false },
    });
    expect(sc.builderFor("hosts", 1).update).toHaveBeenCalledWith({ is_verified: false, updated_by: "Root" });
  });

  it("records who verified the host in the audit log", async () => {
    withHost({ id: HOST_ID, name: "Somchai", is_verified: false });
    await patch();
    await runAfter();
    expect(mocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "host",
        entityId: HOST_ID,
        eventType: "HOST_VERIFIED",
        actorType: "admin",
        actorId: "user-1",
        data: { host_name: "Somchai", is_verified: true, admin_name: "Root" },
      }),
    );
  });

  it("logs nothing when the update fails", async () => {
    withHost(null, [
      { data: { id: HOST_ID, name: "Somchai", is_verified: false } },
      { error: { message: "constraint" } },
    ]);
    await patch();
    await runAfter();
    expect(mocks.logEvent).not.toHaveBeenCalled();
  });

  it("falls back to the auth id when the admin has no name on file", async () => {
    const sc = signIn(mocks, {
      tables: {
        platform_admins: { data: null },
        hosts: [{ data: { id: HOST_ID, name: "Somchai", is_verified: false } }, {}],
      },
    });

    await patch();
    expect(sc.builderFor("hosts", 1).update).toHaveBeenCalledWith(
      expect.objectContaining({ updated_by: "user-1" }),
    );
  });

  it("refuses an anonymous caller", async () => {
    signOut(mocks);
    await expect(readJson(await patch())).resolves.toEqual({ status: 401, body: { error: "Unauthorized" } });
  });

  it("refuses a caller whose session errored", async () => {
    sessionError(mocks);
    expect((await patch()).status).toBe(401);
  });

  it("refuses a signed-in non-admin", async () => {
    signIn(mocks, { admin: false });
    expect((await patch()).status).toBe(401);
  });

  it("reports 404 for a host that does not exist", async () => {
    withHost(null);
    await expect(readJson(await patch())).resolves.toEqual({ status: 404, body: { error: "Host not found" } });
  });

  it("reports 500 when the update fails", async () => {
    withHost(null, [
      { data: { id: HOST_ID, name: "Somchai", is_verified: false } },
      { error: { message: "constraint" } },
    ]);
    await expect(readJson(await patch())).resolves.toEqual({
      status: 500,
      body: { error: "Failed to update verification" },
    });
  });

  it("reports 500 when something unexpected throws", async () => {
    mocks.createServerSupabaseClient.mockRejectedValue(new Error("no database"));
    await expect(readJson(await patch())).resolves.toEqual({
      status: 500,
      body: { error: "Something went wrong" },
    });
  });
});
