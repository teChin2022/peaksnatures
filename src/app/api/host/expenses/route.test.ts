import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { DELETE, PATCH } from "./[id]/route";
import { signIn, signOut, sessionError } from "../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

const HOST = { data: { id: "host-1" } };
const EXPENSE_ID = "5f0b6f0e-1111-4111-8111-111111111111";

const get = (month?: string) =>
  GET(makeRequest("/api/host/expenses", { method: "GET", searchParams: month ? { month } : undefined }));
const post = (body: unknown) => POST(makeRequest("/api/host/expenses", { body }));
const del = (id = EXPENSE_ID) =>
  DELETE(makeRequest(`/api/host/expenses/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });
const patch = (body: unknown, id = EXPENSE_ID) =>
  PATCH(makeRequest(`/api/host/expenses/${id}`, { method: "PATCH", body }), { params: Promise.resolve({ id }) });

const withMonth = () =>
  signIn(mocks, {
    tables: {
      hosts: HOST,
      homestays: { data: [{ id: "hs-1" }] },
      bookings: { data: [{ total_price: 30000 }, { total_price: 18500 }] },
      wallet_transactions: { data: [{ amount: -3000, type: "commission" }, { amount: 90, type: "refund" }] },
      invoices: { data: [] },
      host_expenses: {
        data: [
          { id: "e1", spent_on: "2026-11-20", category: "wages", amount: "6000.00", note: null },
          { id: "e2", spent_on: "2026-11-03", category: "utilities", amount: 3200, note: "PEA" },
        ],
      },
    },
  });

const goodBody = { spent_on: "2026-11-18", category: "laundry", amount: 450, note: "  ผ้าปู  " };

beforeEach(() => {
  vi.useRealTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/host/expenses", () => {
  it("returns the month's summary and expense rows", async () => {
    withMonth();
    const { status, body } = await readJson(await get("2026-11"));

    expect(status).toBe(200);
    expect(body).toEqual({
      month: "2026-11",
      revenue: 48500,
      commission: 2910,
      planFees: 0,
      aiFees: 0,
      totalExpenses: 9200,
      net: 36390,
      expenses: [
        { id: "e1", spent_on: "2026-11-20", category: "wages", amount: 6000, note: null },
        { id: "e2", spent_on: "2026-11-03", category: "utilities", amount: 3200, note: "PEA" },
      ],
    });
  });

  it("reads only this owner's rows, bounded to the Bangkok month", async () => {
    const sc = withMonth();
    await get("2026-12");

    expect(sc.builderFor("hosts").eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(sc.builderFor("homestays").eq).toHaveBeenCalledWith("host_id", "host-1");

    const bookings = sc.builderFor("bookings");
    expect(bookings.in).toHaveBeenCalledWith("homestay_id", ["hs-1"]);
    expect(bookings.in).toHaveBeenCalledWith("status", ["confirmed", "completed"]);
    expect(bookings.gte).toHaveBeenCalledWith("check_in", "2026-12-01");
    expect(bookings.lt).toHaveBeenCalledWith("check_in", "2027-01-01");

    const wallet = sc.builderFor("wallet_transactions");
    expect(wallet.eq).toHaveBeenCalledWith("host_id", "host-1");
    expect(wallet.in).toHaveBeenCalledWith("type", ["commission", "refund", "ai_usage"]);
    expect(wallet.gte).toHaveBeenCalledWith("created_at", "2026-12-01T00:00:00+07:00");
    expect(wallet.lt).toHaveBeenCalledWith("created_at", "2027-01-01T00:00:00+07:00");

    const invoices = sc.builderFor("invoices");
    expect(invoices.eq).toHaveBeenCalledWith("host_id", "host-1");
    expect(invoices.eq).toHaveBeenCalledWith("status", "paid");
    expect(invoices.gte).toHaveBeenCalledWith("paid_at", "2026-12-01T00:00:00+07:00");

    const expenses = sc.builderFor("host_expenses");
    expect(expenses.eq).toHaveBeenCalledWith("host_id", "host-1");
    expect(expenses.gte).toHaveBeenCalledWith("spent_on", "2026-12-01");
    expect(expenses.lt).toHaveBeenCalledWith("spent_on", "2027-01-01");
  });

  it("defaults to this month in Bangkok, not in UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-30T18:00:00Z")); // 1 Dec 01:00 in Bangkok
    withMonth();
    expect((await readJson(await get())).body).toMatchObject({ month: "2026-12" });
  });

  it("skips the bookings query when the host has no homestay", async () => {
    const sc = signIn(mocks, { tables: { hosts: HOST, homestays: { data: [] } } });
    const { status, body } = await readJson(await get("2026-11"));

    expect(status).toBe(200);
    expect(body).toMatchObject({ revenue: 0, net: 0, expenses: [] });
    expect(sc.calls.some((c) => c.table === "bookings")).toBe(false);
  });

  it("rejects a malformed month before touching the database", async () => {
    const sc = withMonth();
    expect((await get("2026-13")).status).toBe(400);
    expect(sc.from).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    signOut(mocks);
    await expect(readJson(await get("2026-11"))).resolves.toEqual({ status: 401, body: { error: "Unauthorized" } });
  });

  it("refuses a caller whose session errored", async () => {
    sessionError(mocks);
    expect((await get("2026-11")).status).toBe(401);
  });

  it("reports 404 for a login with no hosts row (staff)", async () => {
    signIn(mocks, { tables: { hosts: { data: null } } });
    await expect(readJson(await get("2026-11"))).resolves.toEqual({ status: 404, body: { error: "Host not found" } });
  });

  it("reports a generic 500 when a query fails", async () => {
    signIn(mocks, {
      tables: { hosts: HOST, homestays: { data: [{ id: "hs-1" }] }, invoices: { error: { message: "boom" } } },
    });
    await expect(readJson(await get("2026-11"))).resolves.toEqual({ status: 500, body: { error: "Failed to load" } });
  });
});

describe("POST /api/host/expenses", () => {
  it("records the expense against the session's host, never one from the body", async () => {
    const sc = signIn(mocks, { tables: { hosts: HOST, host_expenses: { data: { id: "new-1" } } } });
    const res = await readJson(await post({ ...goodBody, host_id: "someone-else" }));

    expect(res).toEqual({ status: 201, body: { id: "new-1" } });
    expect(sc.builderFor("host_expenses").insert).toHaveBeenCalledWith({
      host_id: "host-1",
      spent_on: "2026-11-18",
      category: "laundry",
      amount: 450,
      note: "ผ้าปู",
    });
  });

  it("stores an empty note as null", async () => {
    const sc = signIn(mocks, { tables: { hosts: HOST, host_expenses: { data: { id: "new-1" } } } });
    await post({ ...goodBody, note: "   " });
    expect(sc.builderFor("host_expenses").insert).toHaveBeenCalledWith(expect.objectContaining({ note: null }));
  });

  it.each([
    ["an impossible date", { spent_on: "2026-02-30" }],
    ["an unknown category", { category: "fuel" }],
    ["a zero amount", { amount: 0 }],
    ["an amount over the cap", { amount: 10_000_001 }],
    ["an amount sent as text", { amount: "450" }],
    ["a note over 200 characters", { note: "x".repeat(201) }],
  ])("rejects %s", async (_label, patch) => {
    const sc = signIn(mocks, { tables: { hosts: HOST } });
    expect((await post({ ...goodBody, ...patch })).status).toBe(400);
    expect(sc.from).not.toHaveBeenCalled();
  });

  it("rejects a date after today in Bangkok, which the page could never show again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T17:30:00Z")); // 19 Nov 00:30 in Bangkok, still the 18th in UTC
    const sc = signIn(mocks, { tables: { hosts: HOST, host_expenses: { data: { id: "new-1" } } } });

    expect((await post({ ...goodBody, spent_on: "2026-11-20" })).status).toBe(400);
    expect(sc.from).not.toHaveBeenCalled();
    expect((await post({ ...goodBody, spent_on: "2026-11-19" })).status).toBe(201);
  });

  it("rejects a body that is not JSON", async () => {
    signIn(mocks, { tables: { hosts: HOST } });
    expect((await post("not json")).status).toBe(400);
  });

  it("refuses an anonymous caller", async () => {
    signOut(mocks);
    expect((await post(goodBody)).status).toBe(401);
  });

  it("reports 404 for a login with no hosts row (staff)", async () => {
    signIn(mocks, { tables: { hosts: { data: null } } });
    expect((await post(goodBody)).status).toBe(404);
  });

  it("reports a generic 500 when the insert fails", async () => {
    signIn(mocks, { tables: { hosts: HOST, host_expenses: { error: { message: "check violation" } } } });
    await expect(readJson(await post(goodBody))).resolves.toEqual({ status: 500, body: { error: "Failed to save" } });
  });
});

describe("PATCH /api/host/expenses/[id]", () => {
  it("updates only within the session's host, and only the expense's own columns", async () => {
    const sc = signIn(mocks, { tables: { hosts: HOST, host_expenses: { data: [{ id: EXPENSE_ID }] } } });
    const res = await readJson(await patch({ ...goodBody, host_id: "someone-else", id: "other" }));

    expect(res).toEqual({ status: 200, body: { id: EXPENSE_ID } });
    const q = sc.builderFor("host_expenses");
    expect(q.update).toHaveBeenCalledWith({ spent_on: "2026-11-18", category: "laundry", amount: 450, note: "ผ้าปู" });
    expect(q.eq).toHaveBeenCalledWith("id", EXPENSE_ID);
    expect(q.eq).toHaveBeenCalledWith("host_id", "host-1");
  });

  it("reports 404 when the id belongs to another host (nothing changed)", async () => {
    signIn(mocks, { tables: { hosts: HOST, host_expenses: { data: [] } } });
    await expect(readJson(await patch(goodBody))).resolves.toEqual({ status: 404, body: { error: "Not found" } });
  });

  it.each([
    ["an id that is not a uuid", goodBody, "abc"],
    ["an unknown category", { ...goodBody, category: "fuel" }, EXPENSE_ID],
    ["a zero amount", { ...goodBody, amount: 0 }, EXPENSE_ID],
  ])("rejects %s before touching the database", async (_label, body, id) => {
    const sc = signIn(mocks, { tables: { hosts: HOST } });
    expect((await patch(body, id)).status).toBe(400);
    expect(sc.from).not.toHaveBeenCalled();
  });

  it("rejects moving an expense to a date after today in Bangkok", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T17:30:00Z")); // 19 Nov 00:30 in Bangkok
    signIn(mocks, { tables: { hosts: HOST, host_expenses: { data: [{ id: EXPENSE_ID }] } } });
    expect((await patch({ ...goodBody, spent_on: "2026-11-20" })).status).toBe(400);
  });

  it("refuses an anonymous caller", async () => {
    signOut(mocks);
    expect((await patch(goodBody)).status).toBe(401);
  });

  it("reports 404 for a login with no hosts row (staff)", async () => {
    signIn(mocks, { tables: { hosts: { data: null } } });
    expect((await patch(goodBody)).status).toBe(404);
  });

  it("reports a generic 500 when the update fails", async () => {
    signIn(mocks, { tables: { hosts: HOST, host_expenses: { error: { message: "boom" } } } });
    await expect(readJson(await patch(goodBody))).resolves.toEqual({ status: 500, body: { error: "Failed to save" } });
  });
});

describe("DELETE /api/host/expenses/[id]", () => {
  it("deletes only within the session's host", async () => {
    const sc = signIn(mocks, { tables: { hosts: HOST, host_expenses: { data: [{ id: EXPENSE_ID }] } } });
    await expect(readJson(await del())).resolves.toEqual({ status: 200, body: { ok: true } });

    const q = sc.builderFor("host_expenses");
    expect(q.delete).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith("id", EXPENSE_ID);
    expect(q.eq).toHaveBeenCalledWith("host_id", "host-1");
  });

  it("reports 404 when the id belongs to another host (nothing deleted)", async () => {
    signIn(mocks, { tables: { hosts: HOST, host_expenses: { data: [] } } });
    await expect(readJson(await del())).resolves.toEqual({ status: 404, body: { error: "Not found" } });
  });

  it("rejects an id that is not a uuid", async () => {
    const sc = signIn(mocks, { tables: { hosts: HOST } });
    expect((await del("abc")).status).toBe(400);
    expect(sc.from).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    signOut(mocks);
    expect((await del()).status).toBe(401);
  });

  it("reports 404 for a login with no hosts row (staff)", async () => {
    signIn(mocks, { tables: { hosts: { data: null } } });
    expect((await del()).status).toBe(404);
  });

  it("reports a generic 500 when the delete fails", async () => {
    signIn(mocks, { tables: { hosts: HOST, host_expenses: { error: { message: "boom" } } } });
    await expect(readJson(await del())).resolves.toEqual({ status: 500, body: { error: "Failed to delete" } });
  });
});
