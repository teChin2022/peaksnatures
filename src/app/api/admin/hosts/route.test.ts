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

const hostRow = { id: "host-1", user_id: "user-1", name: "Somchai", email: "a@b.co", phone: null, status: "approved", is_verified: true, created_at: "2026-01-01", plan_type: "commission", wallet_balance: 100, plan_free_expires_at: null, commission_pct_override: null, fixed_rate_override: null };

const get = (searchParams?: Record<string, string>) =>
  GET(makeRequest("/api/admin/hosts", { method: "GET", searchParams }));

const withHosts = (hosts: unknown[] = [hostRow], homestays: unknown[] = [], count = 1) =>
  signIn(mocks, {
    tables: { hosts: [{ count }, { data: hosts }], homestays: { data: homestays } },
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  withHosts();
});

describe("GET /api/admin/hosts", () => {
  it("lists hosts with their homestay attached", async () => {
    withHosts([hostRow], [{ host_id: "host-1", name: "Retreat", slug: "retreat", is_active: true }]);

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body).toMatchObject({
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      data: [{ id: "host-1", homestay: { name: "Retreat", slug: "retreat", is_active: true } }],
    });
  });

  it("reports a null homestay for a host who has not created one", async () => {
    withHosts([hostRow], []);
    const { body } = await readJson(await get());
    expect((body as { data: { homestay: unknown }[] }).data[0].homestay).toBeNull();
  });

  it("does not go looking for homestays when there are no hosts", async () => {
    const sc = signIn(mocks, { tables: { hosts: [{ count: 0 }, { data: [] }] } });
    const { body } = await readJson(await get());

    expect(body).toMatchObject({ data: [], total: 0, totalPages: 0 });
    expect(sc.calls.map((c) => c.table)).not.toContain("homestays");
  });

  it("keeps the result private to the caller", async () => {
    expect((await get()).headers.get("Cache-Control")).toBe("private, no-store");
  });

  describe("pagination", () => {
    it("defaults to the first page of twenty", async () => {
      const sc = withHosts();
      await get();
      expect(sc.builderFor("hosts", 1).range).toHaveBeenCalledWith(0, 19);
    });

    it("offsets by page", async () => {
      const sc = withHosts();
      await get({ page: "3", limit: "10" });
      expect(sc.builderFor("hosts", 1).range).toHaveBeenCalledWith(20, 29);
    });

    it("clamps the page size to a hundred", async () => {
      const sc = withHosts();
      await get({ limit: "5000" });
      expect(sc.builderFor("hosts", 1).range).toHaveBeenCalledWith(0, 99);
    });

    it("clamps nonsensical paging back to the first page", async () => {
      const sc = withHosts();
      await get({ page: "-4", limit: "0" });
      expect(sc.builderFor("hosts", 1).range).toHaveBeenCalledWith(0, 0);
    });

    // KNOWN GAP: Math.max(1, NaN) is NaN, so the clamps do not defend against
    // unparseable paging — the range bounds reach PostgREST as NaN rather than
    // falling back to the defaults. The same idiom appears across the admin and
    // host list routes. Pinned deliberately and flagged for review.
    it("passes NaN bounds through when the paging params are unparseable", async () => {
      const sc = withHosts();
      await get({ page: "abc", limit: "abc" });
      expect(sc.builderFor("hosts", 1).range).toHaveBeenCalledWith(NaN, NaN);
    });

    it("reports the page count for a longer list", async () => {
      withHosts([hostRow], [], 45);
      const { body } = await readJson(await get({ limit: "20" }));
      expect(body).toMatchObject({ total: 45, totalPages: 3 });
    });
  });

  describe("filtering", () => {
    it("narrows both the count and the page to a status", async () => {
      const sc = withHosts();
      await get({ status: "pending" });

      expect(sc.builderFor("hosts", 0).eq).toHaveBeenCalledWith("status", "pending");
      expect(sc.builderFor("hosts", 1).eq).toHaveBeenCalledWith("status", "pending");
    });

    it("returns every host when no status is given", async () => {
      const sc = withHosts();
      await get();
      expect(sc.builderFor("hosts", 1).eq).not.toHaveBeenCalled();
    });
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

    it("reports 500 when the host query fails", async () => {
      signIn(mocks, { tables: { hosts: [{ count: 0 }, { data: null, error: { message: "boom" } }] } });
      await expect(readJson(await get())).resolves.toEqual({
        status: 500,
        body: { error: "Failed to fetch hosts" },
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
