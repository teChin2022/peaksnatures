import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { signIn, signOut } from "../../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../../test/helpers/request";
import type { QueryResponse } from "../../../../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  isAdmin: vi.fn(),
  logEvent: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("@/lib/admin", () => ({ isAdmin: h.isAdmin }));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: h.logEvent,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    h.afterCallbacks.push(cb);
  },
}));

const params = Promise.resolve({ id: "host-1" });
const post = (body: Record<string, unknown>) =>
  POST(makeRequest("/api/admin/hosts/host-1/wallet", { body }), { params });

const scenario = (adjust: QueryResponse = { data: [{ new_balance: 700, transaction_id: "txn-1" }] }) =>
  signIn(h, {
    tables: { platform_admins: { data: { name: "Root" } } },
    rpc: { adjust_wallet: adjust },
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  scenario();
});

describe("POST /api/admin/hosts/[id]/wallet", () => {
  // The old route read the balance, added in JavaScript and wrote the sum back
  // with no lock — a commission deducted in between was overwritten — and kept
  // the ledger row in a second, unchecked insert.
  it("applies the adjustment through the atomic RPC, never a read-modify-write", async () => {
    const sc = scenario();
    await expect(readJson(await post({ amount: -300, reason: "Refund duplicate charge" })))
      .resolves.toEqual({ status: 200, body: { success: true, new_balance: 700 } });

    expect(sc.rpc).toHaveBeenCalledWith("adjust_wallet", {
      p_host_id: "host-1",
      p_amount: -300,
      p_description: "Admin adjustment: Refund duplicate charge",
      p_created_by: "Root",
    });
    expect(sc.calls.map((c) => c.table)).not.toContain("hosts");
    expect(sc.calls.map((c) => c.table)).not.toContain("wallet_transactions");
  });

  it("logs the adjustment after the response", async () => {
    await post({ amount: 500, reason: "Goodwill credit" });
    for (const cb of h.afterCallbacks) await cb();
    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "WALLET_ADJUSTMENT",
        data: expect.objectContaining({ amount: 500, new_balance: 700, adjusted_by: "Root" }),
      }),
    );
  });

  it.each([0, 1.5, "100", null])("rejects an amount of %s", async (amount) => {
    const sc = scenario();
    await expect(readJson(await post({ amount, reason: "x" })))
      .resolves.toEqual({ status: 400, body: { error: "Invalid amount" } });
    expect(sc.rpc).not.toHaveBeenCalled();
  });

  it("requires a reason", async () => {
    await expect(readJson(await post({ amount: 100 })))
      .resolves.toEqual({ status: 400, body: { error: "Reason is required" } });
  });

  it("reports a missing host as 404", async () => {
    scenario({ error: { message: "HOST_NOT_FOUND" } });
    await expect(readJson(await post({ amount: 100, reason: "x" })))
      .resolves.toEqual({ status: 404, body: { error: "Host not found" } });
  });

  it("reports any other RPC failure as 500, with nothing logged", async () => {
    scenario({ error: { message: "boom" } });
    await expect(readJson(await post({ amount: 100, reason: "x" })))
      .resolves.toEqual({ status: 500, body: { error: "Failed to adjust wallet" } });
    expect(h.afterCallbacks).toHaveLength(0);
  });

  it("refuses a non-admin", async () => {
    signIn(h, { admin: false });
    expect((await post({ amount: 100, reason: "x" })).status).toBe(401);
  });

  it("refuses an anonymous caller", async () => {
    signOut(h);
    expect((await post({ amount: 100, reason: "x" })).status).toBe(401);
  });
});
