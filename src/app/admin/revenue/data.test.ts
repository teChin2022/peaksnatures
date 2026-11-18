import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type QueryResponse } from "../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: h.createServiceRoleClient,
}));

import { getPlatformRevenue, monthLabel, revenueMonthKeys } from "./data";

// 2026-11-18 10:00 Bangkok
const NOW = new Date("2026-11-18T03:00:00Z");

const withData = (tables: Record<string, QueryResponse | QueryResponse[]>) => {
  const sc = createSupabaseMock({
    tables: {
      wallet_transactions: { data: [] },
      invoices: [{ data: [] }, { data: [] }],
      hosts: { data: [] },
      ...tables,
    },
  });
  h.createServiceRoleClient.mockReturnValue(sc);
  return sc;
};
const tx = (type: string, amount: number, created_at: string) => ({ id: `${type}-${created_at}`, type, amount, created_at });
const month = async (key: string) => (await getPlatformRevenue(NOW)).months.find((m) => m.month === key)!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("revenueMonthKeys", () => {
  it("ends with the current Bangkok month and spans 12", () => {
    const keys = revenueMonthKeys(NOW);
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe("2025-12");
    expect(keys.at(-1)).toBe("2026-11");
  });

  // 1 Dec 00:30 Bangkok is still 30 Nov in UTC.
  it("uses the Bangkok month, not the UTC one", () => {
    expect(revenueMonthKeys(new Date("2026-11-30T17:30:00Z")).at(-1)).toBe("2026-12");
  });
});

describe("getPlatformRevenue", () => {
  it("nets commission against refunds and adds paid Fixed Rate invoices", async () => {
    withData({
      wallet_transactions: {
        data: [
          tx("commission", -30, "2026-11-02T03:00:00Z"),
          tx("commission", -20, "2026-11-03T03:00:00Z"),
          tx("refund", 10, "2026-11-04T03:00:00Z"),
          tx("adjustment", 500, "2026-11-05T03:00:00Z"),
        ],
      },
      invoices: [{ data: [{ id: "i1", amount: 1500, paid_at: "2026-11-01T02:00:00Z" }] }, { data: [] }],
    });
    expect(await month("2026-11")).toEqual({
      month: "2026-11",
      commission: 50,
      refunds: 10,
      fixedRate: 1500,
      adjustments: 500,
      income: 1540,
    });
  });

  // 31 Oct 18:00 UTC is 1 Nov 01:00 in Bangkok.
  it("files a charge under its Bangkok month", async () => {
    withData({ wallet_transactions: { data: [tx("commission", -7, "2026-10-31T18:00:00Z")] } });
    const revenue = await getPlatformRevenue(NOW);
    expect(revenue.months.find((m) => m.month === "2026-11")!.commission).toBe(7);
    expect(revenue.months.find((m) => m.month === "2026-10")!.commission).toBe(0);
  });

  it("reads past the 1000-row page limit", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => tx("commission", -1, `2026-11-0${(i % 9) + 1}T03:00:00Z`));
    const sc = withData({
      wallet_transactions: [{ data: page }, { data: [tx("commission", -1, "2026-11-10T03:00:00Z")] }],
    });
    expect((await month("2026-11")).commission).toBe(1001);
    expect(sc.builderFor("wallet_transactions", 1).range).toHaveBeenCalledWith(1000, 1999);
  });

  it("splits wallets into money held and money owed, and totals unpaid invoices", async () => {
    withData({
      hosts: { data: [{ id: "a", wallet_balance: 400 }, { id: "b", wallet_balance: -120 }, { id: "c", wallet_balance: null }] },
      invoices: [{ data: [] }, { data: [{ id: "i2", amount: 31 }, { id: "i3", amount: 100 }] }],
    });
    const revenue = await getPlatformRevenue(NOW);
    expect(revenue.walletHeld).toBe(400);
    expect(revenue.walletOwed).toBe(120);
    expect(revenue.unpaidInvoices).toBe(131);
  });

  it("only counts verified commission, refund and adjustment rows from the window", async () => {
    const sc = withData({});
    await getPlatformRevenue(NOW);
    const q = sc.builderFor("wallet_transactions");
    expect(q.in).toHaveBeenCalledWith("type", ["commission", "refund", "adjustment"]);
    expect(q.eq).toHaveBeenCalledWith("status", "verified");
    // Midnight Bangkok on 1 Dec 2025.
    expect(q.gte).toHaveBeenCalledWith("created_at", "2025-11-30T17:00:00.000Z");
  });
});

describe("monthLabel", () => {
  it("reads a month key", () => {
    expect(monthLabel("2026-11")).toBe("Nov 2026");
  });
});
