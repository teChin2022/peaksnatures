import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "./route";
import { type QueryResponse } from "../../../../../test/helpers/supabase";
import { signIn, signOut } from "../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

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

const existing = { id: "cfg-1", commission_pct: 10, promptpay_id: "0812345678", bank_name: "KBank" };
const put = (body: unknown) => PUT(makeRequest("/api/admin/billing-config", { method: "PUT", body }));
const withConfig = (config: QueryResponse[]) => signIn(h, { tables: { platform_billing_config: config } });
const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.logEvent.mockReset().mockResolvedValue(undefined);
});

describe("PUT /api/admin/billing-config", () => {
  it("records the old and new value of each changed field", async () => {
    withConfig([{ data: existing }, { data: { ...existing, commission_pct: 12, promptpay_id: "0899999999" } }]);

    expect((await put({ commission_pct: 12, promptpay_id: "0899999999" })).status).toBe(200);
    await runAfter();
    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "billing",
        entityId: "cfg-1",
        eventType: "BILLING_CONFIG_UPDATED",
        actorType: "admin",
        actorId: "user-1",
        data: {
          before: { commission_pct: 10, promptpay_id: "0812345678" },
          after: { commission_pct: 12, promptpay_id: "0899999999" },
        },
      }),
    );
  });

  it("refuses invalid term tiers and logs nothing", async () => {
    withConfig([{ data: existing }]);
    const res = await put({ fixed_rate_term_tiers: [{ months: 0, discount_pct: 5 }] });
    expect(res.status).toBe(400);
    await runAfter();
    expect(h.logEvent).not.toHaveBeenCalled();
  });

  it("reports 404 when no config row exists", async () => {
    withConfig([{ data: null }]);
    await expect(readJson(await put({ commission_pct: 12 }))).resolves.toEqual({
      status: 404,
      body: { error: "Billing config not found" },
    });
  });

  it("reports 500 and logs nothing when the update fails", async () => {
    withConfig([{ data: existing }, { error: { message: "db down" } }]);
    await expect(readJson(await put({ commission_pct: 12 }))).resolves.toEqual({
      status: 500,
      body: { error: "Failed to update billing config" },
    });
    await runAfter();
    expect(h.logEvent).not.toHaveBeenCalled();
  });

  it("refuses a signed-in non-admin", async () => {
    signIn(h, { admin: false });
    expect((await put({ commission_pct: 12 })).status).toBe(401);
  });

  it("refuses an anonymous caller", async () => {
    signOut(h);
    expect((await put({ commission_pct: 12 })).status).toBe(401);
  });
});
