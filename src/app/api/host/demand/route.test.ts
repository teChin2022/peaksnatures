import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { createSupabaseMock, type QueryResponse } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  getDemandStats: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));
vi.mock("@/lib/demand-stats", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/demand-stats")>()),
  getDemandStats: h.getDemandStats,
}));

function mockClients(tables: Record<string, QueryResponse>, user: { id: string } | null = { id: "user-1" }) {
  h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user }));
  const sc = createSupabaseMock({ tables: { homestays: { data: { id: "homestay-1" } }, ...tables } });
  h.createServiceRoleClient.mockReturnValue(sc);
  return sc;
}

const get = async () => readJson(await GET(makeRequest("/api/host/demand", { method: "GET" })));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.getDemandStats.mockResolvedValue({ views: 3 });
});

describe("GET /api/host/demand", () => {
  it("returns the owner's demand stats", async () => {
    const sc = mockClients({ hosts: { data: { id: "host-1" } } });

    const { status, body } = await get();

    expect(status).toBe(200);
    expect(body).toEqual({ views: 3 });
    expect(sc.builderFor("homestays").eq).toHaveBeenCalledWith("host_id", "host-1");
  });

  // Staff logins (migration 081) see the overview of the host they work for.
  it("returns the stats of the host a staff member works for", async () => {
    const sc = mockClients(
      { hosts: { data: null }, host_staff: { data: { host_id: "host-1" } } },
      { id: "staff-1" },
    );

    const { status } = await get();

    expect(status).toBe(200);
    expect(sc.builderFor("homestays").eq).toHaveBeenCalledWith("host_id", "host-1");
  });

  it("refuses a login that is neither owner nor staff", async () => {
    const sc = mockClients({ hosts: { data: null }, host_staff: { data: null } }, { id: "stranger" });

    expect((await get()).status).toBe(404);
    expect(sc.calls.some((c) => c.table === "homestays")).toBe(false);
  });

  it("refuses a request with no session", async () => {
    const sc = mockClients({}, null);

    expect((await get()).status).toBe(401);
    expect(sc.from).not.toHaveBeenCalled();
  });
});
