import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";
import { createSupabaseMock, type QueryResponse } from "../../../../../../../test/helpers/supabase";
import { signIn, signOut, sessionError } from "../../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../../test/helpers/request";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock("@/lib/admin", () => ({ isAdmin: mocks.isAdmin }));

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
