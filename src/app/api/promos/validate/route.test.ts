import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock, type SupabaseMockOptions } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson, uniqueIp } from "../../../../../test/helpers/request";
import { makePromoCode } from "../../../../../test/fixtures/db";

const { createServiceRoleClient } = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient }));

const HOMESTAY_ID = "11111111-1111-4111-8111-111111111111";

const body = (over: Record<string, unknown> = {}) => ({
  homestay_id: HOMESTAY_ID,
  code: "save10",
  subtotal: 2000,
  ...over,
});

const post = (payload: unknown) =>
  POST(makeRequest("/api/promos/validate", { body: payload, ip: uniqueIp() }));

function useTables(tables: SupabaseMockOptions["tables"]) {
  const supabase = createSupabaseMock({ tables });
  createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const enabledHomestay = { homestays: { data: { promo_codes_enabled: true } } };

beforeEach(() => {
  useTables({ ...enabledHomestay, promo_codes: { data: makePromoCode() } });
});

describe("POST /api/promos/validate", () => {
  it("accepts a live code and returns the discount it earns", async () => {
    useTables({
      ...enabledHomestay,
      promo_codes: { data: makePromoCode({ id: "promo-1", code: "SAVE10", discount_value: 10 }) },
    });

    await expect(readJson(await post(body()))).resolves.toEqual({
      status: 200,
      body: {
        valid: true,
        code_id: "promo-1",
        code: "SAVE10",
        discount_type: "percentage",
        discount_value: 10,
        discount_amount: 200,
      },
    });
  });

  it("accepts an attribution-only code that discounts nothing", async () => {
    useTables({
      ...enabledHomestay,
      promo_codes: { data: makePromoCode({ discount_value: 0, recommender_name: "Ann" }) },
    });

    const { body: result } = await readJson(await post(body()));
    expect(result).toMatchObject({ valid: true, discount_amount: 0 });
  });

  it("looks the code up case-insensitively within the homestay", async () => {
    const supabase = useTables({ ...enabledHomestay, promo_codes: { data: makePromoCode() } });

    await post(body({ code: "  save10  " }));

    const builder = supabase.builderFor("promo_codes");
    expect(builder.eq).toHaveBeenCalledWith("homestay_id", HOMESTAY_ID);
    expect(builder.ilike).toHaveBeenCalledWith("code", "SAVE10");
  });

  describe("rejections", () => {
    it("refuses a body that is not JSON", async () => {
      const req = makeRequest("/api/promos/validate", { body: "not json", ip: uniqueIp() });
      await expect(readJson(await POST(req))).resolves.toEqual({
        status: 400,
        body: { valid: false, reason: "INVALID_BODY" },
      });
    });

    it.each([
      ["a missing code", { code: undefined }],
      ["an empty code", { code: "" }],
      ["a non-uuid homestay", { homestay_id: "not-a-uuid" }],
      ["a negative subtotal", { subtotal: -1 }],
      ["a fractional subtotal", { subtotal: 10.5 }],
      ["an invalid email", { guest_email: "not-an-email" }],
    ])("refuses %s", async (_label, over) => {
      const { status, body: result } = await readJson(await post(body(over)));
      expect(status).toBe(400);
      expect(result).toMatchObject({ valid: false, reason: "INVALID_BODY" });
    });

    it("reports DISABLED when the homestay has promo codes switched off", async () => {
      useTables({ homestays: { data: { promo_codes_enabled: false } } });
      const { status, body: result } = await readJson(await post(body()));

      expect(status).toBe(200);
      expect(result).toEqual({ valid: false, reason: "DISABLED" });
    });

    it("reports DISABLED when the homestay does not exist", async () => {
      useTables({ homestays: { data: null } });
      expect((await readJson(await post(body()))).body).toEqual({ valid: false, reason: "DISABLED" });
    });

    it("reports NOT_FOUND for an unknown code", async () => {
      useTables({ ...enabledHomestay, promo_codes: { data: null } });
      expect((await readJson(await post(body()))).body).toEqual({ valid: false, reason: "NOT_FOUND" });
    });

    it.each([
      ["INACTIVE", { is_active: false }],
      ["NOT_STARTED", { start_at: "2099-01-01" }],
      ["EXPIRED", { expires_at: "2000-01-01" }],
      ["MAX_USES", { max_uses: 1, times_used: 1 }],
    ])("passes through the %s verdict", async (reason, over) => {
      useTables({ ...enabledHomestay, promo_codes: { data: makePromoCode(over) } });
      expect((await readJson(await post(body()))).body).toEqual({ valid: false, reason });
    });
  });

  describe("one use per guest", () => {
    const oneUse = makePromoCode({ id: "promo-1", one_use_per_guest: true });

    it("refuses a guest who already redeemed the code", async () => {
      useTables({
        ...enabledHomestay,
        promo_codes: { data: oneUse },
        promo_redemptions: { data: [{ id: "redemption-1" }] },
      });

      const { body: result } = await readJson(await post(body({ guest_phone: "0812345678" })));
      expect(result).toEqual({ valid: false, reason: "ALREADY_USED" });
    });

    it("allows a guest who has not used it before", async () => {
      useTables({ ...enabledHomestay, promo_codes: { data: oneUse }, promo_redemptions: { data: [] } });

      const { body: result } = await readJson(await post(body({ guest_phone: "0812345678" })));
      expect(result).toMatchObject({ valid: true });
    });

    // The schema's .email() rejects surrounding whitespace outright, so only the
    // phone can arrive padded; the email is normalised for case only.
    it("matches on phone or email, normalising both", async () => {
      const supabase = useTables({
        ...enabledHomestay,
        promo_codes: { data: oneUse },
        promo_redemptions: { data: [] },
      });

      await post(body({ guest_phone: " 0812345678 ", guest_email: "Guest@Example.COM" }));

      expect(supabase.builderFor("promo_redemptions").or).toHaveBeenCalledWith(
        "guest_phone.eq.0812345678,guest_email.eq.guest@example.com",
      );
    });

    it("skips the check when the guest identified themselves with neither", async () => {
      const supabase = useTables({ ...enabledHomestay, promo_codes: { data: oneUse } });

      await post(body());

      expect(supabase.calls.map((c) => c.table)).not.toContain("promo_redemptions");
    });

    it("skips the check for a code that may be reused", async () => {
      const supabase = useTables({
        ...enabledHomestay,
        promo_codes: { data: makePromoCode({ one_use_per_guest: false }) },
      });

      await post(body({ guest_phone: "0812345678" }));

      expect(supabase.calls.map((c) => c.table)).not.toContain("promo_redemptions");
    });
  });

  it("rate limits a client hammering the endpoint", async () => {
    const ip = "203.0.113.7";
    const hammer = () => POST(makeRequest("/api/promos/validate", { body: body(), ip }));

    for (let i = 0; i < 30; i++) {
      expect((await hammer()).status).toBe(200);
    }
    const blocked = await hammer();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });
});
