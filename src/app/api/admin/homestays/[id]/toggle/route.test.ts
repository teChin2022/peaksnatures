import { beforeEach, describe, expect, it, vi } from "vitest";
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

const HOMESTAY_ID = "homestay-1";
const params = Promise.resolve({ id: HOMESTAY_ID });
const patch = () =>
  PATCH(makeRequest(`/api/admin/homestays/${HOMESTAY_ID}/toggle`, { method: "PATCH" }), { params });

const withHomestay = (homestays: QueryResponse[]) =>
  signIn(h, { tables: { platform_admins: { data: { name: "Root" } }, homestays } });

const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.logEvent.mockResolvedValue(undefined);
  withHomestay([{ data: { id: HOMESTAY_ID, is_active: true } }, {}]);
});

describe("PATCH /api/admin/homestays/[id]/toggle", () => {
  it("takes a live homestay offline", async () => {
    const sc = withHomestay([{ data: { id: HOMESTAY_ID, is_active: true } }, {}]);

    await expect(readJson(await patch())).resolves.toEqual({
      status: 200,
      body: { id: HOMESTAY_ID, is_active: false },
    });
    expect(sc.builderFor("homestays", 1).update).toHaveBeenCalledWith({ is_active: false, updated_by: "Root" });
  });

  it("brings an offline homestay back", async () => {
    withHomestay([{ data: { id: HOMESTAY_ID, is_active: false } }, {}]);
    expect((await readJson(await patch())).body).toEqual({ id: HOMESTAY_ID, is_active: true });
  });

  it("records who flipped it and from what", async () => {
    await patch();
    await runAfter();

    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        homestayId: HOMESTAY_ID,
        actorType: "admin",
        actorId: "user-1",
        data: { previous_is_active: true, new_is_active: false },
      }),
    );
  });

  it("falls back to the auth id when the admin has no name on file", async () => {
    const sc = signIn(h, {
      tables: {
        platform_admins: { data: null },
        homestays: [{ data: { id: HOMESTAY_ID, is_active: true } }, {}],
      },
    });

    await patch();
    expect(sc.builderFor("homestays", 1).update).toHaveBeenCalledWith(
      expect.objectContaining({ updated_by: "user-1" }),
    );
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

  it("reports 404 for a homestay that does not exist", async () => {
    withHomestay([{ data: null }]);
    await expect(readJson(await patch())).resolves.toEqual({
      status: 404,
      body: { error: "Homestay not found" },
    });
  });

  it("reports 500 when the update fails", async () => {
    withHomestay([{ data: { id: HOMESTAY_ID, is_active: true } }, { error: { message: "constraint" } }]);
    await expect(readJson(await patch())).resolves.toEqual({
      status: 500,
      body: { error: "Failed to update" },
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
