import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { signIn, signOut } from "../../../../../../test/helpers/auth";
import { makeFormRequest, readJson, uniqueIp } from "../../../../../../test/helpers/request";
import { TOPUP_AMOUNTS } from "@/lib/topup-amounts";
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
const HOST = { id: "host-1", plan_type: "commission", name: "Peaks Homestay" };

const slipFile = (name = "slip.jpg", type = "image/jpeg", bytes = 32) =>
  new File([new Uint8Array(bytes)], name, { type });

/** No row in any slip-bearing table carries this hash. */
const noDuplicates = () => ({
  wallet_transactions: { data: [] },
  invoices: { data: [] },
  bookings: { data: [] },
  date_change_requests: { data: [] },
});

const easySlipSuccess = (amount: number): EasySlipV2Response =>
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
        date: new Date().toISOString(),
        amount: { amount },
        receiver: { account: { proxy: { type: "MSISDN", account: "xxx-xxx-5678" } } },
      },
    },
  }) as unknown as EasySlipV2Response;

function mockClient(newBalance = 5000) {
  return signIn(h, {
    tables: { hosts: { data: HOST }, ...noDuplicates() },
    rpc: { topup_wallet: { data: [{ new_balance: newBalance }] } },
  });
}

const post = (fields: Record<string, string | File> = {}) =>
  POST(
    makeFormRequest(
      "/api/host/wallet/topup",
      { file: slipFile(), amount: "1000", ...fields },
      { ip: uniqueIp() },
    ),
  );

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("EASYSLIP_API_KEY", "easyslip-key");
  h.afterCallbacks.length = 0;
  h.getBillingConfig.mockResolvedValue({ promptpay_id: RECEIVER, bank_account_number: null });
  h.callEasySlipV2.mockImplementation(
    (_buf: ArrayBuffer, _n: string, _t: string, _k: string, amount: number) =>
      Promise.resolve(easySlipSuccess(amount)),
  );
  mockClient();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/host/wallet/topup", () => {
  describe("amount allowlist", () => {
    // The topup_wallet RPC accepts any INTEGER, so this route is the only place
    // the fixed-amount rule is enforced.
    it.each(TOPUP_AMOUNTS)("accepts ฿%i", async (amount) => {
      const { status, body } = await readJson(await post({ amount: String(amount) }));

      expect(status).toBe(200);
      expect(body).toMatchObject({ success: true, verified: true, amount, new_balance: 5000 });
    });

    it.each([300, 500, 1500, 2500, 5000, 999, 1, 0, -1000])(
      "rejects ฿%i",
      async (amount) => {
        await expect(readJson(await post({ amount: String(amount) }))).resolves.toEqual({
          status: 400,
          body: { error: "Invalid amount" },
        });
      },
    );

    it("rejects a non-numeric amount", async () => {
      const { status, body } = await readJson(await post({ amount: "one thousand" }));
      expect(status).toBe(400);
      expect(body).toEqual({ error: "Invalid amount" });
    });

    it("rejects a missing amount", async () => {
      const req = makeFormRequest("/api/host/wallet/topup", { file: slipFile() }, { ip: uniqueIp() });
      await expect(readJson(await POST(req))).resolves.toEqual({
        status: 400,
        body: { error: "Invalid amount" },
      });
    });

    it("costs nothing when the amount is refused — no upload, no verification, no credit", async () => {
      const supabase = mockClient();
      await post({ amount: "5000" });

      expect(h.callEasySlipV2).not.toHaveBeenCalled();
      expect(supabase.storage.upload).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
    });
  });

  describe("a good top-up", () => {
    it("credits the wallet through the atomic RPC", async () => {
      const supabase = mockClient(3000);
      await post({ amount: "2000" });

      expect(supabase.rpc).toHaveBeenCalledWith(
        "topup_wallet",
        expect.objectContaining({
          p_host_id: HOST.id,
          p_amount: 2000,
          p_easyslip_verified: true,
          p_created_by: HOST.name,
        }),
      );
    });

    it("stores the slip under the host's folder", async () => {
      const supabase = mockClient();
      await post({ amount: "3000" });

      expect(supabase.storage.from).toHaveBeenCalledWith("payment-slips");
      expect(supabase.storage.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^wallet\/host-1\/.+\.jpg$/),
        expect.any(File),
        { upsert: true, contentType: "image/jpeg" },
      );
    });

    it("passes the chosen amount to the verification service", async () => {
      await post({ amount: "3000" });
      expect(h.callEasySlipV2).toHaveBeenCalledWith(
        expect.any(ArrayBuffer), "slip.jpg", "image/jpeg", "easyslip-key", 3000,
      );
    });

    it("logs the top-up after the response is sent", async () => {
      await post({ amount: "1000" });
      expect(h.logEvent).not.toHaveBeenCalled();

      for (const cb of h.afterCallbacks) await cb();
      expect(h.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "billing",
          entityId: HOST.id,
          actorType: "host",
          data: expect.objectContaining({ amount: 1000, new_balance: 5000 }),
        }),
      );
    });
  });

  describe("guards ahead of the allowlist", () => {
    it("turns away a signed-out caller", async () => {
      signOut(h);
      await expect(readJson(await post())).resolves.toEqual({
        status: 401,
        body: { error: "Unauthorized" },
      });
    });

    it("requires a file", async () => {
      const req = makeFormRequest("/api/host/wallet/topup", { amount: "1000" }, { ip: uniqueIp() });
      await expect(readJson(await POST(req))).resolves.toEqual({
        status: 400,
        body: { error: "No file uploaded" },
      });
    });

    it("refuses a file that is not an accepted image", async () => {
      const { status, body } = await readJson(await post({ file: slipFile("doc.pdf", "application/pdf") }));
      expect(status).toBe(400);
      expect(body).toEqual({ error: "Invalid file type" });
    });
  });

  describe("verification failures", () => {
    it("reports an unverified slip without crediting the wallet", async () => {
      const supabase = mockClient();
      h.callEasySlipV2.mockResolvedValue({
        success: false,
        error: { code: "SLIP_NOT_FOUND", message: "not found" },
      } as unknown as EasySlipV2Response);

      const { status, body } = await readJson(await post({ amount: "1000" }));

      expect(status).toBe(200);
      expect(body).toMatchObject({ verified: false });
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("rejects a slip whose amount does not match the chosen preset", async () => {
      const supabase = mockClient();
      h.callEasySlipV2.mockResolvedValue(easySlipSuccess(2000));

      const { body } = await readJson(await post({ amount: "1000" }));

      expect(body).toMatchObject({
        verified: false,
        message: expect.stringContaining("Amount mismatch"),
      });
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("rejects a slip paid to someone other than the platform", async () => {
      h.getBillingConfig.mockResolvedValue({ promptpay_id: "0999999999", bank_account_number: null });

      const { body } = await readJson(await post({ amount: "1000" }));

      expect(body).toMatchObject({
        verified: false,
        message: expect.stringContaining("Receiver does not match"),
      });
    });
  });
});
