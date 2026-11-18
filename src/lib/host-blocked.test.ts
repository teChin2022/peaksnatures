import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../../test/helpers/supabase";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(), createServiceRoleClient: vi.fn() }));

import { blockedHostIds } from "./host-blocked";

const base = { plan_free_expires_at: null, wallet_balance: 0, wallet_credit_limit: 0, wallet_negative_since: null };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T03:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("blockedHostIds", () => {
  it("applies the booking gate to each plan", async () => {
    const sc = createSupabaseMock({ tables: { invoices: { data: [{ host_id: "fixed-owing" }] } } });
    const ids = await blockedHostIds(
      [
        { ...base, id: "free-ok", plan_type: "free", plan_free_expires_at: "2026-12-01T00:00:00Z" },
        // Expired 1 Nov: past the 6-day grace.
        { ...base, id: "free-expired", plan_type: "free", plan_free_expires_at: "2026-11-01T00:00:00Z" },
        { ...base, id: "fixed-owing", plan_type: "fixed_rate" },
        { ...base, id: "fixed-paid", plan_type: "fixed_rate" },
        // Negative for 20 days and below the credit limit.
        { ...base, id: "wallet-neg", plan_type: "commission", wallet_balance: -50, wallet_negative_since: "2026-10-29T00:00:00Z" },
        { ...base, id: "wallet-ok", plan_type: "commission", wallet_balance: 120 },
      ],
      sc as never,
    );
    expect([...ids].sort()).toEqual(["fixed-owing", "free-expired", "wallet-neg"]);
  });

  it("only asks about invoices for Fixed Rate hosts", async () => {
    const sc = createSupabaseMock({ tables: { invoices: { data: [] } } });
    await blockedHostIds(
      [
        { ...base, id: "a", plan_type: "fixed_rate" },
        { ...base, id: "b", plan_type: "commission" },
      ],
      sc as never,
    );
    expect(sc.builderFor("invoices").in).toHaveBeenCalledWith("host_id", ["a"]);
  });
});
