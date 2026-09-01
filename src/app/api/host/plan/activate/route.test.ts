import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { signIn, signOut } from "../../../../../../test/helpers/auth";
import { makeFormRequest, readJson, uniqueIp } from "../../../../../../test/helpers/request";
import { makeBillingConfig } from "../../../../../../test/fixtures/db";
import type { QueryResponse } from "../../../../../../test/helpers/supabase";
import type { EasySlipV2Response } from "@/lib/easyslip";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  callEasySlipV2: vi.fn(),
  getBillingConfig: vi.fn(),
  logEvent: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
// Keep the real pure helpers (hashing, receiver matching); stub only the network call.
vi.mock("@/lib/easyslip", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/easyslip")>()),
  callEasySlipV2: h.callEasySlipV2,
}));
// Keep the real pricing — what this route charges must be what billing.ts says.
vi.mock("@/lib/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing")>()),
  getBillingConfig: () => h.getBillingConfig(),
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

const RECEIVER = "0812345678";
const CONFIG = makeBillingConfig({ fixed_rate_amount: 1500, promptpay_id: RECEIVER });

/** Switching on 20 Aug: 12 of 31 days → 1500 × 12/31 = 581. */
const STUB = 581;
/** 6-month term at the fixture's 10% tier, on top of the stub. */
const SIX_MONTH_TOTAL = STUB + 8100;

const HOST: {
  id: string;
  name: string;
  plan_type: string;
  fixed_rate_override: number | null;
  fixed_rate_term_ends_at: string | null;
} = {
  id: "host-1",
  name: "Peaks Homestay",
  plan_type: "commission",
  fixed_rate_override: null,
  fixed_rate_term_ends_at: null,
};

const slipFile = (name = "slip.jpg", type = "image/jpeg", bytes = 32) =>
  new File([new Uint8Array(bytes)], name, { type });

const noDuplicates = () => ({
  invoices: { data: [] },
  wallet_transactions: { data: [] },
  bookings: { data: [] },
  date_change_requests: { data: [] },
});

const easySlipSuccess = (amount: number, date = new Date().toISOString()): EasySlipV2Response =>
  ({
    success: true,
    message: "ok",
    data: {
      isDuplicate: false,
      matchedAccount: null,
      amountInSlip: amount,
      isAmountMatched: true,
      rawSlip: {
        transRef: "TXN-123",
        date,
        amount: { amount },
        receiver: { account: { proxy: { type: "MSISDN", account: "xxx-xxx-5678" } } },
      },
    },
  }) as unknown as EasySlipV2Response;

function mockClient(host: Partial<typeof HOST> = {}, rpc?: Record<string, QueryResponse>) {
  return signIn(h, {
    tables: { hosts: { data: { ...HOST, ...host } }, ...noDuplicates() },
    rpc: rpc ?? { activate_fixed_rate_plan: { data: [{ invoice_id: "inv-new" }] } },
  });
}

const post = (fields: Record<string, string | File> = {}) =>
  POST(
    makeFormRequest(
      "/api/host/plan/activate",
      { file: slipFile(), term_months: "1", ...fields },
      { ip: uniqueIp() },
    ),
  );

/** The arguments the activation RPC was called with, or null. */
const rpcArgs = (supabase: ReturnType<typeof mockClient>) => {
  const call = (supabase.rpc as ReturnType<typeof vi.fn>).mock.calls[0];
  return call ? (call[1] as Record<string, unknown>) : null;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("EASYSLIP_API_KEY", "easyslip-key");
  h.afterCallbacks.length = 0;
  h.getBillingConfig.mockResolvedValue(CONFIG);
  h.callEasySlipV2.mockImplementation(async (...args: unknown[]) =>
    easySlipSuccess(args[4] as number),
  );
  mockClient();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-20T06:00:00Z"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("POST /api/host/plan/activate", () => {
  describe("the amount is the server's, never the client's", () => {
    // The whole security model of this route. A host who edits the request must
    // still be charged what billing.ts says the plan costs.
    it.each([
      ["1", "a bargain"],
      ["999999", "an overpayment"],
      ["0", "nothing"],
    ])("ignores a client-sent amount of %s (%s)", async (amount) => {
      const supabase = mockClient();
      await post({ amount, term_months: "1" });

      expect(h.callEasySlipV2).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), expect.anything(), expect.anything(), STUB,
      );
      expect(rpcArgs(supabase)).toMatchObject({ p_amount: STUB });
    });

    it("charges the stub plus the discounted term for a prepaid plan", async () => {
      const supabase = mockClient();
      await post({ term_months: "6" });
      expect(rpcArgs(supabase)).toMatchObject({
        p_amount: SIX_MONTH_TOTAL,
        p_term_months: 6,
        p_discount_pct: 10,
        p_period_start: "2026-08-20",
        p_period_end: "2027-02-28",
      });
    });

    it("charges whole months only once Bangkok has rolled into the 1st", async () => {
      // 01:00 on 1 September in Bangkok is 18:00 on 31 August in UTC. Pricing
      // off the UTC clock billed a ฿24 one-day stub for a 31 August the host
      // never bought, on top of the ฿2,250 term.
      vi.setSystemTime(new Date("2026-08-31T18:00:00Z"));
      h.getBillingConfig.mockResolvedValue(
        makeBillingConfig({
          fixed_rate_amount: 750,
          promptpay_id: RECEIVER,
          fixed_rate_term_tiers: [{ months: 3, discount_pct: 0 }],
        }),
      );
      const supabase = mockClient();
      await post({ term_months: "3" });

      expect(rpcArgs(supabase)).toMatchObject({
        p_amount: 2250,
        p_period_start: "2026-09-01",
        p_period_end: "2026-11-30",
      });
    });

    it("refuses a slip that does not match the recomputed amount", async () => {
      h.callEasySlipV2.mockResolvedValue(easySlipSuccess(1));
      const supabase = mockClient();
      const { status, body } = await readJson(await post());
      expect(status).toBe(200);
      expect(body).toMatchObject({ verified: false });
      expect(supabase.rpc).not.toHaveBeenCalled();
    });
  });

  describe("a good activation", () => {
    it("records the invoice and flips the plan in one call", async () => {
      const supabase = mockClient();
      const { status, body } = await readJson(await post({ term_months: "6" }));

      expect(status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        verified: true,
        plan_type: "fixed_rate",
        invoice_id: "inv-new",
        amount: SIX_MONTH_TOTAL,
        period_end: "2027-02-28",
      });
      expect(supabase.rpc).toHaveBeenCalledWith(
        "activate_fixed_rate_plan",
        expect.objectContaining({
          p_host_id: "host-1",
          p_slip_trans_ref: "TXN-123",
          p_created_by: "Peaks Homestay",
        }),
      );
    });

    it("logs the payment and the plan change after the response is sent", async () => {
      await post({ term_months: "6" });
      expect(h.logEvent).not.toHaveBeenCalled();

      for (const cb of h.afterCallbacks) await cb();
      expect(h.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "billing",
          data: expect.objectContaining({ amount: SIX_MONTH_TOTAL, activation: true }),
        }),
      );
      expect(h.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "host",
          data: expect.objectContaining({ from: "commission", to: "fixed_rate", immediate: true }),
        }),
      );
    });
  });

  // Nothing may be persisted unless the slip is good — an abandoned or failed
  // payment must leave no invoice and no plan change behind.
  describe("nothing is written unless the slip verifies", () => {
    const expectNoWrite = async () => {
      const supabase = mockClient();
      await post();
      expect(supabase.rpc).not.toHaveBeenCalled();
      return supabase;
    };

    it("when EasySlip declines the slip", async () => {
      h.callEasySlipV2.mockResolvedValue({
        success: false,
        error: { code: "INVALID", message: "unreadable" },
      } as unknown as EasySlipV2Response);
      await expectNoWrite();
    });

    it("when the slip is too old", async () => {
      h.callEasySlipV2.mockResolvedValue(easySlipSuccess(STUB, "2020-01-01T00:00:00Z"));
      const { body } = await readJson(await post());
      expect(body).toMatchObject({ verified: false });
      await expectNoWrite();
    });

    it("when the money went to someone else", async () => {
      h.getBillingConfig.mockResolvedValue(
        makeBillingConfig({ fixed_rate_amount: 1500, promptpay_id: "0899999999", bank_account_number: null }),
      );
      const { body } = await readJson(await post());
      expect(body).toMatchObject({ verified: false });
      await expectNoWrite();
    });

    it("when the term is not one that is configured", async () => {
      const supabase = mockClient();
      const { status } = await readJson(await post({ term_months: "4" }));
      expect(status).toBe(400);
      // Refused before the metered EasySlip call, not after.
      expect(h.callEasySlipV2).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
    });
  });

  describe("duplicate slips", () => {
    it.each(["invoices", "wallet_transactions", "bookings", "date_change_requests"])(
      "rejects a slip already recorded in %s",
      async (table) => {
        const supabase = signIn(h, {
          tables: {
            hosts: { data: HOST },
            ...noDuplicates(),
            [table]: { data: [{ id: "existing" }] },
          },
        });
        const { status, body } = await readJson(await post());
        expect(status).toBe(409);
        expect(body).toMatchObject({ duplicate: true });
        expect(supabase.rpc).not.toHaveBeenCalled();
      },
    );

    // Two requests can clear the hash check at once; the unique index on
    // invoices.slip_trans_ref is what actually stops the second one.
    it("maps the unique-index violation to a 409, not a 500", async () => {
      mockClient({}, {
        activate_fixed_rate_plan: {
          error: { message: 'duplicate key value violates unique constraint "idx_invoices_slip_trans_ref"' },
        },
      });
      await expect(readJson(await post()))
        .resolves.toMatchObject({ status: 409, body: { duplicate: true } });
    });

    it("still reports an unrelated RPC failure as a 500", async () => {
      mockClient({}, { activate_fixed_rate_plan: { error: { message: "HOST_NOT_FOUND" } } });
      await expect(readJson(await post())).resolves.toMatchObject({ status: 500 });
    });
  });

  describe("guards", () => {
    it("turns away a signed-out caller", async () => {
      signOut(h);
      await expect(readJson(await post()))
        .resolves.toEqual({ status: 401, body: { error: "Unauthorized" } });
    });

    // The quote and the payment are minutes apart; an admin may have moved the
    // host in between, and a mid-term host must not be double-charged.
    it("refuses a host already mid-term on Fixed Rate", async () => {
      const supabase = mockClient({ plan_type: "fixed_rate", fixed_rate_term_ends_at: "2027-02-28" });
      const { status } = await readJson(await post());
      expect(status).toBe(400);
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("lets a host whose term has already ended pay for a new one", async () => {
      mockClient({ plan_type: "fixed_rate", fixed_rate_term_ends_at: "2026-07-31" });
      await expect(readJson(await post())).resolves.toMatchObject({ status: 200 });
    });

    it("rejects a file that is not an image", async () => {
      await expect(readJson(await post({ file: slipFile("x.pdf", "application/pdf") })))
        .resolves.toEqual({ status: 400, body: { error: "Invalid file" } });
    });

    it("refuses when slip verification is not configured", async () => {
      vi.stubEnv("EASYSLIP_API_KEY", "");
      await expect(readJson(await post())).resolves.toMatchObject({ status: 503 });
    });
  });

  describe("rate limiting", () => {
    // Every call reaches the metered EasySlip API before any DB write.
    it("cuts off a burst from one address", async () => {
      const ip = uniqueIp();
      const fire = () =>
        POST(makeFormRequest(
          "/api/host/plan/activate",
          { file: slipFile(), term_months: "1" },
          { ip },
        ));

      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) statuses.push((await fire()).status);

      expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
      expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    });
  });
});
