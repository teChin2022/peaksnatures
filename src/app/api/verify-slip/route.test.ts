import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock, type SupabaseMockOptions } from "../../../../test/helpers/supabase";
import { makeFormRequest, readJson, uniqueIp } from "../../../../test/helpers/request";
import type { EasySlipV2Response } from "@/lib/easyslip";

const { createServiceRoleClient, callEasySlipV2 } = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  callEasySlipV2: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient }));
// Keep the real pure helpers (hashing, account matching); stub only the network call.
vi.mock("@/lib/easyslip", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/easyslip")>()),
  callEasySlipV2,
}));

const RECEIVER = "0812345678";
const SLIP_TABLES = ["bookings", "booking_groups", "date_change_requests", "invoices", "wallet_transactions"];

const slipFile = (name = "slip.jpg", type = "image/jpeg", bytes = 32) =>
  new File([new Uint8Array(bytes)], name, { type });

const easySlipSuccess = (over: Record<string, unknown> = {}): EasySlipV2Response =>
  ({
    success: true,
    message: "ok",
    data: {
      isDuplicate: false,
      matchedAccount: null,
      amountInSlip: 2000,
      isAmountMatched: true,
      rawSlip: {
        transRef: "TXN-123",
        date: new Date().toISOString(),
        amount: { amount: 2000 },
        receiver: { account: { proxy: { type: "MSISDN", account: "xxx-xxx-5678" } } },
      },
      ...over,
    },
  }) as unknown as EasySlipV2Response;

/** No row anywhere carries this slip hash or transaction reference. */
const noDuplicates = () =>
  Object.fromEntries(SLIP_TABLES.map((t) => [t, [{ data: [] }, { data: [] }]]));

function mockClient(options: SupabaseMockOptions = {}) {
  const supabase = createSupabaseMock({ tables: noDuplicates(), ...options });
  createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const post = (fields: Record<string, string | File> = {}) =>
  POST(
    makeFormRequest(
      "/api/verify-slip",
      { file: slipFile(), expected_amount: "2000", expected_receiver: RECEIVER, ...fields },
      { ip: uniqueIp() },
    ),
  );

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("EASYSLIP_API_KEY", "easyslip-key");
  mockClient();
  callEasySlipV2.mockResolvedValue(easySlipSuccess());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/verify-slip", () => {
  it("verifies a good slip and reports where it was stored", async () => {
    const { status, body } = await readJson(await post());

    expect(status).toBe(200);
    expect(body).toMatchObject({
      verified: true,
      message: "Payment verified!",
      slip_trans_ref: "TXN-123",
      payment_slip_signed_url: "https://storage.test/signed-slip",
    });
    expect((body as { slip_hash: string }).slip_hash).toHaveLength(64);
    expect((body as { payment_slip_url: string }).payment_slip_url).toMatch(/^pending\/.+\/slip\.jpg$/);
  });

  it("uploads the slip and signs a preview URL for an hour", async () => {
    const supabase = mockClient();
    await post();

    expect(supabase.storage.from).toHaveBeenCalledWith("payment-slips");
    expect(supabase.storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^pending\//),
      expect.any(File),
      { upsert: true, contentType: "image/jpeg" },
    );
    expect(supabase.storage.createSignedUrl).toHaveBeenCalledWith(expect.any(String), 3600);
  });

  it("still verifies when the preview URL cannot be signed", async () => {
    mockClient({ storage: { signedUrl: null } });
    const { body } = await readJson(await post());
    expect(body).toMatchObject({ verified: true, payment_slip_signed_url: null });
  });

  it("passes the expected amount to the verification service", async () => {
    await post({ expected_amount: "3500" });
    expect(callEasySlipV2).toHaveBeenCalledWith(
      expect.any(ArrayBuffer), "slip.jpg", "image/jpeg", "easyslip-key", 3500,
    );
  });

  describe("upload validation", () => {
    it("requires a file", async () => {
      const req = makeFormRequest("/api/verify-slip", { expected_amount: "2000" }, { ip: uniqueIp() });
      await expect(readJson(await POST(req))).resolves.toEqual({
        status: 400,
        body: { error: "No file uploaded" },
      });
    });

    it("refuses a file over 4MB", async () => {
      const { status, body } = await readJson(await post({ file: slipFile("big.jpg", "image/jpeg", 4 * 1024 * 1024 + 1) }));
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: expect.stringContaining("File too large") });
    });

    it("refuses a file that is not an accepted image", async () => {
      const { status, body } = await readJson(await post({ file: slipFile("doc.pdf", "application/pdf") }));
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: expect.stringContaining("Invalid file type") });
    });

    it.each(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])(
      "accepts %s",
      async (type) => {
        expect((await post({ file: slipFile(`slip.${type.split("/")[1]}`, type) })).status).toBe(200);
      },
    );

    it("reports 503 when slip verification is not configured", async () => {
      vi.stubEnv("EASYSLIP_API_KEY", "");
      await expect(readJson(await post())).resolves.toEqual({
        status: 503,
        body: { error: "Payment verification is not configured." },
      });
    });
  });

  describe("duplicate detection", () => {
    it.each(SLIP_TABLES)("rejects a slip whose hash already appears in %s", async (table) => {
      mockClient({ tables: { ...noDuplicates(), [table]: [{ data: [{ id: "existing" }] }] } });

      const { status, body } = await readJson(await post());
      expect(status).toBe(409);
      expect(body).toMatchObject({ duplicate: true, error: expect.stringContaining("already been used") });
      expect(callEasySlipV2).not.toHaveBeenCalled();
    });

    it.each(SLIP_TABLES)("rejects a transaction reference already seen in %s", async (table) => {
      mockClient({
        tables: { ...noDuplicates(), [table]: [{ data: [] }, { data: [{ id: "existing" }] }] },
      });

      const { status, body } = await readJson(await post());
      expect(status).toBe(409);
      expect(body).toMatchObject({
        duplicate: true,
        error: expect.stringContaining("transaction has already been used"),
      });
    });

    it("rejects a slip the verification service itself flags as reused", async () => {
      callEasySlipV2.mockResolvedValue(easySlipSuccess({ isDuplicate: true }));

      const { status, body } = await readJson(await post());
      expect(status).toBe(409);
      expect(body).toMatchObject({ duplicate: true });
    });

    it("skips the reference check when the slip carries none", async () => {
      const slip = easySlipSuccess();
      (slip as { data: { rawSlip: { transRef: string | null } } }).data.rawSlip.transRef = null;
      callEasySlipV2.mockResolvedValue(slip);

      const { body } = await readJson(await post());
      expect(body).toMatchObject({ verified: true, slip_trans_ref: null });
    });
  });

  describe("slip age", () => {
    const slipDated = (date: string) => {
      const slip = easySlipSuccess();
      (slip as { data: { rawSlip: { date: string } } }).data.rawSlip.date = date;
      callEasySlipV2.mockResolvedValue(slip);
    };

    it("accepts a slip from a few minutes ago", async () => {
      slipDated(new Date(Date.now() - 5 * 60 * 1000).toISOString());
      expect((await readJson(await post())).body).toMatchObject({ verified: true });
    });

    it("refuses a slip older than an hour", async () => {
      slipDated(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
      const { body } = await readJson(await post());
      expect(body).toMatchObject({ verified: false, message: expect.stringContaining("too old") });
    });

    it("refuses a slip dated in the future", async () => {
      slipDated(new Date(Date.now() + 60 * 60 * 1000).toISOString());
      expect((await readJson(await post())).body).toMatchObject({ verified: false });
    });

    // KNOWN GAP: an unparseable date makes slipAgeMs NaN, and both comparisons
    // against NaN are false, so the freshness check waves the slip through —
    // even though its own message claims to catch an invalid date. Pinned
    // deliberately; security-relevant and flagged for review.
    it("lets a slip with an unreadable date through the age check", async () => {
      slipDated("not-a-date");
      expect((await readJson(await post())).body).toMatchObject({ verified: true });
    });
  });

  describe("amount and receiver matching", () => {
    const slipWith = (over: Record<string, unknown>) => {
      callEasySlipV2.mockResolvedValue(easySlipSuccess(over));
    };

    it("accepts the service's own amount match", async () => {
      slipWith({ isAmountMatched: true, amountInSlip: 99 });
      expect((await readJson(await post())).body).toMatchObject({ verified: true });
    });

    it("falls back to comparing the amounts itself", async () => {
      slipWith({ isAmountMatched: undefined, amountInSlip: 2000 });
      expect((await readJson(await post())).body).toMatchObject({ verified: true });
    });

    it("refuses a slip for the wrong amount", async () => {
      slipWith({ isAmountMatched: false, amountInSlip: 500 });
      const { body } = await readJson(await post());

      expect(body).toMatchObject({ verified: false });
      expect((body as { message: string }).message).toContain("expected ฿2000, got ฿500");
    });

    it("reads the amount off the raw slip when the service reports none", async () => {
      slipWith({ isAmountMatched: false, amountInSlip: undefined });
      expect((await readJson(await post())).body).toMatchObject({ verified: true });
    });

    it("refuses a slip paid to somebody else", async () => {
      slipWith({
        rawSlip: {
          transRef: "TXN-9",
          date: new Date().toISOString(),
          amount: { amount: 2000 },
          receiver: { account: { proxy: { type: "MSISDN", account: "xxx-xxx-9999" } } },
        },
      });

      const { body } = await readJson(await post());
      expect(body).toMatchObject({ verified: false });
      expect((body as { message: string }).message).toContain("Receiver account does not match");
    });

    it("matches the host's bank account when the PromptPay id does not", async () => {
      slipWith({
        rawSlip: {
          transRef: "TXN-9",
          date: new Date().toISOString(),
          amount: { amount: 2000 },
          receiver: { account: { bank: { type: "BANKAC", account: "123-4-56789-0" } } },
        },
      });

      const { body } = await readJson(await post({ expected_receiver_bank: "1234567890" }));
      expect(body).toMatchObject({ verified: true });
    });

    it("accepts any receiver when the host has none configured", async () => {
      slipWith({
        rawSlip: {
          transRef: "TXN-9",
          date: new Date().toISOString(),
          amount: { amount: 2000 },
          receiver: { account: { proxy: { type: "MSISDN", account: "xxx-xxx-0000" } } },
        },
      });

      const req = makeFormRequest(
        "/api/verify-slip",
        { file: slipFile(), expected_amount: "2000" },
        { ip: uniqueIp() },
      );
      expect((await readJson(await POST(req))).body).toMatchObject({ verified: true });
    });

    it("includes debug detail only outside production", async () => {
      slipWith({ isAmountMatched: false, amountInSlip: 500 });

      vi.stubEnv("NODE_ENV", "development");
      expect((await readJson(await post())).body).toHaveProperty("debug");

      vi.stubEnv("NODE_ENV", "production");
      expect((await readJson(await post())).body).not.toHaveProperty("debug");
    });
  });

  describe("verification failures", () => {
    it("tells the guest to retry a slip the bank has not settled yet", async () => {
      callEasySlipV2.mockResolvedValue({ success: false, error: { code: "SLIP_PENDING", message: "Pending" } });

      const { status, body } = await readJson(await post());
      expect(status).toBe(200);
      expect(body).toMatchObject({
        verified: false,
        slip_pending: true,
        message: expect.stringContaining("wait 2-3 minutes"),
      });
    });

    it("passes an upstream failure through as an unverified slip", async () => {
      callEasySlipV2.mockResolvedValue({
        success: false,
        error: { code: "UPSTREAM_TIMEOUT", message: "Slip verification timed out." },
      });

      const { status, body } = await readJson(await post());
      expect(status).toBe(200);
      expect(body).toMatchObject({
        verified: false,
        message: "Slip verification failed: Slip verification timed out.",
      });
    });

    it("reports 500 when something unexpected throws", async () => {
      createServiceRoleClient.mockImplementation(() => {
        throw new Error("no database");
      });
      await expect(readJson(await post())).resolves.toEqual({
        status: 500,
        body: { error: "Failed to verify slip" },
      });
    });
  });

  it("rate limits a client hammering the endpoint", async () => {
    const ip = "203.0.113.40";
    const hammer = () =>
      POST(makeFormRequest("/api/verify-slip", { file: slipFile(), expected_amount: "2000" }, { ip }));

    for (let i = 0; i < 10; i++) expect((await hammer()).status).toBe(200);
    expect((await hammer()).status).toBe(429);
  });
});
