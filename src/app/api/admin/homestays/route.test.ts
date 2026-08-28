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

const homestayRow = { id: "h-1", host_id: "host-1", name: "Retreat", slug: "retreat", location: "Chiang Mai", is_active: true, created_at: "2026-01-01" };

const get = (searchParams?: Record<string, string>) =>
  GET(makeRequest("/api/admin/homestays", { method: "GET", searchParams }));

const withHomestays = (homestays: unknown[] = [homestayRow], hosts: unknown[] = [], count = 1) =>
  signIn(mocks, {
    tables: { homestays: [{ count }, { data: homestays }], hosts: { data: hosts } },
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  withHomestays();
});

describe("GET /api/admin/homestays", () => {
  it("lists homestays with their host attached", async () => {
    withHomestays([homestayRow], [{ id: "host-1", name: "Somchai", email: "a@b.co" }]);

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body).toMatchObject({
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      data: [{ id: "h-1", host: { name: "Somchai", email: "a@b.co" } }],
    });
  });

  it("reports a null host when the owner row is missing", async () => {
    withHomestays([homestayRow], []);
    const { body } = await readJson(await get());
    expect((body as { data: { host: unknown }[] }).data[0].host).toBeNull();
  });

  it("does not go looking for hosts when there are no homestays", async () => {
    const sc = signIn(mocks, { tables: { homestays: [{ count: 0 }, { data: [] }] } });
    await get();
    expect(sc.calls.map((c) => c.table)).not.toContain("hosts");
  });

  it("asks for each host only once when several homestays share one", async () => {
    const sc = withHomestays([homestayRow, { ...homestayRow, id: "h-2" }], [{ id: "host-1", name: "S", email: "a@b.co" }], 2);
    await get();
    expect(sc.builderFor("hosts").in).toHaveBeenCalledWith("id", ["host-1"]);
  });

  it("keeps the result private to the caller", async () => {
    expect((await get()).headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("pages and clamps the page size", async () => {
    const sc = withHomestays();
    await get({ page: "2", limit: "500" });
    expect(sc.builderFor("homestays", 1).range).toHaveBeenCalledWith(100, 199);
  });

  it("orders newest first", async () => {
    const sc = withHomestays();
    await get();
    expect(sc.builderFor("homestays", 1).order).toHaveBeenCalledWith("created_at", { ascending: false });
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

    it("reports 500 when the homestay query fails", async () => {
      signIn(mocks, { tables: { homestays: [{ count: 0 }, { data: null, error: { message: "boom" } }] } });
      await expect(readJson(await get())).resolves.toEqual({
        status: 500,
        body: { error: "Failed to fetch homestays" },
      });
    });

    it("reports 500 when something unexpected throws", async () => {
      mocks.createServerSupabaseClient.mockRejectedValue(new Error("no database"));
      expect((await get()).status).toBe(500);
    });
  });
});
