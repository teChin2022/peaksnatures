import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { signIn, signOut, sessionError } from "../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../test/helpers/request";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

const txn = { id: "txn-1", host_id: "host-1", type: "commission", amount: -200 };

const get = (searchParams?: Record<string, string>) =>
  GET(makeRequest("/api/host/wallet/transactions", { method: "GET", searchParams }));

const withTransactions = (transactions: unknown[] = [txn], count = 1) =>
  signIn(mocks, {
    tables: { hosts: { data: { id: "host-1" } }, wallet_transactions: [{ count }, { data: transactions }] },
  });

beforeEach(() => {
  withTransactions();
});

describe("GET /api/host/wallet/transactions", () => {
  it("returns the host's own ledger", async () => {
    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body).toMatchObject({ transactions: [txn], total: 1, page: 1, limit: 20 });
  });

  it("reads only this host's transactions, newest first", async () => {
    const sc = withTransactions();
    await get();

    expect(sc.builderFor("hosts").eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(sc.builderFor("wallet_transactions", 0).eq).toHaveBeenCalledWith("host_id", "host-1");
    expect(sc.builderFor("wallet_transactions", 1).eq).toHaveBeenCalledWith("host_id", "host-1");
    expect(sc.builderFor("wallet_transactions", 1).order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("pages, clamping the page size to fifty", async () => {
    const sc = withTransactions();
    await get({ page: "3", limit: "500" });
    expect(sc.builderFor("wallet_transactions", 1).range).toHaveBeenCalledWith(100, 149);
  });

  it("returns an empty ledger rather than null", async () => {
    signIn(mocks, {
      tables: { hosts: { data: { id: "host-1" } }, wallet_transactions: [{}, { data: null }] },
    });
    expect((await readJson(await get())).body).toMatchObject({ transactions: [], total: 0 });
  });

  it("refuses an anonymous caller", async () => {
    signOut(mocks);
    await expect(readJson(await get())).resolves.toEqual({ status: 401, body: { error: "Unauthorized" } });
  });

  it("refuses a caller whose session errored", async () => {
    sessionError(mocks);
    expect((await get()).status).toBe(401);
  });

  it("reports 404 when the signed-in user is not a host", async () => {
    signIn(mocks, { tables: { hosts: { data: null } } });
    await expect(readJson(await get())).resolves.toEqual({ status: 404, body: { error: "Host not found" } });
  });

  it("reports 500 when the ledger query fails", async () => {
    signIn(mocks, {
      tables: {
        hosts: { data: { id: "host-1" } },
        wallet_transactions: [{ count: 0 }, { data: null, error: { message: "boom" } }],
      },
    });
    await expect(readJson(await get())).resolves.toEqual({
      status: 500,
      body: { error: "Failed to fetch transactions" },
    });
  });

  it("reports 500 when something unexpected throws", async () => {
    mocks.createServerSupabaseClient.mockRejectedValue(new Error("no database"));
    await expect(readJson(await get())).resolves.toEqual({
      status: 500,
      body: { error: "Something went wrong" },
    });
  });
});
