import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type QueryResponse } from "../../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: h.createServiceRoleClient,
}));

import { countStaleDateChanges, getPendingDateChanges } from "./data";

const NOW = new Date("2026-11-18T03:00:00Z");
const withRequests = (response: QueryResponse) => {
  const sc = createSupabaseMock({ tables: { date_change_requests: response } });
  h.createServiceRoleClient.mockReturnValue(sc);
  return sc;
};
const request = (id: string, created_at: string) => ({
  id,
  created_at,
  old_check_in: "2026-12-01",
  old_check_out: "2026-12-02",
  new_check_in: "2026-12-08",
  new_check_out: "2026-12-09",
  price_difference: 200,
  booking: { guest_name: "Nok", homestay: { name: "Cozy", host_id: "h1", host: { name: "Wang", phone: "0918532470" } } },
});

beforeEach(() => h.createServiceRoleClient.mockReset());

describe("getPendingDateChanges", () => {
  it("reads pending requests oldest first", async () => {
    const sc = withRequests({ data: [] });
    await getPendingDateChanges(NOW);
    const q = sc.builderFor("date_change_requests");
    expect(q.eq).toHaveBeenCalledWith("status", "pending");
    expect(q.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("flattens the booking and marks requests older than two days", async () => {
    withRequests({ data: [request("old", "2026-11-15T03:00:00Z"), request("new", "2026-11-17T03:00:00Z")] });
    const rows = await getPendingDateChanges(NOW);
    expect(rows.map((r) => [r.id, r.stale])).toEqual([
      ["old", true],
      ["new", false],
    ]);
    expect(rows[0]).toMatchObject({
      guest_name: "Nok",
      homestay_name: "Cozy",
      host_id: "h1",
      host_name: "Wang",
      host_phone: "0918532470",
      price_difference: 200,
    });
    expect(rows[0]).not.toHaveProperty("booking");
  });

  it("survives a request whose booking is gone", async () => {
    withRequests({ data: [{ ...request("x", "2026-11-17T03:00:00Z"), booking: null }] });
    const [row] = await getPendingDateChanges(NOW);
    expect(row).toMatchObject({ guest_name: null, homestay_name: null, host_id: null, host_name: null, host_phone: null });
  });

  it("reads the host's name and phone with the homestay, for the admin's nudge", async () => {
    const sc = withRequests({ data: [] });
    await getPendingDateChanges(NOW);
    expect(sc.builderFor("date_change_requests").select).toHaveBeenCalledWith(expect.stringContaining("host:hosts(name, phone)"));
  });

  it("leaves the phone empty for a host who gave none", async () => {
    withRequests({
      data: [{ ...request("x", "2026-11-17T03:00:00Z"), booking: { guest_name: "Nok", homestay: { name: "Cozy", host_id: "h1", host: { name: "Wang", phone: null } } } }],
    });
    const [row] = await getPendingDateChanges(NOW);
    expect(row).toMatchObject({ host_name: "Wang", host_phone: null });
  });
});

describe("countStaleDateChanges", () => {
  it("counts pending requests created before the two-day cutoff", async () => {
    const sc = withRequests({ count: 4 });
    expect(await countStaleDateChanges(NOW)).toBe(4);
    const q = sc.builderFor("date_change_requests");
    expect(q.eq).toHaveBeenCalledWith("status", "pending");
    expect(q.lt).toHaveBeenCalledWith("created_at", "2026-11-16T03:00:00.000Z");
  });
});
