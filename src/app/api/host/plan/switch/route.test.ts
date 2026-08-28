import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { signIn, signOut } from "../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../test/helpers/request";
import { makeBillingConfig } from "../../../../../../test/fixtures/db";
import { LOW_WALLET_THRESHOLD } from "@/lib/billing";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  logEvent: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: h.logEvent,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    h.afterCallbacks.push(cb);
  },
}));

// The real billing module, with only the config read stubbed — the pricing this
// route returns to the host is exactly what production computes.
const getBillingConfig = vi.fn();
vi.mock("@/lib/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing")>()),
  getBillingConfig: () => getBillingConfig(),
}));

const CONFIG = makeBillingConfig({ fixed_rate_amount: 1500 });

const baseHost: {
  id: string;
  name: string;
  plan_type: string;
  plan_free_expires_at: string | null;
  fixed_rate_override: number | null;
  fixed_rate_term_months: number | null;
  fixed_rate_term_ends_at: string | null;
  plan_pending_type: string | null;
  wallet_balance: number | null;
} = {
  id: "host-1",
  name: "Peaks Homestay",
  plan_type: "commission",
  plan_free_expires_at: null,
  fixed_rate_override: null,
  fixed_rate_term_months: null,
  fixed_rate_term_ends_at: null,
  plan_pending_type: null,
  wallet_balance: 5000,
};

type HostRow = Partial<typeof baseHost>;

function mockClient(host: HostRow = {}, extra: Record<string, unknown> = {}) {
  return signIn(h, {
    tables: {
      hosts: { data: { ...baseHost, ...host } },
      invoices: { data: [] },
      ...extra,
    },
  });
}

const post = (body: Record<string, unknown>) =>
  POST(makeRequest("/api/host/plan/switch", { body }));

/**
 * The `.update()` payload written to `hosts`, or null if none was. The route
 * reads `hosts` before it writes, so this scans every builder rather than
 * assuming which `.from("hosts")` call did the writing.
 */
const hostUpdate = (supabase: ReturnType<typeof mockClient>) => {
  for (const { table, builder } of supabase.calls) {
    if (table !== "hosts") continue;
    const update = builder.update as ReturnType<typeof vi.fn>;
    if (update.mock.calls.length) return update.mock.calls[0][0] as Record<string, unknown>;
  }
  return null;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  getBillingConfig.mockResolvedValue(CONFIG);
  mockClient();
  vi.useFakeTimers();
  // 20 Aug: 12 of 31 days left, so every quote below is prorated.
  vi.setSystemTime(new Date("2026-08-20T06:00:00Z"));
  return () => vi.useRealTimers();
});

describe("POST /api/host/plan/switch", () => {
  describe("starting Fixed Rate", () => {
    it("quotes the prorated rest of the month for a monthly plan", async () => {
      const { status, body } = await readJson(
        await post({ plan_type: "fixed_rate", term_months: 1 }),
      );
      expect(status).toBe(402);
      expect(body).toMatchObject({
        error: "PAYMENT_REQUIRED",
        plan_type: "fixed_rate",
        amount: 581,
        stub_amount: 581,
        term_amount: 0,
        period_start: "2026-08-20",
        period_end: "2026-08-31",
        term_months: 1,
        prorated_days: 12,
      });
    });

    it("quotes the stub plus the discounted term for a prepaid plan", async () => {
      const { body } = await readJson(await post({ plan_type: "fixed_rate", term_months: 6 }));
      expect(body).toMatchObject({
        error: "PAYMENT_REQUIRED",
        amount: 8681, // 581 + 1500 × 6 × 0.90
        stub_amount: 581,
        term_amount: 8100,
        period_end: "2027-02-28",
        discount_pct: 10,
      });
    });

    // The quote is a price tag, not a commitment. If it wrote anything, an
    // abandoned payment would leave a host owing money for a plan they never got.
    it("writes nothing at all", async () => {
      const supabase = mockClient();
      await post({ plan_type: "fixed_rate", term_months: 6 });
      expect(hostUpdate(supabase)).toBeNull();
      expect(supabase.builderFor("hosts").insert).not.toHaveBeenCalled();
      expect(supabase.calls.map((c) => c.table)).not.toContain("invoices");
      expect(h.afterCallbacks).toHaveLength(0);
    });

    it("quotes a free host on the same terms as a commission host", async () => {
      mockClient({ plan_type: "free", plan_free_expires_at: "2026-08-01T00:00:00Z" });
      const { status, body } = await readJson(
        await post({ plan_type: "fixed_rate", term_months: 1 }),
      );
      expect(status).toBe(402);
      expect(body).toMatchObject({ error: "PAYMENT_REQUIRED", amount: 581 });
    });

    it("refuses a term that is not configured", async () => {
      await expect(readJson(await post({ plan_type: "fixed_rate", term_months: 4 })))
        .resolves.toMatchObject({ status: 400 });
    });
  });

  describe("switching to Commission", () => {
    it("applies immediately and clears the Fixed Rate term", async () => {
      const supabase = mockClient({
        plan_type: "fixed_rate",
        fixed_rate_term_months: 6,
        fixed_rate_term_ends_at: "2027-02-28",
      });
      const { status, body } = await readJson(await post({ plan_type: "commission" }));

      expect(status).toBe(200);
      expect(body).toMatchObject({ plan_type: "commission", applied_immediately: true });
      expect(hostUpdate(supabase)).toMatchObject({
        plan_type: "commission",
        fixed_rate_term_months: null,
        fixed_rate_term_started_at: null,
        fixed_rate_term_ends_at: null,
        plan_pending_type: null,
        plan_free_expires_at: null,
      });
    });

    it("records the forfeited days, which the host row no longer remembers", async () => {
      mockClient({
        plan_type: "fixed_rate",
        fixed_rate_term_months: 6,
        fixed_rate_term_ends_at: "2026-08-31",
      });
      const { body } = await readJson(await post({ plan_type: "commission" }));
      expect(body).toMatchObject({ forfeited_days: 12 }); // 20–31 Aug inclusive

      for (const cb of h.afterCallbacks) await cb();
      expect(h.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            from: "fixed_rate",
            to: "commission",
            immediate: true,
            forfeited_days: 12,
            forfeited_term_ends_at: "2026-08-31",
          }),
        }),
      );
    });

    it("reports no forfeiture when there was no term to lose", async () => {
      const { body } = await readJson(await post({ plan_type: "commission" })) as {
        body: Record<string, unknown>;
      };
      // A free host leaves nothing behind.
      expect(body).not.toHaveProperty("forfeited_days");
    });

    describe("the wallet gate", () => {
      it.each([0, 1, LOW_WALLET_THRESHOLD - 1])("blocks a ฿%i wallet", async (balance) => {
        const supabase = mockClient({ plan_type: "free", wallet_balance: balance });
        const { status, body } = await readJson(await post({ plan_type: "commission" }));
        expect(status).toBe(402);
        expect(body).toMatchObject({
          error: "WALLET_LOW",
          wallet_balance: balance,
          required: LOW_WALLET_THRESHOLD,
        });
        expect(hostUpdate(supabase)).toBeNull();
      });

      it.each([LOW_WALLET_THRESHOLD, LOW_WALLET_THRESHOLD + 1])(
        "lets a ฿%i wallet through",
        async (balance) => {
          mockClient({ plan_type: "free", wallet_balance: balance });
          const { status } = await readJson(await post({ plan_type: "commission" }));
          expect(status).toBe(200);
        },
      );

      it("treats a null balance as empty", async () => {
        mockClient({ plan_type: "free", wallet_balance: null });
        const { body } = await readJson(await post({ plan_type: "commission" }));
        expect(body).toMatchObject({ error: "WALLET_LOW", wallet_balance: 0 });
      });
    });

    // A fixed-rate host must not be able to walk away from a bill by switching
    // plans, and is told to pay it rather than to top up — the debt is the
    // blocker, not the wallet.
    it("demands the unpaid invoice before the wallet", async () => {
      const supabase = mockClient(
        { plan_type: "fixed_rate", wallet_balance: 0 },
        { invoices: { data: [{ id: "inv-1", amount: 1500, due_date: "2026-08-05" }] } },
      );
      const { status, body } = await readJson(await post({ plan_type: "commission" }));
      expect(status).toBe(402);
      expect(body).toMatchObject({ error: "UNPAID_INVOICE", invoice_id: "inv-1", amount: 1500 });
      expect(hostUpdate(supabase)).toBeNull();
    });
  });

  // A renewal is not a plan change: the host stays on Fixed Rate and the new
  // term picks up where the paid one ends, so it must NOT become immediate.
  describe("renewing Fixed Rate", () => {
    it("still schedules for the day after the current term ends", async () => {
      const supabase = mockClient({
        plan_type: "fixed_rate",
        fixed_rate_term_months: 6,
        fixed_rate_term_ends_at: "2027-02-28",
      });
      const { status, body } = await readJson(
        await post({ plan_type: "fixed_rate", term_months: 12 }),
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({
        plan_pending_type: "fixed_rate",
        plan_pending_effective_at: "2027-03-01",
        plan_pending_term_months: 12,
      });
      expect(hostUpdate(supabase)).toMatchObject({
        plan_pending_type: "fixed_rate",
        plan_pending_effective_at: "2027-03-01",
      });
      // Crucially, the live plan and term are untouched.
      expect(hostUpdate(supabase)).not.toHaveProperty("plan_type");
    });

    it("refuses to renew when there is no term to renew", async () => {
      mockClient({ plan_type: "fixed_rate", fixed_rate_term_ends_at: null });
      await expect(readJson(await post({ plan_type: "fixed_rate", term_months: 6 })))
        .resolves.toMatchObject({ status: 400 });
    });
  });

  describe("guards", () => {
    it("turns away a signed-out caller", async () => {
      signOut(h);
      await expect(readJson(await post({ plan_type: "commission" })))
        .resolves.toEqual({ status: 401, body: { error: "Unauthorized" } });
    });

    it("rejects a plan type a host may not self-select", async () => {
      await expect(readJson(await post({ plan_type: "free" })))
        .resolves.toMatchObject({ status: 400 });
    });

    it("rejects switching to the plan already in use", async () => {
      await expect(readJson(await post({ plan_type: "commission" })))
        .resolves.toEqual({ status: 400, body: { error: "Already on this plan" } });
    });

    it("refuses while another switch is pending", async () => {
      mockClient({ plan_type: "free", plan_pending_type: "fixed_rate" });
      await expect(readJson(await post({ plan_type: "commission" })))
        .resolves.toMatchObject({ status: 400 });
    });
  });
});
