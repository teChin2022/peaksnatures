import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { signIn, signOut, sessionError } from "../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

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

const invoiceRow = { id: "inv-1", host_id: "host-1", amount: 1000, status: "pending" };

const get = (searchParams?: Record<string, string>) =>
  GET(makeRequest("/api/admin/invoices", { method: "GET", searchParams }));

const withInvoices = (invoices: unknown[] = [invoiceRow], hosts: unknown[] = [], count = 1) =>
  signIn(mocks, {
    tables: { invoices: [{ count }, { data: invoices }], hosts: { data: hosts } },
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  withInvoices();
});

describe("GET /api/admin/invoices", () => {
  it("lists invoices with the billed host attached", async () => {
    withInvoices([invoiceRow], [{ id: "host-1", name: "Somchai", email: "a@b.co" }]);

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body).toMatchObject({
      total: 1,
      page: 1,
      limit: 20,
      invoices: [{ id: "inv-1", host: { name: "Somchai", email: "a@b.co" } }],
    });
  });

  it("reports a null host when the owner row is missing", async () => {
    withInvoices([invoiceRow], []);
    const { body } = await readJson(await get());
    expect((body as { invoices: { host: unknown }[] }).invoices[0].host).toBeNull();
  });

  it("asks for each host only once across several invoices", async () => {
    const sc = withInvoices([invoiceRow, { ...invoiceRow, id: "inv-2" }], [], 2);
    await get();
    expect(sc.builderFor("hosts").in).toHaveBeenCalledWith("id", ["host-1"]);
  });

  it("does not go looking for hosts when there are no invoices", async () => {
    const sc = signIn(mocks, { tables: { invoices: [{ count: 0 }, { data: [] }] } });
    const { body } = await readJson(await get());

    expect(body).toMatchObject({ invoices: [] });
    expect(sc.calls.map((c) => c.table)).not.toContain("hosts");
  });

  it("narrows both the count and the page to a status", async () => {
    const sc = withInvoices();
    await get({ status: "overdue" });

    expect(sc.builderFor("invoices", 0).eq).toHaveBeenCalledWith("status", "overdue");
    expect(sc.builderFor("invoices", 1).eq).toHaveBeenCalledWith("status", "overdue");
  });

  it("pages and clamps the page size", async () => {
    const sc = withInvoices();
    await get({ page: "2", limit: "500" });
    expect(sc.builderFor("invoices", 1).range).toHaveBeenCalledWith(100, 199);
  });

  describe("failures", () => {
    it("refuses an anonymous caller", async () => {
      signOut(mocks);
      await expect(readJson(await get())).resolves.toEqual({ status: 401, body: { error: "Unauthorized" } });
    });

    it("refuses a caller whose session errored", async () => {
      sessionError(mocks);
      expect((await get()).status).toBe(401);
    });

    it("refuses a signed-in non-admin", async () => {
      signIn(mocks, { admin: false });
      expect((await get()).status).toBe(401);
    });

    it("reports 500 when the invoice query fails", async () => {
      signIn(mocks, { tables: { invoices: [{ count: 0 }, { data: null, error: { message: "boom" } }] } });
      await expect(readJson(await get())).resolves.toEqual({
        status: 500,
        body: { error: "Failed to fetch invoices" },
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
});
