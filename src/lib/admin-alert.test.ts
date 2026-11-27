import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "../../test/helpers/supabase";

const h = vi.hoisted(() => ({
  supabase: null as unknown as SupabaseMock,
  redis: null as null | { set: ReturnType<typeof vi.fn> },
  sendSms: vi.fn<(phone: string, text: string) => Promise<{ success: boolean }>>(() => Promise.resolve({ success: true })),
}));
vi.mock("@/lib/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications")>()),
  sendSms: h.sendSms,
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
  h.sendSms.mockClear();
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

describe("notifyPlatformPayment", () => {
  const payment = {
    kind: "plan_activation" as const,
    hostName: "บ้านดอย",
    hostId: "host-1",
    amount: 940,
    transRef: "0123ABC",
    receiver: {
      bank: { id: "030", name: "GSB", short: "GSB" },
      account: { name: { th: "นาย ทดสอบ ผู้รับ" }, proxy: { type: "MSISDN", account: "09xxxx5198" } },
    },
    receiverUnverified: false,
  };

  beforeEach(() => {
    h.supabase = createSupabaseMock({
      tables: {
        platform_admins: {
          data: ADMINS.map((a, i) => ({ ...a, phone: i === 1 ? null : `08100000${i}0` })),
        },
      },
    });
  });

  it("texts every admin with a phone and sends no LINE alert for a matched receiver", async () => {
    const { notifyPlatformPayment } = await load();
    await notifyPlatformPayment(payment);
    await notifyPlatformPayment(payment);

    expect(h.sendSms.mock.calls.map(([phone]) => phone)).toEqual(["0810000000", "0810000020", "0810000000", "0810000020"]);
    expect(h.sendSms).toHaveBeenCalledWith("0810000000", "Peaksnature รับ฿940 FixedRate บ้านดอย");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leads the SMS with the flag, keeps it to 70 chars and alerts LINE when the receiver did not match", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://peaksnature.com");
    const { notifyPlatformPayment } = await load();
    await notifyPlatformPayment({ ...payment, receiverUnverified: true, hostName: "บ้าน".repeat(30) });

    const text = h.sendSms.mock.calls[0][1];
    expect(text.startsWith("ตรวจบัญชีผู้รับ! Peaksnature รับ฿940 FixedRate")).toBe(true);
    expect(text.length).toBe(70);

    const line = pushes().filter((p) => p.body.to === "U-a").map((p) => p.body.messages[0].text);
    expect(line).toEqual([
      [
        "[test] ⚠️ รับชำระแล้ว แต่บัญชีผู้รับในสลิปไม่ตรงกับบัญชีแพลตฟอร์ม — ตรวจสอบสลิป",
        "ประเภท: เปิดใช้แผน Fixed Rate · ฿940",
        `โฮสต์: ${"บ้าน".repeat(30)} (host-1)`,
        "ผู้รับ: นาย ทดสอบ ผู้รับ · 09xxxx5198",
        "transRef: 0123ABC",
        "🔗 https://peaksnature.com/admin/logs",
      ].join("\n"),
    ]);
  });

  it("never throws when the admins cannot be read", async () => {
    h.supabase = createSupabaseMock({ tables: { platform_admins: { data: null, error: { message: "boom" } } } });
    const { notifyPlatformPayment } = await load();
    await expect(notifyPlatformPayment({ ...payment, receiverUnverified: true })).resolves.toBeUndefined();
    expect(h.sendSms).not.toHaveBeenCalled();
  });
});
