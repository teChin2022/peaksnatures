import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "../../test/helpers/supabase";

const h = vi.hoisted(() => ({
  supabase: null as unknown as SupabaseMock,
  redis: null as null | { set: ReturnType<typeof vi.fn> },
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => h.supabase }));
vi.mock("@/lib/redis", () => ({
  getReadyRedis: () => Promise.resolve(h.redis),
  getCacheEnvPrefix: () => "test",
}));

const LINE_ENDPOINT = "https://api.line.me/v2/bot/message/push";

const ADMINS = [
  { email: "a@x.test", line_user_id: "U-a", line_channel_access_token: "tok-a" },
  { email: "b@x.test", line_user_id: null, line_channel_access_token: null },
  { email: "c@x.test", line_user_id: "U-c", line_channel_access_token: "tok-c" },
];

let fetchMock: ReturnType<typeof vi.fn>;

/** Fresh module per test: the in-memory throttle is module state. */
const load = async () => {
  vi.resetModules();
  return import("@/lib/admin-alert");
};

const pushes = () =>
  fetchMock.mock.calls.map(([url, init]) => {
    expect(url).toBe(LINE_ENDPOINT);
    const req = init as RequestInit;
    return {
      auth: (req.headers as Record<string, string>).Authorization,
      body: JSON.parse(req.body as string) as { to: string; messages: Array<{ text: string }> },
    };
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.supabase = createSupabaseMock({ tables: { platform_admins: { data: ADMINS } } });
  h.redis = null;
  fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("alertAdmins", () => {
  it("pushes to every admin with LINE set up, tagged with the environment", async () => {
    const { alertAdmins } = await load();
    await alertAdmins("⚠️ boom");

    expect(pushes()).toEqual([
      { auth: "Bearer tok-a", body: { to: "U-a", messages: [{ type: "text", text: "[test] ⚠️ boom" }] } },
      { auth: "Bearer tok-c", body: { to: "U-c", messages: [{ type: "text", text: "[test] ⚠️ boom" }] } },
    ]);
  });

  it("sends a throttled key once per 30 minutes, then again after", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T03:00:00Z"));
    const { alertAdmins } = await load();

    await alertAdmins("one", "sms:http_402");
    await alertAdmins("two", "sms:http_402");
    await alertAdmins("other kind", "sms:timeout");
    vi.setSystemTime(new Date("2026-11-16T03:29:59Z"));
    await alertAdmins("still quiet", "sms:http_402");
    vi.setSystemTime(new Date("2026-11-16T03:30:01Z"));
    await alertAdmins("three", "sms:http_402");

    expect(pushes().filter((p) => p.body.to === "U-a").map((p) => p.body.messages[0].text)).toEqual([
      "[test] one",
      "[test] other kind",
      "[test] three",
    ]);
  });

  it("throttles through Redis when it is there, so every instance shares the window", async () => {
    h.redis = { set: vi.fn().mockResolvedValueOnce("OK").mockResolvedValueOnce(null) };
    const { alertAdmins } = await load();

    await alertAdmins("one", "easyslip:QUOTA_EXCEEDED");
    await alertAdmins("two", "easyslip:QUOTA_EXCEEDED");

    expect(h.redis.set).toHaveBeenCalledWith(
      "test:admin-alert:easyslip:QUOTA_EXCEEDED",
      "1",
      "PX",
      30 * 60 * 1000,
      "NX",
    );
    expect(pushes()).toHaveLength(2); // "one" to both admins, "two" to nobody
  });

  it("never throttles without a key", async () => {
    const { alertAdmins } = await load();
    await alertAdmins("one");
    await alertAdmins("one");
    expect(pushes()).toHaveLength(4);
  });

  it("never throws when the admins cannot be read or LINE fails", async () => {
    const { alertAdmins } = await load();

    h.supabase = createSupabaseMock({ tables: { platform_admins: { error: { message: "down" } } } });
    await expect(alertAdmins("x")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();

    h.supabase = createSupabaseMock({ tables: { platform_admins: { data: ADMINS } } });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    await expect(alertAdmins("x")).resolves.toBeUndefined();
  });
});

describe("alertStrandedPayment", () => {
  it("names the payment, the host and both amounts, links the log and is never throttled", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://peaksnature.com");
    const { alertStrandedPayment } = await load();
    const payment = {
      kind: "wallet_topup" as const,
      reason: "amount_mismatch",
      hostName: "บ้านดอย",
      hostId: "host-1",
      expectedAmount: 1500,
      slipAmount: 50,
      transRef: "0123ABC",
    };

    await alertStrandedPayment(payment);
    await alertStrandedPayment(payment);

    const texts = pushes().filter((p) => p.body.to === "U-a").map((p) => p.body.messages[0].text);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toBe(
      [
        "[test] 💸 สลิปถูกปฏิเสธหลังผ่าน EasySlip — ต้องเคลียร์ด้วยมือ",
        "ประเภท: เติมเงิน wallet · เหตุผล: amount_mismatch",
        "โฮสต์: บ้านดอย (host-1)",
        "คาด ฿1,500 / สลิป ฿50",
        "transRef: 0123ABC",
        "🔗 https://peaksnature.com/admin/logs",
      ].join("\n"),
    );
  });
});
