import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type QueryResponse } from "../../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: h.createServiceRoleClient,
}));

import { getAdminHostDetail } from "./data";

const HOST_ID = "11111111-1111-4111-8111-111111111111";
const host = {
  id: HOST_ID,
  user_id: "user-1",
  name: "Somchai",
  email: "somchai@example.com",
  phone: null,
  status: "approved",
  is_verified: true,
  created_at: "2026-01-01T00:00:00Z",
  commission_pct_override: null,
  quick_commission_pct_override: null,
  fixed_rate_override: null,
  fixed_rate_term_months: null,
  fixed_rate_term_ends_at: null,
  plan_type: "commission",
  plan_free_expires_at: null,
  wallet_balance: 120,
  wallet_credit_limit: 0,
  wallet_negative_since: null,
};
const invoice = { id: "inv-1", amount: 500, period_start: "2026-11-01", period_end: "2026-11-30", status: "pending", due_date: "2026-11-05", paid_at: null, term_months: 1 };
const log = (id: string, created_at: string) => ({ id, event_type: "X", actor_type: "host", created_at });

const withData = (tables: Record<string, QueryResponse | QueryResponse[]>) => {
  const sc = createSupabaseMock({
    tables: {
      hosts: { data: host },
      homestays: { data: [{ id: "hs-1", name: "Cozy", slug: "cozy", is_active: true }] },
      host_staff: { data: [] },
      wallet_transactions: { data: [] },
      invoices: [{ data: [invoice] }, { data: [] }],
      bookings: { data: [] },
      history_logs: [{ data: [] }, { data: [] }],
      ...tables,
    },
  });
  h.createServiceRoleClient.mockReturnValue(sc);
  return sc;
};

beforeEach(() => {
  h.createServiceRoleClient.mockReset();
});

describe("getAdminHostDetail", () => {
  it("returns null for a malformed id without querying", async () => {
    const sc = withData({});
    expect(await getAdminHostDetail("1 or 1=1")).toBeNull();
    expect(sc.from).not.toHaveBeenCalled();
  });

  it("returns null for an unknown host", async () => {
    withData({ hosts: { data: null } });
    expect(await getAdminHostDetail(HOST_ID)).toBeNull();
  });

  it("reads bookings and homestay activity for the host's homestays", async () => {
    const sc = withData({});
    await getAdminHostDetail(HOST_ID);
    expect(sc.builderFor("bookings").in).toHaveBeenCalledWith("homestay_id", ["hs-1"]);
    expect(sc.builderFor("history_logs", 1).in).toHaveBeenCalledWith("homestay_id", ["hs-1"]);
  });

  it("finds host events under every id they are logged by", async () => {
    const sc = withData({});
    await getAdminHostDetail(HOST_ID);
    expect(sc.builderFor("history_logs", 0).in).toHaveBeenCalledWith("entity_id", [
      HOST_ID,
      "user-1",
      "somchai@example.com",
      "inv-1",
    ]);
  });

  it("merges both activity reads newest first, without duplicates", async () => {
    withData({
      history_logs: [
        { data: [log("a", "2026-11-03T00:00:00Z"), log("b", "2026-11-01T00:00:00Z")] },
        { data: [log("b", "2026-11-01T00:00:00Z"), log("c", "2026-11-02T00:00:00Z")] },
      ],
    });
    const detail = await getAdminHostDetail(HOST_ID);
    expect(detail?.logs.map((l) => l.id)).toEqual(["a", "c", "b"]);
  });

  it("skips the homestay reads when the host has none", async () => {
    const sc = withData({ homestays: { data: [] } });
    const detail = await getAdminHostDetail(HOST_ID);
    expect(detail?.bookings).toEqual([]);
    expect(sc.calls.filter((c) => c.table === "bookings")).toHaveLength(0);
    expect(sc.calls.filter((c) => c.table === "history_logs")).toHaveLength(1);
  });

  // Same gate as the booking routes: a fixed-rate host with a blocking invoice.
  it("marks a fixed-rate host with a past-due invoice as blocked", async () => {
    withData({
      hosts: { data: { ...host, plan_type: "fixed_rate" } },
      invoices: [{ data: [invoice] }, { data: [{ id: "inv-1" }] }],
    });
    expect((await getAdminHostDetail(HOST_ID))?.blocked).toBe(true);
  });

  it("does not mark a paid-up host as blocked", async () => {
    withData({ hosts: { data: { ...host, plan_type: "fixed_rate" } } });
    expect((await getAdminHostDetail(HOST_ID))?.blocked).toBe(false);
  });
});

