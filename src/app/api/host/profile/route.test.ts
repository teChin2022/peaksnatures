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

const row = (over: Record<string, unknown> = {}) => ({
  id: "host-1",
  name: "Somchai",
  email: "somchai@example.com",
  phone: "0812345678",
  line_user_id: null,
  line_channel_access_token: null,
  promptpay_id: "0812345678",
  notification_preference: "sms",
  security_pin_hash: null,
  avatar_url: null,
  bank_name: null,
  bank_account_number: null,
  bank_account_name: null,
  payment_display: "qr",
  require_otp: true,
  ...over,
});

const withHost = (data: unknown) => signIn(mocks, { tables: { hosts: { data } } });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  withHost(row());
});

describe("GET /api/host/profile", () => {
  it("returns the profile with contact details masked", async () => {
    const { status, body } = await readJson(await GET());

    expect(status).toBe(200);
    expect(body).toMatchObject({
      id: "host-1",
      name: "Somchai",
      masked: {
        email: "s***@example.com",
        phone: "08x-xxx-x678",
        promptpay_id: "x-xxxx-xx678",
      },
      hasPhone: true,
      hasPromptpay: true,
      hasPinSet: false,
      hasLineToken: false,
    });
  });

  it("never returns the raw email, phone or PromptPay id", async () => {
    const serialised = JSON.stringify((await readJson(await GET())).body);
    expect(serialised).not.toContain("somchai@example.com");
    expect(serialised).not.toContain("0812345678");
  });

  it("masks an email with no domain and a very short phone or PromptPay id", async () => {
    withHost(row({ email: "broken", phone: "12", promptpay_id: "3" }));
    const { body } = await readJson(await GET());

    expect(body).toMatchObject({ masked: { email: "***", phone: "***", promptpay_id: "***" } });
  });

  it("reports empty masks when there is no phone or PromptPay id", async () => {
    withHost(row({ phone: null, promptpay_id: null }));
    const { body } = await readJson(await GET());

    expect(body).toMatchObject({ masked: { phone: "", promptpay_id: "" }, hasPhone: false, hasPromptpay: false });
  });

  it("shows only the tail of a connected LINE token", async () => {
    withHost(row({ line_channel_access_token: "super-secret-token-ABCD", line_user_id: "U1" }));
    const { body } = await readJson(await GET());

    expect(body).toMatchObject({ line_token_tail: "ABCD", hasLineToken: true, line_user_id: "U1" });
    expect(JSON.stringify(body)).not.toContain("super-secret-token");
  });

  it("reports that a security PIN is set without revealing it", async () => {
    withHost(row({ security_pin_hash: "$2a$10$hashed" }));
    const { body } = await readJson(await GET());

    expect(body).toMatchObject({ hasPinSet: true });
    expect(JSON.stringify(body)).not.toContain("hashed");
  });

  it("defaults the notification channel, payment display and OTP preference", async () => {
    withHost(row({ notification_preference: null, payment_display: null, require_otp: null }));
    const { body } = await readJson(await GET());

    expect(body).toMatchObject({ notification_preference: "sms", payment_display: "qr", require_otp: true });
  });

  it("respects an explicit opt-out of OTP", async () => {
    withHost(row({ require_otp: false }));
    expect((await readJson(await GET())).body).toMatchObject({ require_otp: false });
  });

  it("refuses an anonymous caller", async () => {
    signOut(mocks);
    await expect(readJson(await GET())).resolves.toEqual({ status: 401, body: { error: "Unauthorized" } });
  });

  it("reports 404 when the signed-in user is not a host", async () => {
    withHost(null);
    await expect(readJson(await GET())).resolves.toEqual({ status: 404, body: { error: "Host not found" } });
  });

  it("reports 500 when something unexpected throws", async () => {
    mocks.createServerSupabaseClient.mockRejectedValue(new Error("no database"));
    await expect(readJson(await GET())).resolves.toEqual({
      status: 500,
      body: { error: "Internal server error" },
    });
  });
});
