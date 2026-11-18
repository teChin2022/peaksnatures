import { beforeEach, describe, expect, it, vi } from "vitest";
import { signIn, signOut } from "../../../../../test/helpers/auth";
import { readJson } from "../../../../../test/helpers/request";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  isAdmin: vi.fn(),
  countUnsettledRejected: vi.fn(),
  countStaleDateChanges: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock("@/lib/admin", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/app/admin/billing/rejected/data", () => ({ countUnsettledRejected: mocks.countUnsettledRejected }));
vi.mock("@/app/admin/bookings/date-changes/data", () => ({ countStaleDateChanges: mocks.countStaleDateChanges }));

import { GET } from "./route";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.countUnsettledRejected.mockReset().mockResolvedValue(2);
  mocks.countStaleDateChanges.mockReset().mockResolvedValue(1);
});

describe("GET /api/admin/nav-counts", () => {
  it("returns the work waiting behind each nav item", async () => {
    const sc = signIn(mocks, { tables: { hosts: { count: 3 }, invoices: { count: 4 } } });
    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect(body).toEqual({ pendingHosts: 3, overdueInvoices: 4, unsettledPayments: 2, staleDateChanges: 1 });
    expect(sc.builderFor("hosts").eq).toHaveBeenCalledWith("status", "pending");
  });

  it("refuses anyone who is not an admin, before counting anything", async () => {
    signOut(mocks);
    const { status } = await readJson(await GET());
    expect(status).toBe(401);
    expect(mocks.countUnsettledRejected).not.toHaveBeenCalled();
  });

  it("returns a generic error when a count throws", async () => {
    signIn(mocks, { tables: { hosts: { count: 3 }, invoices: { count: 4 } } });
    mocks.countStaleDateChanges.mockRejectedValue(new Error("db down"));
    const { status, body } = await readJson(await GET());
    expect(status).toBe(500);
    expect(body).toEqual({ error: "Something went wrong" });
  });
});
