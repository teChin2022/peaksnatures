import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type QueryResponse } from "../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../test/helpers/request";
import { FALLBACK_REPLY, type ModelReply } from "@/lib/guest-ai/rules";

const h = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  verifyTurnstileToken: vi.fn(),
  askGuestAi: vi.fn(),
  hostBlockStateFrom: vi.fn(),
  notifyHostAlert: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    h.afterCallbacks.push(cb);
  },
}));
vi.mock("@/lib/notifications", () => ({ notifyHostAlert: h.notifyHostAlert }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken: h.verifyTurnstileToken }));
vi.mock("@/lib/guest-ai/model", () => ({ askGuestAi: h.askGuestAi }));
// billing.ts reaches next/headers and ioredis; only these two are used here.
vi.mock("@/lib/billing", () => ({
  HOST_BLOCK_COLUMNS: "plan_type, plan_free_expires_at, wallet_balance, wallet_credit_limit, wallet_negative_since",
  hostBlockStateFrom: h.hostBlockStateFrom,
}));

import { POST } from "./route";

const SESSION = "5f0b6f0e-1111-4111-8111-111111111111";
const HOST = {
  id: "host-1",
  status: "approved",
  phone: "099-000-1234",
  plan_type: "commission",
  plan_free_expires_at: null,
  wallet_balance: 500,
  wallet_credit_limit: 0,
  wallet_negative_since: null,
};
const HOMESTAY = {
  id: "hs-1",
  name: "ม่อนเงาะ",
  location: "เชียงใหม่",
  description: "<p>วิวทะเลหมอก</p>",
  amenities: ["ที่จอดรถ"],
  prohibitions: [],
  check_in_time: "14:00",
  check_out_time: "11:00",
  check_in_info: null,
  policies: null,
  faq: [],
  host: HOST,
};
const SETTINGS = {
  status: "approved",
  enabled: true,
  can_answer: true,
  can_set_dates: true,
  can_suggest_houses: true,
  can_navigate: true,
  instructions: "จอดรถ 3 คัน",
};
const ROOMS = [{ id: "r1", name: "บ้าน A", description: null, max_guests: 5, quantity: 1 }];
const MODEL: ModelReply = {
  reply: "เลือกวันให้แล้วค่ะ",
  answered: true,
  intent: { check_in: "2026-11-28", check_out: "2026-11-29", guests: 4, room_ids: ["r1", "not-ours"] },
  action: null,
};

function wire(
  over: { homestay?: unknown; settings?: unknown; reserve?: QueryResponse; session?: QueryResponse; claim?: QueryResponse } = {},
) {
  const sc = createSupabaseMock({
    tables: {
      homestays: { data: over.homestay === undefined ? HOMESTAY : over.homestay },
      // The settings read, then (wallet notice) the claim of the notice timestamp.
      host_ai_settings: [{ data: over.settings === undefined ? SETTINGS : over.settings }, over.claim ?? { data: { host_id: "host-1" } }],
      hosts: { data: { phone: "0800000000", email: "h@example.test", notification_preference: "line", line_channel_access_token: "t", line_user_id: "U" } },
      guest_ai_sessions: over.session ?? { data: { id: SESSION } },
      rooms: { data: ROOMS },
    },
    rpc: { reserve_guest_ai_reply: over.reserve ?? { data: "ok" }, release_guest_ai_reply: { data: null } },
  });
  h.createServiceRoleClient.mockReturnValue(sc);
  return sc;
}

const body = (over: Record<string, unknown> = {}) => ({ slug: "ing", question: "เสาร์อาทิตย์หน้า 4 คน", locale: "th", ...over });
const post = (b: unknown, cookie?: string) =>
  POST(makeRequest("/api/guest-ai", { body: b, headers: cookie ? { cookie } : {}, ip: `10.0.0.${Math.floor(Math.random() * 250)}` }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-19T03:00:00Z")); // 10:00 in Bangkok
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  h.verifyTurnstileToken.mockReset().mockResolvedValue("pass");
  h.notifyHostAlert.mockReset().mockResolvedValue({ success: true, channel: "line" });
  h.afterCallbacks.length = 0;
  h.askGuestAi.mockReset().mockResolvedValue(MODEL);
  h.hostBlockStateFrom.mockReset().mockResolvedValue({
    plan_type: "commission",
    plan_free_expires_at: null,
    wallet_balance: 500,
    wallet_credit_limit: 0,
    wallet_negative_since: null,
    has_past_due_invoice: false,
  });
});

describe("POST /api/guest-ai", () => {
  it("starts a session after Turnstile, counts the reply, and answers with a checked intent", async () => {
    const sc = wire();
    const res = await post(body({ turnstileToken: "tok" }));

    await expect(readJson(res.clone())).resolves.toEqual({
      status: 200,
      body: {
        reply: "เลือกวันให้แล้วค่ะ",
        answered: true,
        // Another homestay's house id is dropped (F-08).
        intent: { check_in: "2026-11-28", check_out: "2026-11-29", guests: 4, room_ids: ["r1"] },
        action: null,
      },
    });
    expect(sc.builderFor("guest_ai_sessions").insert).toHaveBeenCalledWith({ host_id: "host-1", homestay_id: "hs-1", reply_cap: 20 });
    // A Commission host keeps ฿300 for commissions (D9).
    expect(sc.rpc).toHaveBeenCalledWith("reserve_guest_ai_reply", {
      p_session: SESSION,
      p_host: "host-1",
      p_day: "2026-11-19",
      p_floor: 300,
    });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`pn_guest_ai=${SESSION}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toContain("Path=/api/guest-ai");

    const [system, prompt] = h.askGuestAi.mock.calls[0];
    expect(system).toContain("2026-11-19 (Thursday)");
    expect(prompt).toContain("จอดรถ 3 คัน");
    // Rich text reaches the model as plain text.
    expect(prompt).toContain("วิวทะเลหมอก");
    expect(prompt).not.toContain("<p>");
  });

  it("never sends payment details or reviews to the model (F-03 / F-10)", async () => {
    const sc = wire();
    await post(body({ turnstileToken: "tok" }));
    const select = sc.builderFor("homestays").select as ReturnType<typeof vi.fn>;
    const columns = select.mock.calls[0][0] as string;
    expect(columns).not.toMatch(/promptpay|bank_|deposit|review|line_channel|pin/);
    expect(columns).not.toContain("*");
    expect(sc.calls.map((c) => c.table)).not.toContain("reviews");
  });

  it("refuses a first question without a Turnstile token (F-01), before any count or model call", async () => {
    const sc = wire();
    await expect(readJson(await post(body()))).resolves.toEqual({ status: 401, body: { code: "verify" } });
    expect(h.verifyTurnstileToken).not.toHaveBeenCalled();
    expect(sc.rpc).not.toHaveBeenCalled();
    expect(h.askGuestAi).not.toHaveBeenCalled();
  });

  it("refuses a failed Turnstile check", async () => {
    wire();
    h.verifyTurnstileToken.mockResolvedValue("fail");
    expect((await post(body({ turnstileToken: "bad" }))).status).toBe(401);
    expect(h.askGuestAi).not.toHaveBeenCalled();
  });

  it("gives a small session when Cloudflare could not be reached", async () => {
    const sc = wire();
    h.verifyTurnstileToken.mockResolvedValue("skip");
    expect((await post(body({ turnstileToken: "tok" }))).status).toBe(200);
    expect(sc.builderFor("guest_ai_sessions").insert).toHaveBeenCalledWith(expect.objectContaining({ reply_cap: 5 }));
  });

  it("reuses the session cookie without Turnstile", async () => {
    const sc = wire();
    const res = await post(body(), `pn_guest_ai=${SESSION}`);
    expect(res.status).toBe(200);
    expect(h.verifyTurnstileToken).not.toHaveBeenCalled();
    expect(sc.calls.map((c) => c.table)).not.toContain("guest_ai_sessions");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("treats a malformed cookie as no session", async () => {
    wire();
    expect((await post(body(), "pn_guest_ai=not-a-uuid")).status).toBe(401);
  });

  it.each([
    ["host_cap", 429, "limit"],
    ["platform_cap", 429, "limit"],
    ["platform_off", 503, "unavailable"],
    ["host_off", 503, "unavailable"],
  ])("stops at %s before the model runs", async (refusal, status, code) => {
    wire({ reserve: { data: refusal } });
    await expect(readJson(await post(body(), `pn_guest_ai=${SESSION}`))).resolves.toEqual({ status, body: { code } });
    expect(h.askGuestAi).not.toHaveBeenCalled();
  });

  it("drops a dead session so the next question goes through Turnstile again", async () => {
    wire({ reserve: { data: "session_invalid" } });
    const res = await post(body(), `pn_guest_ai=${SESSION}`);
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toMatch(/pn_guest_ai=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i);
  });

  it("gives the reply back when the model fails", async () => {
    const sc = wire();
    h.askGuestAi.mockRejectedValue(new Error("timeout"));
    await expect(readJson(await post(body(), `pn_guest_ai=${SESSION}`))).resolves.toEqual({ status: 502, body: { code: "failed" } });
    expect(sc.rpc).toHaveBeenCalledWith("release_guest_ai_reply", { p_session: SESSION, p_host: "host-1", p_day: "2026-11-19" });
  });

  it("withholds a reply with an account number (F-03)", async () => {
    wire();
    h.askGuestAi.mockResolvedValue({ ...MODEL, reply: "โอนมัดจำเข้า 123-4-56789-0 นะคะ" });
    const { body: got } = await readJson(await post(body(), `pn_guest_ai=${SESSION}`));
    expect(got).toEqual({ reply: FALLBACK_REPLY.th, answered: false, intent: null, action: "contact" });
  });

  it("keeps what the host turned off out of the answer", async () => {
    wire({ settings: { ...SETTINGS, can_suggest_houses: false, can_navigate: false } });
    h.askGuestAi.mockResolvedValue({ ...MODEL, action: "contact" });
    const { body: got } = await readJson(await post(body(), `pn_guest_ai=${SESSION}`));
    expect(got).toMatchObject({ intent: { room_ids: [] }, action: null });
    expect(h.askGuestAi.mock.calls[0][0]).not.toContain("intent.room_ids");
  });

  it.each([
    ["no such homestay", { homestay: null }],
    ["a host not approved on the platform", { homestay: { ...HOMESTAY, host: { ...HOST, status: "pending" } } }],
    ["the assistant not approved", { settings: { ...SETTINGS, status: "requested" } }],
    ["the host's switch off", { settings: { ...SETTINGS, enabled: false } }],
    ["no assistant row", { settings: null }],
  ])("answers 404 for %s, counting nothing", async (_, over) => {
    const sc = wire(over);
    await expect(readJson(await post(body({ turnstileToken: "tok" })))).resolves.toEqual({ status: 404, body: { code: "unavailable" } });
    expect(sc.rpc).not.toHaveBeenCalled();
  });

  it("answers 404 while the host's bookings are blocked", async () => {
    const sc = wire();
    h.hostBlockStateFrom.mockResolvedValue({
      plan_type: "free",
      plan_free_expires_at: "2026-10-01",
      wallet_balance: 0,
      wallet_credit_limit: 0,
      wallet_negative_since: null,
      has_past_due_invoice: false,
    });
    expect((await post(body({ turnstileToken: "tok" }))).status).toBe(404);
    expect(sc.rpc).not.toHaveBeenCalled();
  });

  it.each([[{ ...body(), question: "" }], [{ ...body(), host_id: "x" }], ["nope"]])("answers 400 to %j", async (b) => {
    const sc = wire();
    expect((await post(b)).status).toBe(400);
    expect(sc.calls).toHaveLength(0);
  });

  it("answers 500 when the count fails, without calling the model", async () => {
    wire({ reserve: { error: { message: "db down" } } });
    expect((await post(body(), `pn_guest_ai=${SESSION}`)).status).toBe(500);
    expect(h.askGuestAi).not.toHaveBeenCalled();
  });

  it("lets other plans spend the wallet down to zero (D9)", async () => {
    const sc = wire({ homestay: { ...HOMESTAY, host: { ...HOST, plan_type: "fixed_rate" } } });
    await post(body(), `pn_guest_ai=${SESSION}`);
    expect(sc.rpc).toHaveBeenCalledWith("reserve_guest_ai_reply", expect.objectContaining({ p_floor: 0 }));
  });

  it("stops at the wallet floor before the model, and tells the host once", async () => {
    const sc = wire({ reserve: { data: "wallet_low" } });
    await expect(readJson(await post(body(), `pn_guest_ai=${SESSION}`))).resolves.toEqual({ status: 503, body: { code: "unavailable" } });
    expect(h.askGuestAi).not.toHaveBeenCalled();
    for (const cb of h.afterCallbacks.splice(0)) await cb();
    // The notice timestamp is claimed first, so racing guests send one notice.
    const claim = sc.builderFor("host_ai_settings", 1);
    expect(claim.update).toHaveBeenCalledWith({ wallet_low_notified_at: expect.any(String) });
    expect(claim.or).toHaveBeenCalledWith(expect.stringContaining("wallet_low_notified_at.is.null"));
    expect(h.notifyHostAlert).toHaveBeenCalledWith(expect.objectContaining({ line_user_id: "U" }), expect.stringContaining("เติมเงิน"), expect.any(String));
  });

  it("does not notify again within a day", async () => {
    wire({ reserve: { data: "wallet_low" }, settings: { ...SETTINGS, wallet_low_notified_at: "2026-11-19T01:00:00Z" } });
    expect((await post(body(), `pn_guest_ai=${SESSION}`)).status).toBe(503);
    expect(h.afterCallbacks).toHaveLength(0);
  });

  it("sends nothing when another request already claimed the notice", async () => {
    wire({ reserve: { data: "wallet_low" }, claim: { data: null } });
    await post(body(), `pn_guest_ai=${SESSION}`);
    for (const cb of h.afterCallbacks.splice(0)) await cb();
    expect(h.notifyHostAlert).not.toHaveBeenCalled();
  });
});
