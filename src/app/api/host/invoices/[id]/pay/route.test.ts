import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { signIn, signOut } from "../../../../../../../test/helpers/auth";
import { makeFormRequest, readJson, uniqueIp } from "../../../../../../../test/helpers/request";
import type { QueryResponse } from "../../../../../../../test/helpers/supabase";
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
vi.mock("@/lib/billing", () => ({ getBillingConfig: h.getBillingConfig }));
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
const HOST = { id: "host-1", name: "Peaks Homestay" };
const INVOICE = { id: "inv-1", host_id: "host-1", amount: 3000, status: "overdue" };

const slipFile = (name = "slip.jpg", type = "image/jpeg") =>
  new File([new Uint8Array(32)], name, { type });

const easySlipSuccess = (amount: number): EasySlipV2Response =>
  ({
    success: true,
    message: "ok",
    data: {
      isDuplicate: false,
      matchedAccount: null,
      amountInSlip: amount,
      // EasySlip reports a matchAmount miss here; it never rejects one.
      isAmountMatched: amount === INVOICE.amount,
      rawSlip: {
        transRef: "TXN-1",
        date: new Date().toISOString(),
        amount: { amount },
        receiver: { account: { proxy: { type: "MSISDN", account: "xxx-xxx-5678" } } },
      },
    },
  }) as unknown as EasySlipV2Response;

/**
 * `invoices` is read three times in order: the invoice itself, the slip-hash
 * duplicate check, then the conditional update (which returns the rows it hit).
 */
function mockClient({
  invoice = INVOICE as unknown,
  updated = [{ id: INVOICE.id }] as unknown,
  updateError = null as unknown,
} = {}) {
  const invoices: QueryResponse[] = [
    { data: invoice },
    { data: [] },
    { data: updated, error: updateError },
  ];
  return signIn(h, {
    tables: {
      hosts: { data: HOST },
      invoices,
      wallet_transactions: { data: [] },
      bookings: { data: [] },
      date_change_requests: { data: [] },
    },
  });
}

const post = (ip = uniqueIp()) =>
  POST(makeFormRequest("/api/host/invoices/inv-1/pay", { file: slipFile() }, { ip }), {
    params: Promise.resolve({ id: "inv-1" }),
  });

/** The conditional update, if the route got that far. */
const paidUpdate = (supabase: ReturnType<typeof mockClient>) => {
  const writes = supabase.calls.filter((c) => c.table === "invoices").slice(2);
  return writes[0]?.builder ?? null;
};

const rejectionLog = async () => {
  for (const cb of h.afterCallbacks) await cb();
  return h.logEvent.mock.calls
    .map(([params]) => params as { eventType: string; data: Record<string, unknown> })
    .find((p) => p.eventType === "PLATFORM_PAYMENT_REJECTED");
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("EASYSLIP_API_KEY", "easyslip-key");
  h.afterCallbacks.length = 0;
  h.getBillingConfig.mockResolvedValue({ promptpay_id: RECEIVER, bank_account_number: null });
  h.callEasySlipV2.mockResolvedValue(easySlipSuccess(INVOICE.amount));
  mockClient();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/host/invoices/[id]/pay", () => {
  describe("a good payment", () => {
    it("marks the invoice paid, only while it is still open", async () => {
      const supabase = mockClient();
      const { status, body } = await readJson(await post());

      expect(status).toBe(200);
      expect(body).toEqual({ success: true, verified: true });
      const update = paidUpdate(supabase)!;
      expect(update.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "paid", slip_trans_ref: "TXN-1", easyslip_verified: true }),
      );
      expect(update.in).toHaveBeenCalledWith("status", ["pending", "overdue"]);
    });

    it("asks EasySlip to match the invoice amount", async () => {
      await post();
      expect(h.callEasySlipV2).toHaveBeenCalledWith(
        expect.any(ArrayBuffer), "slip.jpg", "image/jpeg", "easyslip-key", INVOICE.amount,
      );
    });
  });

  // EasySlip only *reports* a matchAmount miss. Before this check, a ฿1
  // transfer to the platform account settled a ฿3,000 invoice.
  describe("the amount", () => {
    it.each([1, 2999, 3001])("refuses a ฿%i slip against a ฿3,000 invoice", async (amount) => {
      h.callEasySlipV2.mockResolvedValue(easySlipSuccess(amount));
      const supabase = mockClient();
      const { status, body } = await readJson(await post());

      expect(status).toBe(200);
      expect(body).toMatchObject({ verified: false, message: expect.stringContaining("Amount mismatch") });
      expect(paidUpdate(supabase)).toBeNull();
      await expect(rejectionLog()).resolves.toMatchObject({
        data: { reason: "amount_mismatch", expected_amount: 3000, slip_amount: amount, trans_ref: "TXN-1" },
      });
    });
  });

  // Two slips sent together both pass the "already paid?" read; the second must
  // not overwrite the record of the first.
  it("refuses the second of two racing payments", async () => {
    mockClient({ updated: [] });
    await expect(readJson(await post())).resolves.toEqual({
      status: 409,
      body: { error: "Invoice already paid" },
    });
    await expect(rejectionLog()).resolves.toMatchObject({ data: { reason: "already_paid" } });
  });

  it("maps a slip_trans_ref unique violation to a 409", async () => {
    mockClient({
      updated: null,
      updateError: { message: 'duplicate key value violates unique constraint "idx_invoices_slip_trans_ref"' },
    });
    await expect(readJson(await post()))
      .resolves.toMatchObject({ status: 409, body: { duplicate: true } });
  });

  it("refuses a slip paid to someone other than the platform", async () => {
    h.getBillingConfig.mockResolvedValue({ promptpay_id: "0999999999", bank_account_number: null });
    const supabase = mockClient();
    const { body } = await readJson(await post());
    expect(body).toMatchObject({ verified: false, message: expect.stringContaining("Receiver") });
    expect(paidUpdate(supabase)).toBeNull();
  });

  describe("refusals before the slip is spent", () => {
    it("refuses an invoice that is already paid", async () => {
      mockClient({ invoice: { ...INVOICE, status: "paid" } });
      await expect(readJson(await post())).resolves.toMatchObject({ status: 400 });
      expect(h.callEasySlipV2).not.toHaveBeenCalled();
    });

    it("refuses when the platform has no receiving account configured", async () => {
      h.getBillingConfig.mockResolvedValue({ promptpay_id: null, bank_account_number: null });
      await expect(readJson(await post())).resolves.toMatchObject({ status: 503 });
      expect(h.callEasySlipV2).not.toHaveBeenCalled();
    });

    it("does not find another host's invoice", async () => {
      mockClient({ invoice: null });
      await expect(readJson(await post())).resolves.toMatchObject({ status: 404 });
    });

    it("turns away a signed-out caller", async () => {
      signOut(h);
      await expect(readJson(await post())).resolves.toEqual({
        status: 401,
        body: { error: "Unauthorized" },
      });
    });
  });

  // Every call reaches the metered EasySlip API before any DB write.
  it("cuts off a burst from one address", async () => {
    const ip = uniqueIp();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      mockClient();
      statuses.push((await post(ip)).status);
    }
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });
});
