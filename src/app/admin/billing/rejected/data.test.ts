import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type QueryResponse } from "../../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: h.createServiceRoleClient,
}));

import { countUnsettledRejected, getRejectedPayments, rejectedKind } from "./data";

const withData = (tables: Record<string, QueryResponse>) => {
  const sc = createSupabaseMock({
    tables: { history_logs: { data: [] }, hosts: { data: [] }, platform_payment_settlements: { data: [] }, ...tables },
  });
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
            data: { reason: "AMOUNT_MISMATCH", host_id: "h1", expected_amount: 500, slip_amount: 450, trans_ref: "TX123", slip_path: "../secret/y.jpg" },
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
        slip_url: null,
        settlement: null,
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

describe("settlements", () => {
  const entry = (id: string) => ({ id, entity_id: "h1", created_at: "2026-11-18T02:00:00Z", data: { host_id: "h1" } });

  it("attaches who settled each payment", async () => {
    withData({
      history_logs: { data: [entry("l1"), entry("l2")] },
      platform_payment_settlements: {
        data: [{ history_log_id: "l1", settled_by_name: "Root", note: "Topped up", created_at: "2026-11-18T05:00:00Z" }],
      },
    });
    const [first, second] = await getRejectedPayments();
    expect(first.settlement).toEqual({ settled_at: "2026-11-18T05:00:00Z", settled_by_name: "Root", note: "Topped up" });
    expect(second.settlement).toBeNull();
  });

  it("counts only payments nobody has settled", async () => {
    const sc = withData({
      history_logs: { data: [{ id: "l1" }, { id: "l2" }, { id: "l3" }] },
      platform_payment_settlements: {
        data: [{ history_log_id: "l2", settled_by_name: "Root", note: null, created_at: "2026-11-18T05:00:00Z" }],
      },
    });
    expect(await countUnsettledRejected("2026-10-19T00:00:00.000Z")).toBe(2);
    expect(sc.builderFor("history_logs").gte).toHaveBeenCalledWith("created_at", "2026-10-19T00:00:00.000Z");
    expect(sc.builderFor("platform_payment_settlements").in).toHaveBeenCalledWith("history_log_id", ["l1", "l2", "l3"]);
  });

  it("counts zero without reading settlements when nothing was rejected", async () => {
    const sc = withData({});
    expect(await countUnsettledRejected("2026-10-19T00:00:00.000Z")).toBe(0);
    expect(sc.calls.filter((c) => c.table === "platform_payment_settlements")).toHaveLength(0);
  });
});

describe("slip links", () => {
  const entry = (id: string, slip_path: string) => ({
    id,
    entity_id: "h1",
    created_at: "2026-11-18T02:00:00Z",
    data: { host_id: "h1", slip_path },
  });

  it("signs a short-lived link for slips the refusing routes uploaded", async () => {
    const sc = withData({ history_logs: { data: [entry("l1", "wallet/h1/a.jpg"), entry("l2", "invoices/h1/i.png")] } });
    const rows = await getRejectedPayments();
    expect(rows.map((r) => r.slip_url)).toEqual(["https://storage.test/signed-slip", "https://storage.test/signed-slip"]);
    expect(sc.storage.from).toHaveBeenCalledWith("payment-slips");
    expect(sc.storage.createSignedUrls).toHaveBeenCalledWith(["wallet/h1/a.jpg", "invoices/h1/i.png"], 600);
  });

  // Defence in depth: the path comes from a log row, so only the known folders are signed.
  it("never signs a path outside the payment folders", async () => {
    const sc = withData({ history_logs: { data: [entry("l1", "sessions/x/a.jpg"), entry("l2", "wallet/../sessions/a.jpg")] } });
    const rows = await getRejectedPayments();
    expect(rows.map((r) => r.slip_url)).toEqual([null, null]);
    expect(sc.storage.createSignedUrls).not.toHaveBeenCalled();
  });
});
