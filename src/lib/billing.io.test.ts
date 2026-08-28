import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deductCommission,
  enqueueBillingRetry,
  fetchPastDueHostIds,
  getBillingConfig,
  getHostBlockState,
  hasPastDueInvoice,
  processBillingRetryQueue,
  refundCommission,
} from "@/lib/billing";
import { createSupabaseMock, type SupabaseMockOptions } from "../../test/helpers/supabase";
import { makeBillingConfig } from "../../test/fixtures/db";

const { createServiceRoleClient, logEvent, sendSms, resendSend } = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  logEvent: vi.fn(),
  sendSms: vi.fn(),
  resendSend: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient }));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent,
}));
vi.mock("@/lib/notifications", () => ({ sendSms }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

/** One client shared by every createServiceRoleClient() call, so table queues stay ordered. */
function mockClient(tables: SupabaseMockOptions["tables"], rpc: SupabaseMockOptions["rpc"] = {}) {
  const supabase = createSupabaseMock({ tables, rpc });
  createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const COMMISSION_HOST = {
  id: "host-1",
  plan_type: "commission",
  commission_pct_override: null,
  wallet_balance: 1000,
  wallet_credit_limit: 0,
  name: "Somchai",
  email: "host@peaksnature.com",
  phone: "0812345678",
  notification_preference: "sms",
  line_channel_access_token: null,
  line_user_id: null,
};

/** The happy-path table script for deductCommission. */
const deductTables = (over: {
  booking?: unknown;
  host?: unknown;
  counts?: [number, number];
  config?: unknown;
} = {}) => ({
  bookings: { data: over.booking ?? { id: "booking-1", total_price: 2000, discount_amount: 0, commission_base: null, homestay_id: "homestay-1" } },
  homestays: { data: { host_id: "host-1" } },
  hosts: { data: over.host ?? COMMISSION_HOST },
  platform_billing_config: { data: over.config ?? makeBillingConfig({ commission_pct: 10 }) },
  wallet_transactions: [{ count: over.counts?.[0] ?? 0 }, { count: over.counts?.[1] ?? 0 }],
  history_logs: {},
  billing_retry_queue: {},
});

const deductOk = { data: [{ new_balance: 800 }], error: null };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("RESEND_API_KEY", "resend-key");
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true } as Response)));
  sendSms.mockResolvedValue({ success: true });
  resendSend.mockResolvedValue({ id: "email-1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("getBillingConfig", () => {
  it("returns the singleton config row", async () => {
    const config = makeBillingConfig();
    mockClient({ platform_billing_config: { data: config } });
    await expect(getBillingConfig()).resolves.toEqual(config);
  });

  it("returns null and logs when the config cannot be read", async () => {
    mockClient({ platform_billing_config: { data: null, error: { message: "no row" } } });
    await expect(getBillingConfig()).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("fetchPastDueHostIds", () => {
  it("returns the hosts among the given ids that have a blocking invoice", async () => {
    mockClient({ invoices: { data: [{ host_id: "host-1" }, { host_id: "host-3" }] } });
    await expect(fetchPastDueHostIds(["host-1", "host-2", "host-3"])).resolves.toEqual(
      new Set(["host-1", "host-3"]),
    );
  });

  it("short-circuits on an empty list without querying", async () => {
    const supabase = mockClient({ invoices: { data: [] } });
    await expect(fetchPastDueHostIds([])).resolves.toEqual(new Set());
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns an empty set when nothing is past due", async () => {
    mockClient({ invoices: { data: null } });
    await expect(fetchPastDueHostIds(["host-1"])).resolves.toEqual(new Set());
  });

  it("filters on the blocking-invoice condition", async () => {
    const supabase = mockClient({ invoices: { data: [] } });
    await fetchPastDueHostIds(["host-1"]);
    expect(supabase.builderFor("invoices").or).toHaveBeenCalledWith(
      expect.stringContaining("status.eq.overdue"),
    );
  });
});

describe("hasPastDueInvoice", () => {
  it("is true when at least one blocking invoice exists", async () => {
    mockClient({ invoices: { data: [{ id: "inv-1" }] } });
    await expect(hasPastDueInvoice("host-1")).resolves.toBe(true);
  });

  it("is false when there are none", async () => {
    mockClient({ invoices: { data: [] } });
    await expect(hasPastDueInvoice("host-1")).resolves.toBe(false);
  });

  it("is false when the query returns nothing at all", async () => {
    mockClient({ invoices: { data: null } });
    await expect(hasPastDueInvoice("host-1")).resolves.toBe(false);
  });
});

describe("getHostBlockState", () => {
  it("returns null for a host that does not exist", async () => {
    mockClient({ hosts: { data: null } });
    await expect(getHostBlockState("ghost")).resolves.toBeNull();
  });

  it("reads the wallet state for a commission host without touching invoices", async () => {
    const supabase = mockClient({
      hosts: {
        data: {
          plan_type: "commission",
          plan_free_expires_at: null,
          wallet_balance: -250,
          wallet_credit_limit: 500,
          wallet_negative_since: "2026-06-01T00:00:00Z",
        },
      },
    });

    await expect(getHostBlockState("host-1")).resolves.toEqual({
      plan_type: "commission",
      plan_free_expires_at: null,
      wallet_balance: -250,
      wallet_credit_limit: 500,
      wallet_negative_since: "2026-06-01T00:00:00Z",
      has_past_due_invoice: false,
    });
    expect(supabase.calls.map((c) => c.table)).not.toContain("invoices");
  });

  it("checks invoices for a fixed-rate host", async () => {
    mockClient({
      hosts: {
        data: {
          plan_type: "fixed_rate",
          plan_free_expires_at: null,
          wallet_balance: 0,
          wallet_credit_limit: null,
          wallet_negative_since: null,
        },
      },
      invoices: { data: [{ id: "inv-1" }] },
    });

    await expect(getHostBlockState("host-1")).resolves.toMatchObject({ has_past_due_invoice: true });
  });

  it("defaults a null wallet balance to zero", async () => {
    mockClient({
      hosts: {
        data: {
          plan_type: "commission",
          plan_free_expires_at: null,
          wallet_balance: null,
          wallet_credit_limit: null,
          wallet_negative_since: null,
        },
      },
    });
    await expect(getHostBlockState("host-1")).resolves.toMatchObject({ wallet_balance: 0 });
  });
});

describe("deductCommission", () => {
  it("charges the configured percentage and records the transaction", async () => {
    const supabase = mockClient(deductTables(), { deduct_wallet_commission: deductOk });

    await deductCommission("booking-1");

    expect(supabase.rpc).toHaveBeenCalledWith("deduct_wallet_commission", {
      p_host_id: "host-1",
      p_amount: 200, // 10% of 2000
      p_booking_id: "booking-1",
      p_description: expect.stringContaining("Commission 10%"),
    });
  });

  it("logs the deduction with its full basis", async () => {
    mockClient(deductTables(), { deduct_wallet_commission: deductOk });

    await deductCommission("booking-1");

    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "billing",
        entityId: "booking-1",
        actorType: "system",
        data: expect.objectContaining({
          commission_base: 2000,
          commission_pct: 10,
          commission_amount: 200,
          new_balance: 800,
        }),
      }),
    );
  });

  describe("the commission base", () => {
    it("is the pre-discount subtotal, so a host promo cannot shrink the platform cut", async () => {
      const supabase = mockClient(
        deductTables({
          booking: { id: "b", total_price: 1800, discount_amount: 200, commission_base: null, homestay_id: "homestay-1" },
        }),
        { deduct_wallet_commission: deductOk },
      );

      await deductCommission("booking-1");

      // 10% of (1800 + 200), not of 1800.
      expect(supabase.rpc).toHaveBeenCalledWith("deduct_wallet_commission", expect.objectContaining({ p_amount: 200 }));
    });

    it("prefers the booking's stored commission_base when set", async () => {
      const supabase = mockClient(
        deductTables({
          booking: { id: "b", total_price: 0, discount_amount: 0, commission_base: 5000, homestay_id: "homestay-1" },
        }),
        { deduct_wallet_commission: deductOk },
      );

      await deductCommission("booking-1");
      expect(supabase.rpc).toHaveBeenCalledWith("deduct_wallet_commission", expect.objectContaining({ p_amount: 500 }));
    });

    it("prefers an explicit override over everything, so a failed persist cannot downgrade the charge", async () => {
      const supabase = mockClient(
        deductTables({
          booking: { id: "b", total_price: 0, discount_amount: 0, commission_base: 5000, homestay_id: "homestay-1" },
        }),
        { deduct_wallet_commission: deductOk },
      );

      await deductCommission("booking-1", 8000);
      expect(supabase.rpc).toHaveBeenCalledWith("deduct_wallet_commission", expect.objectContaining({ p_amount: 800 }));
    });

    it("uses the host's own commission rate when one is set", async () => {
      const supabase = mockClient(
        deductTables({ host: { ...COMMISSION_HOST, commission_pct_override: 5 } }),
        { deduct_wallet_commission: deductOk },
      );

      await deductCommission("booking-1");
      expect(supabase.rpc).toHaveBeenCalledWith("deduct_wallet_commission", expect.objectContaining({ p_amount: 100 }));
    });
  });

  describe("rounding", () => {
    it("rounds to the nearest baht", async () => {
      const supabase = mockClient(
        deductTables({
          booking: { id: "b", total_price: 1234, discount_amount: 0, commission_base: null, homestay_id: "homestay-1" },
        }),
        { deduct_wallet_commission: deductOk },
      );

      await deductCommission("booking-1"); // 123.4 -> 123
      expect(supabase.rpc).toHaveBeenCalledWith("deduct_wallet_commission", expect.objectContaining({ p_amount: 123 }));
    });

    it("charges a minimum of one baht rather than rounding a tiny commission to nothing", async () => {
      const supabase = mockClient(
        deductTables({
          booking: { id: "b", total_price: 5, discount_amount: 0, commission_base: null, homestay_id: "homestay-1" },
        }),
        { deduct_wallet_commission: deductOk },
      );

      await deductCommission("booking-1"); // 0.5 -> 1
      expect(supabase.rpc).toHaveBeenCalledWith("deduct_wallet_commission", expect.objectContaining({ p_amount: 1 }));
    });

    it("charges nothing on a zero-value booking", async () => {
      const supabase = mockClient(
        deductTables({
          booking: { id: "b", total_price: 0, discount_amount: 0, commission_base: null, homestay_id: "homestay-1" },
        }),
        { deduct_wallet_commission: deductOk },
      );

      await deductCommission("booking-1");
      expect(supabase.rpc).not.toHaveBeenCalled();
    });
  });

  describe("idempotency", () => {
    it("skips when a commission has already been charged and not refunded", async () => {
      const supabase = mockClient(deductTables({ counts: [1, 0] }), { deduct_wallet_commission: deductOk });
      await deductCommission("booking-1");
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("charges again after a refund, supporting a date-change cycle", async () => {
      const supabase = mockClient(deductTables({ counts: [1, 1] }), { deduct_wallet_commission: deductOk });
      await deductCommission("booking-1");
      expect(supabase.rpc).toHaveBeenCalled();
    });
  });

  describe("does nothing when the picture is incomplete", () => {
    it.each([
      ["the booking is missing", { bookings: { data: null } }],
      ["the booking lookup errors", { bookings: { data: null, error: { message: "boom" } } }],
      ["the homestay is missing", { homestays: { data: null } }],
      ["the host is missing", { hosts: { data: null } }],
      ["the billing config is missing", { platform_billing_config: { data: null, error: { message: "no config" } } }],
    ])("when %s", async (_label, override) => {
      const supabase = mockClient({ ...deductTables(), ...override }, { deduct_wallet_commission: deductOk });
      await deductCommission("booking-1");
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("when the host is not on the commission plan", async () => {
      const supabase = mockClient(
        deductTables({ host: { ...COMMISSION_HOST, plan_type: "fixed_rate" } }),
        { deduct_wallet_commission: deductOk },
      );
      await deductCommission("booking-1");
      expect(supabase.rpc).not.toHaveBeenCalled();
    });
  });

  it("queues a retry when the atomic deduction fails", async () => {
    const supabase = mockClient(deductTables(), {
      deduct_wallet_commission: { data: null, error: { message: "wallet locked" } },
    });

    await deductCommission("booking-1");

    expect(supabase.builderFor("billing_retry_queue").insert).toHaveBeenCalledWith({
      booking_id: "booking-1",
      operation: "deduct_commission",
      last_error: "wallet locked",
    });
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("swallows any failure once it has a client", async () => {
    createServiceRoleClient.mockReturnValue({
      from: () => {
        throw new Error("query exploded");
      },
    });
    await expect(deductCommission("booking-1")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  // NOTE: createServiceRoleClient() is called before the try block, so a failure
  // constructing the client is the one error that escapes. Pinned deliberately.
  it("propagates a failure to construct the database client", async () => {
    createServiceRoleClient.mockImplementation(() => {
      throw new Error("no database");
    });
    await expect(deductCommission("booking-1")).rejects.toThrow("no database");
  });

  describe("negative balance warnings", () => {
    const overdrawn = { data: [{ new_balance: -500 }], error: null };

    it("stays quiet while the balance is still positive", async () => {
      mockClient(deductTables(), { deduct_wallet_commission: deductOk });
      await deductCommission("booking-1");
      expect(sendSms).not.toHaveBeenCalled();
    });

    it("texts the host when the wallet goes negative", async () => {
      mockClient(deductTables(), { deduct_wallet_commission: overdrawn });
      await deductCommission("booking-1");
      expect(sendSms).toHaveBeenCalledWith("0812345678", expect.stringContaining("฿500"));
    });

    it("marks the warning urgent once the credit limit is breached", async () => {
      mockClient(
        deductTables({ host: { ...COMMISSION_HOST, wallet_credit_limit: 100 } }),
        { deduct_wallet_commission: overdrawn },
      );
      await deductCommission("booking-1");
      expect(sendSms).toHaveBeenCalledWith("0812345678", expect.stringContaining("URGENT"));
    });

    it("pushes to LINE first when the host prefers it", async () => {
      mockClient(
        deductTables({
          host: {
            ...COMMISSION_HOST,
            notification_preference: "line",
            line_channel_access_token: "token",
            line_user_id: "U1",
          },
        }),
        { deduct_wallet_commission: overdrawn },
      );

      await deductCommission("booking-1");
      expect(fetch).toHaveBeenCalledWith("https://api.line.me/v2/bot/message/push", expect.any(Object));
      expect(sendSms).not.toHaveBeenCalled();
    });

    it("falls back to SMS when the LINE push is rejected", async () => {
      vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false } as Response)));
      mockClient(
        deductTables({
          host: {
            ...COMMISSION_HOST,
            notification_preference: "line",
            line_channel_access_token: "token",
            line_user_id: "U1",
          },
        }),
        { deduct_wallet_commission: overdrawn },
      );

      await deductCommission("booking-1");
      expect(sendSms).toHaveBeenCalled();
    });

    it("falls back to email when the SMS fails", async () => {
      sendSms.mockResolvedValue({ success: false });
      mockClient(deductTables(), { deduct_wallet_commission: overdrawn });

      await deductCommission("booking-1");
      expect(resendSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: ["host@peaksnature.com"], subject: expect.stringContaining("-฿500") }),
      );
    });

    it("uses a configured from-address for the warning email", async () => {
      vi.stubEnv("RESEND_FROM_EMAIL", `"Peaks Billing" <billing @peaksnature.com>`);
      sendSms.mockResolvedValue({ success: false });
      mockClient(deductTables(), { deduct_wallet_commission: overdrawn });

      await deductCommission("booking-1");
      expect(resendSend).toHaveBeenCalledWith(
        expect.objectContaining({ from: "Peaks Billing <billing@peaksnature.com>" }),
      );
    });

    it("warns when there is no channel left to reach the host", async () => {
      mockClient(
        deductTables({ host: { ...COMMISSION_HOST, phone: null, email: null } }),
        { deduct_wallet_commission: overdrawn },
      );

      await deductCommission("booking-1");
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("no channel available"));
    });

    it("skips the email fallback when Resend is not configured", async () => {
      vi.stubEnv("RESEND_API_KEY", "");
      sendSms.mockResolvedValue({ success: false });
      mockClient(deductTables(), { deduct_wallet_commission: overdrawn });

      await deductCommission("booking-1");
      expect(resendSend).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("RESEND_API_KEY not configured"));
    });

    it("swallows a failure in the warning itself", async () => {
      sendSms.mockRejectedValue(new Error("sms exploded"));
      mockClient(deductTables(), { deduct_wallet_commission: overdrawn });

      await expect(deductCommission("booking-1")).resolves.toBeUndefined();
    });
  });
});

describe("refundCommission", () => {
  const refundTables = (over: { txns?: unknown; refundCount?: number } = {}) => ({
    wallet_transactions: [
      { data: over.txns ?? [{ id: "txn-1", host_id: "host-1", amount: -200 }] },
      { count: over.refundCount ?? 0 },
    ],
    bookings: { data: { homestay_id: "homestay-1", total_price: 2000 } },
    history_logs: {},
    billing_retry_queue: {},
  });
  const refundOk = { refund_wallet_commission: { data: [{ new_balance: 1000 }], error: null } };

  it("refunds the amount of the most recent commission", async () => {
    const supabase = mockClient(refundTables(), refundOk);

    await refundCommission("booking-1");

    expect(supabase.rpc).toHaveBeenCalledWith("refund_wallet_commission", {
      p_host_id: "host-1",
      p_amount: 200,
      p_booking_id: "booking-1",
      p_description: expect.stringContaining("Commission refund"),
    });
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ refund_amount: 200, new_balance: 1000 }) }),
    );
  });

  it("does nothing when no commission was ever charged", async () => {
    const supabase = mockClient(refundTables({ txns: [] }), refundOk);
    await refundCommission("booking-1");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("does nothing when the ledger cannot be read", async () => {
    const supabase = mockClient(
      { ...refundTables(), wallet_transactions: [{ data: null, error: { message: "boom" } }] },
      refundOk,
    );
    await refundCommission("booking-1");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("does nothing when the commission was already refunded", async () => {
    const supabase = mockClient(refundTables({ refundCount: 1 }), refundOk);
    await refundCommission("booking-1");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("does nothing when the recorded commission was zero", async () => {
    const supabase = mockClient(
      refundTables({ txns: [{ id: "txn-1", host_id: "host-1", amount: 0 }] }),
      refundOk,
    );
    await refundCommission("booking-1");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("queues a retry when the refund fails", async () => {
    const supabase = mockClient(refundTables(), {
      refund_wallet_commission: { data: null, error: { message: "wallet locked" } },
    });

    await refundCommission("booking-1");

    expect(supabase.builderFor("billing_retry_queue").insert).toHaveBeenCalledWith({
      booking_id: "booking-1",
      operation: "refund_commission",
      last_error: "wallet locked",
    });
  });

  it("still refunds when the booking row has gone, just without the log", async () => {
    const supabase = mockClient({ ...refundTables(), bookings: { data: null } }, refundOk);

    await refundCommission("booking-1");

    expect(supabase.rpc).toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("swallows any failure once it has a client", async () => {
    createServiceRoleClient.mockReturnValue({
      from: () => {
        throw new Error("query exploded");
      },
    });
    await expect(refundCommission("booking-1")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("enqueueBillingRetry", () => {
  it("inserts a queue row", async () => {
    const supabase = mockClient({ billing_retry_queue: {} });

    await enqueueBillingRetry("booking-1", "deduct_commission", "wallet locked");

    expect(supabase.builderFor("billing_retry_queue").insert).toHaveBeenCalledWith({
      booking_id: "booking-1",
      operation: "deduct_commission",
      last_error: "wallet locked",
    });
  });

  it("swallows a duplicate, since the queue is unique per booking and operation", async () => {
    mockClient({ billing_retry_queue: { error: { message: "duplicate key value violates unique constraint" } } });

    await expect(enqueueBillingRetry("booking-1", "deduct_commission", null)).resolves.toBeUndefined();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("logs any other insert failure", async () => {
    mockClient({ billing_retry_queue: { error: { message: "permission denied" } } });

    await enqueueBillingRetry("booking-1", "refund_commission", null);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("processBillingRetryQueue", () => {
  /** Every payload passed to .update() on `table`, across all its builders. */
  const updatesTo = (supabase: ReturnType<typeof createSupabaseMock>, table: string) =>
    supabase.calls
      .filter((c) => c.table === table)
      .flatMap((c) => vi.mocked(c.builder.update as ReturnType<typeof vi.fn>).mock.calls.map((args) => args[0]));

  const queueRow = (over: Record<string, unknown> = {}) => ({
    id: "retry-1",
    operation: "deduct_commission",
    booking_id: "booking-1",
    attempts: 0,
    ...over,
  });

  it("reports nothing to do on an empty queue", async () => {
    mockClient({ billing_retry_queue: { data: [] } });
    await expect(processBillingRetryQueue()).resolves.toEqual({ processed: 0, resolved: 0, exhausted: 0 });
  });

  it("copes with the queue query returning nothing at all", async () => {
    mockClient({ billing_retry_queue: { data: null } });
    await expect(processBillingRetryQueue()).resolves.toEqual({ processed: 0, resolved: 0, exhausted: 0 });
  });

  it("marks a deduction resolved once the ledger shows the charge", async () => {
    const supabase = mockClient(
      {
        ...deductTables(),
        billing_retry_queue: [{ data: [queueRow()] }, {}],
        wallet_transactions: [
          { count: 0 }, { count: 0 },          // deductCommission's idempotency check
          { count: 0 },                         // refund count for the resolution check
          { count: 1 },                         // commission count
        ],
      },
      { deduct_wallet_commission: deductOk },
    );

    await expect(processBillingRetryQueue()).resolves.toEqual({ processed: 1, resolved: 1, exhausted: 0 });
    expect(updatesTo(supabase, "billing_retry_queue")).toContainEqual(
      expect.objectContaining({ resolved_at: expect.any(String), attempts: 1 }),
    );
  });

  it("marks a refund resolved once the ledger shows the refund", async () => {
    mockClient(
      {
        billing_retry_queue: [{ data: [queueRow({ operation: "refund_commission" })] }, {}],
        wallet_transactions: [
          { data: [{ id: "txn-1", host_id: "host-1", amount: -200 }] }, // refundCommission lookup
          { count: 0 },                                                 // its refund count
          { count: 1 },                                                 // resolution: refunds
          { count: 1 },                                                 // resolution: commissions
        ],
        bookings: { data: { homestay_id: "homestay-1", total_price: 2000 } },
        history_logs: {},
      },
      { refund_wallet_commission: { data: [{ new_balance: 1000 }], error: null } },
    );

    await expect(processBillingRetryQueue()).resolves.toMatchObject({ resolved: 1 });
  });

  it("backs off exponentially while the operation stays unresolved", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));

    const supabase = mockClient(
      {
        ...deductTables(),
        // select, then the failed deduction's own enqueue, then the back-off update
        billing_retry_queue: [{ data: [queueRow({ attempts: 1 })] }, {}, {}],
        wallet_transactions: [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }],
      },
      { deduct_wallet_commission: { data: null, error: { message: "still locked" } } },
    );

    await expect(processBillingRetryQueue()).resolves.toMatchObject({ resolved: 0, exhausted: 0 });

    const update = updatesTo(supabase, "billing_retry_queue")[0] as {
      attempts: number;
      next_attempt_at: string;
    };
    expect(update.attempts).toBe(2);
    // attempts 2 -> 2^2 = 4 hours out.
    expect(update.next_attempt_at).toBe(new Date("2026-06-15T04:00:00Z").toISOString());
  });

  it("gives up and raises an event after the final attempt", async () => {
    const supabase = mockClient(
      {
        ...deductTables(),
        billing_retry_queue: [{ data: [queueRow({ attempts: 4 })] }, {}, {}],
        wallet_transactions: [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }],
      },
      { deduct_wallet_commission: { data: null, error: { message: "still locked" } } },
    );

    await expect(processBillingRetryQueue()).resolves.toMatchObject({ exhausted: 1, resolved: 0 });
    expect(updatesTo(supabase, "billing_retry_queue")).toContainEqual(
      expect.objectContaining({ attempts: 5, last_error: "Max attempts reached without resolution" }),
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ data: { operation: "deduct_commission", attempts: 5 } }),
    );
  });

  it("records the error and backs off when an attempt throws", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));

    const supabase = createSupabaseMock({
      tables: { billing_retry_queue: [{ data: [queueRow()] }, {}] },
    });
    let call = 0;
    createServiceRoleClient.mockImplementation(() => {
      call += 1;
      if (call === 1) return supabase;
      throw new Error("database vanished");
    });

    await expect(processBillingRetryQueue()).resolves.toMatchObject({ processed: 1, resolved: 0 });

    const update = updatesTo(supabase, "billing_retry_queue")[0] as {
      last_error: string;
      next_attempt_at: string;
    };
    expect(update.last_error).toBe("database vanished");
    expect(update.next_attempt_at).toBe(new Date("2026-06-15T02:00:00Z").toISOString());
  });
});
