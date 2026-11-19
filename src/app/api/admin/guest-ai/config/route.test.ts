import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";
import { signIn, signOut } from "../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../test/helpers/request";

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

const patch = (body: unknown) => PATCH(makeRequest("/api/admin/guest-ai/config", { method: "PATCH", body }));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.afterCallbacks.length = 0;
  mocks.logEvent.mockReset().mockResolvedValue(undefined);
});

describe("PATCH /api/admin/guest-ai/config", () => {
  it("turns the platform switch off, records who, and logs it", async () => {
    const sc = signIn(mocks, {
      tables: { platform_admins: { data: { name: "Root" } }, platform_guest_ai_config: { data: { enabled: false, daily_cap: 300 } } },
    });
    await expect(readJson(await patch({ enabled: false }))).resolves.toEqual({
      status: 200,
      body: { config: { enabled: false, daily_cap: 300 } },
    });
    const update = sc.builderFor("platform_guest_ai_config");
    expect(update.update).toHaveBeenCalledWith({ enabled: false, updated_at: expect.any(String), updated_by: "Root" });
    expect(update.eq).toHaveBeenCalledWith("id", true);

    for (const cb of mocks.afterCallbacks.splice(0)) await cb();
    expect(mocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "GUEST_AI_PLATFORM_CHANGED", actorType: "admin", data: { enabled: false, admin_name: "Root" } }),
    );
  });

  it("sets the daily cap", async () => {
    const sc = signIn(mocks, {
      tables: { platform_admins: { data: { name: "Root" } }, platform_guest_ai_config: { data: { enabled: true, daily_cap: 500 } } },
    });
    expect((await patch({ daily_cap: 500 })).status).toBe(200);
    expect(sc.builderFor("platform_guest_ai_config").update).toHaveBeenCalledWith(expect.objectContaining({ daily_cap: 500 }));
  });

  it("sets the price per reply to the satang", async () => {
    const sc = signIn(mocks, {
      tables: { platform_admins: { data: { name: "Root" } }, platform_guest_ai_config: { data: { enabled: true, daily_cap: 300, price_per_reply: 0.25 } } },
    });
    expect((await patch({ price_per_reply: 0.25 })).status).toBe(200);
    expect(sc.builderFor("platform_guest_ai_config").update).toHaveBeenCalledWith(expect.objectContaining({ price_per_reply: 0.25 }));
  });

  it.each([
    [{}],
    [{ enabled: "no" }],
    [{ daily_cap: -1 }],
    [{ daily_cap: 100_001 }],
    [{ enabled: true, id: false }],
    [{ price_per_reply: -1 }],
    [{ price_per_reply: 101 }],
    [{ price_per_reply: 0.125 }],
  ])(
    "answers 400 to %j",
    async (body) => {
      const sc = signIn(mocks, { tables: {} });
      expect((await patch(body)).status).toBe(400);
      expect(sc.calls).toHaveLength(0);
    },
  );

  it("answers 401 to a non-admin and to no session", async () => {
    signIn(mocks, { admin: false });
    expect((await patch({ enabled: false })).status).toBe(401);
    signOut(mocks);
    expect((await patch({ enabled: false })).status).toBe(401);
  });

  it("answers 500 when the row is missing or the update fails", async () => {
    signIn(mocks, { tables: { platform_admins: { data: { name: "Root" } }, platform_guest_ai_config: { data: null } } });
    expect((await patch({ enabled: false })).status).toBe(500);
    signIn(mocks, { tables: { platform_admins: { data: { name: "Root" } }, platform_guest_ai_config: { error: { message: "x" } } } });
    expect((await patch({ enabled: false })).status).toBe(500);
  });
});
