import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { signIn, signOut, sessionError } from "../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../test/helpers/request";
import type { QueryResponse } from "../../../../../../test/helpers/supabase";

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

describe("booking details on commission and refund rows", () => {
  const BOOKING = {
    id: "bk-1",
    guest_name: "Somsri",
    check_in: "2026-11-12",
    check_out: "2026-11-14",
    booking_source: "agoda",
    room: { name: "Riverside House" },
  };
  const ledger = [
    { id: "t1", type: "commission", amount: -60, reference_id: "bk-1" },
    { id: "t2", type: "refund", amount: 60, reference_id: "bk-1" },
    { id: "t3", type: "topup", amount: 500, reference_id: "slip-ref-9" },
  ];
  const withLedger = (bookings: QueryResponse) =>
    signIn(mocks, {
      tables: { hosts: { data: { id: "host-1" } }, wallet_transactions: [{ count: 3 }, { data: ledger }], bookings },
    });
  const bookingsOf = (body: unknown) =>
    (body as { transactions: { booking: unknown }[] }).transactions.map((t) => t.booking);

  it("attaches the guest, house and stay to commission and refund rows only", async () => {
    withLedger({ data: [BOOKING] });
    const { body } = await readJson(await get());
    expect(bookingsOf(body)).toEqual([BOOKING, BOOKING, null]);
  });

  it("looks the bookings up once, by the booking-linked ids alone", async () => {
    const sc = withLedger({ data: [BOOKING] });
    await get();
    expect(sc.calls.filter((c) => c.table === "bookings")).toHaveLength(1);
    // Deduped, and the top-up's reference is not a booking id.
    expect(sc.builderFor("bookings").in).toHaveBeenCalledWith("id", ["bk-1"]);
  });

  it("skips the lookup when no row references a booking", async () => {
    const sc = withTransactions([{ id: "t3", type: "topup", amount: 500, reference_id: "slip-ref-9" }]);
    await get();
    expect(sc.calls.some((c) => c.table === "bookings")).toBe(false);
  });

  it("leaves booking null once the booking itself is gone", async () => {
    withLedger({ data: [] });
    const { body } = await readJson(await get());
    expect(bookingsOf(body)).toEqual([null, null, null]);
  });

  it("still returns the ledger when the booking lookup fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    withLedger({ data: null, error: { message: "boom" } });

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(bookingsOf(body)).toEqual([null, null, null]);
    expect(error).toHaveBeenCalledWith("[Wallet Transactions] booking lookup failed:", { message: "boom" });
  });
});
