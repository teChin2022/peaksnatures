import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH, POST } from "./route";
import { signIn, signOut, sessionError } from "../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
  alertAdmins: vi.fn(),
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
vi.mock("@/lib/admin-alert", () => ({ alertAdmins: mocks.alertAdmins }));

const runAfter = async () => {
  for (const cb of mocks.afterCallbacks.splice(0)) await cb();
};

const HOST = { data: { id: "host-1" } };
const SETTINGS = {
  host_id: "host-1",
  status: "approved",
  requested_at: "2026-11-19T03:00:00Z",
  decided_at: "2026-11-19T04:00:00Z",
  enabled: false,
  can_answer: true,
  can_set_dates: true,
  can_suggest_houses: true,
  can_navigate: true,
  instructions: null,
  daily_reply_cap: 50,
};

const get = () => GET();
const post = () => POST(makeRequest("/api/host/ai-admin", { method: "POST" }));
const patch = (body: unknown) => PATCH(makeRequest("/api/host/ai-admin", { method: "PATCH", body }));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.afterCallbacks.length = 0;
  mocks.logEvent.mockReset().mockResolvedValue(undefined);
  mocks.alertAdmins.mockReset().mockResolvedValue(undefined);
});

describe("GET /api/host/ai-admin", () => {
  it("returns null before the host ever asked", async () => {
    signIn(mocks, { tables: { hosts: HOST, host_ai_settings: { data: null } } });
    await expect(readJson(await get())).resolves.toEqual({ status: 200, body: { settings: null, pricePerReply: 0 } });
  });

  it("returns the host's own row, scoped to its hosts row", async () => {
    const sc = signIn(mocks, {
      tables: { hosts: HOST, host_ai_settings: { data: SETTINGS }, platform_guest_ai_config: { data: { price_per_reply: "0.50" } } },
    });
    await expect(readJson(await get())).resolves.toEqual({ status: 200, body: { settings: SETTINGS, pricePerReply: 0.5 } });
    expect(sc.builderFor("hosts").eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(sc.builderFor("host_ai_settings").eq).toHaveBeenCalledWith("host_id", "host-1");
  });

  it("answers 401 without a session and 404 for a login with no hosts row (staff)", async () => {
    signOut(mocks);
    expect((await get()).status).toBe(401);
    sessionError(mocks);
    expect((await get()).status).toBe(401);
    signIn(mocks, { tables: { hosts: { data: null } } });
    expect((await get()).status).toBe(404);
  });

  it("answers 500 when the read fails", async () => {
    signIn(mocks, { tables: { hosts: HOST, host_ai_settings: { error: { message: "boom" } } } });
    await expect(readJson(await get())).resolves.toEqual({ status: 500, body: { error: "Failed to load" } });
  });
});

describe("POST /api/host/ai-admin", () => {
  const requested = { ...SETTINGS, status: "requested", decided_at: null };

  it("creates the request, logs it and alerts the admins", async () => {
    const sc = signIn(mocks, {
      tables: {
        hosts: [HOST, { data: { name: "บ้านม่อน" } }],
        host_ai_settings: [{ data: null }, { data: requested }],
      },
    });

    await expect(readJson(await post())).resolves.toEqual({ status: 201, body: { settings: requested } });
    expect(sc.builderFor("host_ai_settings", 1).insert).toHaveBeenCalledWith({ host_id: "host-1" });

    await runAfter();
    expect(mocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "GUEST_AI_REQUESTED", actorType: "host", actorId: "user-1", entityId: "host-1" }),
    );
    expect(mocks.alertAdmins).toHaveBeenCalledWith(expect.stringContaining("บ้านม่อน"));
  });

  it("re-opens a rejected request", async () => {
    const sc = signIn(mocks, {
      tables: {
        hosts: [HOST, { data: { name: "บ้านม่อน" } }],
        host_ai_settings: [{ data: { status: "rejected" } }, { data: requested }],
      },
    });

    expect((await post()).status).toBe(201);
    const update = sc.builderFor("host_ai_settings", 1);
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "requested", decided_at: null, decided_by: null }),
    );
    expect(update.eq).toHaveBeenCalledWith("status", "rejected");
  });

  it.each(["requested", "approved", "suspended"])("refuses a new request while %s", async (status) => {
    const sc = signIn(mocks, { tables: { hosts: HOST, host_ai_settings: { data: { status } } } });
    await expect(readJson(await post())).resolves.toEqual({ status: 409, body: { error: "Already requested" } });
    expect(sc.calls.filter((c) => c.table === "host_ai_settings")).toHaveLength(1);
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it("answers 409 when a second request races the first (primary key)", async () => {
    signIn(mocks, {
      tables: { hosts: HOST, host_ai_settings: [{ data: null }, { error: { code: "23505", message: "duplicate key" } }] },
    });
    expect((await post()).status).toBe(409);
  });

  it("answers 500 on any other write error", async () => {
    signIn(mocks, { tables: { hosts: HOST, host_ai_settings: [{ data: null }, { error: { message: "boom" } }] } });
    expect((await post()).status).toBe(500);
  });

  it("answers 401 without a session", async () => {
    signOut(mocks);
    expect((await post()).status).toBe(401);
  });
});

describe("PATCH /api/host/ai-admin", () => {
  it("saves the host's settings on an approved assistant only", async () => {
    const saved = { ...SETTINGS, enabled: true, instructions: "ที่จอดรถ 3 คัน" };
    const sc = signIn(mocks, { tables: { hosts: HOST, host_ai_settings: { data: saved } } });

    await expect(readJson(await patch({ enabled: true, instructions: " ที่จอดรถ 3 คัน " }))).resolves.toEqual({
      status: 200,
      body: { settings: saved },
    });
    const update = sc.builderFor("host_ai_settings");
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, instructions: "ที่จอดรถ 3 คัน" }),
    );
    expect(update.eq).toHaveBeenCalledWith("host_id", "host-1");
    expect(update.eq).toHaveBeenCalledWith("status", "approved");

    await runAfter();
    // The instructions text itself never reaches the audit log.
    expect(mocks.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "GUEST_AI_SETTINGS_CHANGED", data: { enabled: true, instructions: "updated" } }),
    );
  });

  it("clears the instructions with an empty string", async () => {
    const sc = signIn(mocks, { tables: { hosts: HOST, host_ai_settings: { data: SETTINGS } } });
    expect((await patch({ instructions: "   " })).status).toBe(200);
    expect(sc.builderFor("host_ai_settings").update).toHaveBeenCalledWith(expect.objectContaining({ instructions: null }));
  });

  // Security review F-04: refused before any query runs.
  it.each([[{ status: "approved" }], [{ daily_reply_cap: 1000 }], [{ enabled: true, decided_by: "me" }], [{}], ["nope"]])(
    "refuses %j with 400 and writes nothing",
    async (body) => {
      const sc = signIn(mocks, { tables: { hosts: HOST } });
      await expect(readJson(await patch(body))).resolves.toEqual({ status: 400, body: { error: "Invalid request" } });
      expect(sc.calls).toHaveLength(0);
    },
  );

  it("answers 409 when the assistant is not approved", async () => {
    signIn(mocks, { tables: { hosts: HOST, host_ai_settings: { data: null } } });
    await expect(readJson(await patch({ enabled: true }))).resolves.toEqual({ status: 409, body: { error: "Not approved" } });
  });

  it("answers 500 when the save fails", async () => {
    signIn(mocks, { tables: { hosts: HOST, host_ai_settings: { error: { message: "boom" } } } });
    expect((await patch({ enabled: true })).status).toBe(500);
  });

  it("answers 401 without a session", async () => {
    signOut(mocks);
    expect((await patch({ enabled: true })).status).toBe(401);
  });
});
