import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock } from "../../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../../test/helpers/request";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
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

const post = () => POST(makeRequest("/api/admin/auth/verify", { method: "POST" }));
const runAfter = async () => {
  for (const cb of mocks.afterCallbacks.splice(0)) await cb();
};

const admin = { id: "admin-1", name: "Root", email: "root@peaksnature.com" };

const signedIn = (adminRow: unknown, user: { id: string } | null = { id: "user-1" }) => {
  mocks.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user }));
  const sc = createSupabaseMock({ tables: { platform_admins: { data: adminRow } } });
  mocks.createServiceRoleClient.mockReturnValue(sc);
  return sc;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.afterCallbacks.length = 0;
  mocks.logEvent.mockReset().mockResolvedValue(undefined);
  signedIn(admin);
});

describe("POST /api/admin/auth/verify", () => {
  it("identifies the signed-in platform admin", async () => {
    await expect(readJson(await post())).resolves.toEqual({ status: 200, body: { admin } });
  });

  it("looks the admin up by their auth user id", async () => {
    const sc = signedIn(admin);
    await post();
    expect(sc.builderFor("platform_admins").eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("refuses an anonymous caller", async () => {
    signedIn(admin, null);
    await expect(readJson(await post())).resolves.toEqual({ status: 401, body: { error: "Unauthorized" } });
  });

  it("refuses a caller whose session errored", async () => {
    mocks.createServerSupabaseClient.mockResolvedValue(
      createSupabaseMock({ user: null, authError: { message: "expired" } }),
    );
    expect((await post()).status).toBe(401);
  });

  it("refuses a signed-in user who is not an admin", async () => {
    signedIn(null);
    await expect(readJson(await post())).resolves.toEqual({
      status: 403,
      body: { error: "Not a platform admin" },
    });
  });

  it("records each admin sign-in in the audit log", async () => {
    await post();
    await runAfter();
    expect(mocks.logEvent).toHaveBeenCalledTimes(1);
    expect(mocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "admin",
        entityId: "user-1",
        eventType: "ADMIN_LOGIN",
        actorType: "admin",
        actorId: "user-1",
        data: { email: "root@peaksnature.com" },
      }),
    );
  });

  it("records a non-admin reaching the admin gate", async () => {
    signedIn(null);
    await post();
    await runAfter();
    expect(mocks.logEvent).toHaveBeenCalledTimes(1);
    expect(mocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "admin",
        entityId: "user-1",
        eventType: "ADMIN_ACCESS_DENIED",
        actorType: "system",
        data: { user_id: "user-1" },
      }),
    );
  });

  it("logs nothing for an anonymous caller", async () => {
    signedIn(admin, null);
    await post();
    await runAfter();
    expect(mocks.logEvent).not.toHaveBeenCalled();
  });

  it("reports 500 when something unexpected throws", async () => {
    mocks.createServerSupabaseClient.mockRejectedValue(new Error("no database"));
    await expect(readJson(await post())).resolves.toEqual({
      status: 500,
      body: { error: "Something went wrong" },
    });
  });
});
