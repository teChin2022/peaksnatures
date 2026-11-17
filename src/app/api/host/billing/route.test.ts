import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { signIn, signOut } from "../../../../../test/helpers/auth";
import { readJson } from "../../../../../test/helpers/request";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock("@/lib/billing", () => ({
  getBillingConfig: vi.fn().mockResolvedValue(null),
  getEffectiveCommissionPct: vi.fn(),
  getEffectiveFixedRate: vi.fn(),
}));

const host = (over: Record<string, unknown> = {}) => ({
  id: "host-1", plan_type: "commission", plan_free_expires_at: null, plan_pending_type: null,
  plan_pending_effective_at: null, plan_pending_term_months: null, wallet_balance: -400,
  commission_pct_override: null, quick_commission_pct_override: null, fixed_rate_override: null,
  fixed_rate_term_months: null, fixed_rate_term_started_at: null, fixed_rate_term_ends_at: null,
  wallet_negative_since: "2026-11-10T03:00:00Z", ...over,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/host/billing", () => {
  // The wallet page shows the day a negative balance may start blocking bookings.
  it("returns when the wallet went negative", async () => {
    signIn(mocks, { tables: { hosts: { data: host() }, wallet_transactions: { data: [] } } });
    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect(body).toMatchObject({ wallet_balance: -400, wallet_negative_since: "2026-11-10T03:00:00Z" });
  });

  it("returns null when the wallet is not negative", async () => {
    signIn(mocks, { tables: { hosts: { data: host({ wallet_balance: 200, wallet_negative_since: null }) }, wallet_transactions: { data: [] } } });
    const { body } = await readJson(await GET());
    expect(body).toMatchObject({ wallet_negative_since: null });
  });

  it("refuses a caller who is not signed in", async () => {
    signOut(mocks);
    expect((await GET()).status).toBe(401);
  });

  it("answers 404 for a login with no host row", async () => {
    signIn(mocks, { tables: { hosts: { data: null, error: { message: "no rows" } } } });
    expect((await GET()).status).toBe(404);
  });
});
