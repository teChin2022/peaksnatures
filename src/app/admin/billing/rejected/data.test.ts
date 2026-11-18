import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type QueryResponse } from "../../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: h.createServiceRoleClient,
}));

import { getRejectedPayments, rejectedKind } from "./data";

const withData = (tables: Record<string, QueryResponse>) => {
  const sc = createSupabaseMock({ tables: { history_logs: { data: [] }, hosts: { data: [] }, ...tables } });
  h.createServiceRoleClient.mockReturnValue(sc);
  return sc;
};

beforeEach(() => h.createServiceRoleClient.mockReset());

describe("rejectedKind", () => {
  // Each refusing route logs a different shape (activate, invoices/[id]/pay, wallet/topup).
  it("tells the three refusing routes apart", () => {
    expect(rejectedKind("inv-1", { host_id: "h1" })).toBe("invoice");
    expect(rejectedKind("h1", { host_id: "h1", term_months: 3 })).toBe("plan_activation");
    expect(rejectedKind("h1", { host_id: "h1" })).toBe("wallet_topup");
  });
});

describe("getRejectedPayments", () => {
  it("reads only rejected-payment events, newest first", async () => {
    const sc = withData({});
    await getRejectedPayments();
    const q = sc.builderFor("history_logs");
    expect(q.eq).toHaveBeenCalledWith("event_type", "PLATFORM_PAYMENT_REJECTED");
    expect(q.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("names the host and carries what an admin needs to settle it", async () => {
    withData({
      history_logs: {
        data: [
          {
            id: "l1",
            entity_id: "inv-1",
            created_at: "2026-11-18T02:00:00Z",
            data: { reason: "AMOUNT_MISMATCH", host_id: "h1", expected_amount: 500, slip_amount: 450, trans_ref: "TX123", slip_path: "x/y.jpg" },
          },
        ],
      },
      hosts: { data: [{ id: "h1", name: "Somchai" }] },
    });
    expect(await getRejectedPayments()).toEqual([
      {
        id: "l1",
        created_at: "2026-11-18T02:00:00Z",
        kind: "invoice",
        host_id: "h1",
        host_name: "Somchai",
        expected_amount: 500,
        slip_amount: 450,
        trans_ref: "TX123",
        reason: "AMOUNT_MISMATCH",
      },
    ]);
  });

  it("skips the host lookup when there is nothing to settle", async () => {
    const sc = withData({});
    expect(await getRejectedPayments()).toEqual([]);
    expect(sc.calls.filter((c) => c.table === "hosts")).toHaveLength(0);
  });

  it("survives an entry with no data", async () => {
    withData({ history_logs: { data: [{ id: "l2", entity_id: "x", created_at: "2026-11-18T02:00:00Z", data: null }] } });
    const [row] = await getRejectedPayments();
    expect(row).toMatchObject({ kind: "wallet_topup", host_id: null, host_name: null, trans_ref: null });
  });
});
