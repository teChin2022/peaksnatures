import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchHostNotification,
  notifyHostAlert,
  sendDateChangeSmsNotification,
  sendHostCancellationSmsNotification,
  sendHostSmsNotification,
  sendSms,
} from "@/lib/notifications";
import { makeBooking, makeHomestay, makeHost, makeRoom } from "../../test/fixtures/db";
import type { Booking, Host } from "@/types/database";

const { resendSend } = vi.hoisted(() => ({ resendSend: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

const SMS_ENDPOINT = "https://console.sms-kub.com/api/messages";
const LINE_ENDPOINT = "https://api.line.me/v2/bot/message/push";

const okResponse = (body: unknown = { id: "1" }) =>
  ({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) }) as unknown as Response;
const errResponse = (status: number, body = "nope") =>
  ({ ok: false, status, text: () => Promise.resolve(body) }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

const details = (booking: Partial<Booking> = {}, host: Partial<Host> = {}) => ({
  booking: makeBooking(booking),
  homestay: makeHomestay(),
  host: makeHost(host),
  room: makeRoom(),
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("SMS_KUB_API_KEY", "sms-key");
  vi.stubEnv("SMS_KUB_SENDER", "Peaksnature");
  vi.stubEnv("RESEND_API_KEY", "resend-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "");
  fetchMock = vi.fn(() => Promise.resolve(okResponse()));
  vi.stubGlobal("fetch", fetchMock);
  resendSend.mockResolvedValue({ id: "email-1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("sendSms", () => {
  it("posts the message to the gateway with the API key", async () => {
    await expect(sendSms("0812345678", "hello")).resolves.toEqual({ success: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SMS_ENDPOINT);
    expect((init.headers as Record<string, string>).key).toBe("sms-key");
    expect(JSON.parse(init.body as string)).toEqual({
      to: ["0812345678"],
      from: "Peaksnature",
      message: "hello",
    });
  });

  it("normalises a phone number the gateway would reject", async () => {
    await sendSms("+66 81-234-5678", "hi");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).to).toEqual(["66812345678"]);
  });

  it("uses the default sender when none is configured", async () => {
    vi.stubEnv("SMS_KUB_SENDER", "");
    await sendSms("0812345678", "hi");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).from).toBe("Peaksnature");
  });

  it("fails without sending when no API key is configured", async () => {
    vi.stubEnv("SMS_KUB_API_KEY", "");
    await expect(sendSms("0812345678", "hi")).resolves.toEqual({
      success: false,
      error: "SMS API key not configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails without sending when the number has no digits", async () => {
    await expect(sendSms("not-a-number", "hi")).resolves.toEqual({
      success: false,
      error: "Invalid phone number",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a gateway rejection with its status and parsed body", async () => {
    fetchMock.mockResolvedValue(errResponse(402, JSON.stringify({ reason: "no credit" })));
    await expect(sendSms("0812345678", "hi")).resolves.toEqual({
      success: false,
      error: { status: 402, body: { reason: "no credit" } },
    });
  });

  it("keeps a non-JSON error body as raw text", async () => {
    fetchMock.mockResolvedValue(errResponse(500, "Internal Server Error"));
    await expect(sendSms("0812345678", "hi")).resolves.toEqual({
      success: false,
      error: { status: 500, body: "Internal Server Error" },
    });
  });

  it("returns a failure rather than throwing when the network drops", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const result = await sendSms("0812345678", "hi");
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(TypeError);
  });

  it("survives a body that cannot be read", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.reject(new Error("stream closed")),
    } as unknown as Response);
    await expect(sendSms("0812345678", "hi")).resolves.toEqual({ success: true });
  });
});

describe("host booking SMS", () => {
  it("packs the booking into a single segment", async () => {
    await sendHostSmsNotification(details());

    const message = JSON.parse(fetchMock.mock.calls[0][1].body as string).message;
    expect(message).toContain("จองใหม่");
    expect(message).toContain("Nok Suwan");
    expect(message).toContain("2คืน");
    expect(message).toContain("ยืนยันแล้ว");
    expect(message.length).toBeLessThanOrEqual(70);
  });

  it("marks an unverified booking as awaiting review", async () => {
    await sendHostSmsNotification(details(), "flagged");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).message).toContain("รอตรวจสอบ");
  });

  it("shows the deposit rather than the total for a deposit booking", async () => {
    await sendHostSmsNotification(details({ payment_type: "deposit", amount_paid: 500 }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).message).toContain("มัดจำ ฿500");
  });

  it("does nothing when the host has no phone number", async () => {
    await expect(sendHostSmsNotification(details({}, { phone: null }))).resolves.toEqual({
      success: false,
      error: "Host phone not set",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a cancellation with the refund amount", async () => {
    await sendHostCancellationSmsNotification(details({ amount_paid: 2000 }));
    const message = JSON.parse(fetchMock.mock.calls[0][1].body as string).message;
    expect(message).toContain("ยกเลิก");
    expect(message).toContain("คืนเงิน฿2,000");
  });

  it("does not send a cancellation SMS without a phone number", async () => {
    await expect(sendHostCancellationSmsNotification(details({}, { phone: null }))).resolves.toEqual({
      success: false,
      error: "Host phone not set",
    });
  });

  it("contrasts the old and new stay in a date-change SMS", async () => {
    await sendDateChangeSmsNotification(
      details(), "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 1000, 3000,
    );

    const message = JSON.parse(fetchMock.mock.calls[0][1].body as string).message;
    expect(message).toContain("ขอเปลี่ยน");
    expect(message).toContain("2คืน");
    expect(message).toContain("3คืน");
    expect(message).toContain("รออนุมัติ");
    // Date changes get a longer allowance than a single segment.
    expect(message.length).toBeLessThanOrEqual(134);
  });

  it("names both houses when the guest also wants to move room", async () => {
    await sendDateChangeSmsNotification(
      details(), "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 0, 2000, "Oak House",
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).message).toContain("Pine House>Oak House");
  });

  it("does not send a date-change SMS without a phone number", async () => {
    await expect(
      sendDateChangeSmsNotification(
        details({}, { phone: null }), "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 0, 2000,
      ),
    ).resolves.toEqual({ success: false, error: "Host phone not set" });
  });
});

describe("dispatchHostNotification", () => {
  const run = (host: Partial<Host>, sms: () => Promise<{ success: boolean }>, line: () => Promise<{ success: boolean }>) =>
    dispatchHostNotification(details({}, host), sms, line, "New booking", () => "body text");

  it("uses SMS by default", async () => {
    const sms = vi.fn().mockResolvedValue({ success: true });
    const line = vi.fn().mockResolvedValue({ success: true });

    await run({}, sms, line);

    expect(sms).toHaveBeenCalledTimes(1);
    expect(line).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("uses LINE when the host prefers it", async () => {
    const sms = vi.fn().mockResolvedValue({ success: true });
    const line = vi.fn().mockResolvedValue({ success: true });

    await run({ notification_preference: "line" }, sms, line);

    expect(line).toHaveBeenCalledTimes(1);
    expect(sms).not.toHaveBeenCalled();
  });

  it("retries the preferred channel three times before giving up", async () => {
    vi.useFakeTimers();
    const sms = vi.fn().mockResolvedValue({ success: false });
    const line = vi.fn();

    const promise = run({}, sms, line);
    await vi.advanceTimersByTimeAsync(2000); // 500ms + 1000ms of back-off
    await promise;

    expect(sms).toHaveBeenCalledTimes(3);
  });

  it("stops retrying as soon as the channel succeeds", async () => {
    vi.useFakeTimers();
    const sms = vi.fn().mockResolvedValueOnce({ success: false }).mockResolvedValue({ success: true });

    const promise = run({}, sms, vi.fn());
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(sms).toHaveBeenCalledTimes(2);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("falls back to email once the preferred channel is exhausted", async () => {
    vi.useFakeTimers();
    const sms = vi.fn().mockResolvedValue({ success: false });

    const promise = run({}, sms, vi.fn());
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["host@peaksnature.com"], subject: "New booking", text: "body text" }),
    );
  });

  it("logs when even the email fallback fails", async () => {
    vi.useFakeTimers();
    resendSend.mockRejectedValue(new Error("resend down"));
    const sms = vi.fn().mockResolvedValue({ success: false });

    const promise = run({}, sms, vi.fn());
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(console.error).toHaveBeenCalledWith("[Notification] Email fallback also failed");
  });

  it("skips the email fallback when the host has no email or no API key", async () => {
    vi.useFakeTimers();
    const sms = vi.fn().mockResolvedValue({ success: false });

    const noEmail = run({ email: "" }, sms, vi.fn());
    await vi.advanceTimersByTimeAsync(2000);
    await noEmail;
    expect(resendSend).not.toHaveBeenCalled();

    vi.stubEnv("RESEND_API_KEY", "");
    const noKey = run({}, sms, vi.fn());
    await vi.advanceTimersByTimeAsync(2000);
    await noKey;
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("strips quotes from a configured from-address", async () => {
    vi.useFakeTimers();
    vi.stubEnv("RESEND_FROM_EMAIL", `"Peaks" <book @peaksnature.com>`);
    const sms = vi.fn().mockResolvedValue({ success: false });

    const promise = run({}, sms, vi.fn());
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Peaks <book@peaksnature.com>" }),
    );
  });
});

describe("notifyHostAlert", () => {
  const host = (over: Partial<Parameters<typeof notifyHostAlert>[0]> = {}) => ({
    phone: "0812345678",
    email: "host@peaksnature.com",
    notification_preference: "sms",
    line_channel_access_token: null,
    line_user_id: null,
    ...over,
  });

  const lineHost = () =>
    host({ notification_preference: "line", line_channel_access_token: "line-token", line_user_id: "U123" });

  it("pushes to LINE when the host prefers it and it is configured", async () => {
    const result = await notifyHostAlert(lineHost(), "short", "Subject", "the full text");

    expect(result).toEqual({ success: true, channel: "line" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(LINE_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer line-token");
    expect(JSON.parse(init.body as string)).toEqual({
      to: "U123",
      messages: [{ type: "text", text: "the full text" }],
    });
  });

  it("sends the SMS text over LINE when no long form is supplied", async () => {
    await notifyHostAlert(lineHost(), "short", "Subject");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0].text).toBe("short");
  });

  it("falls back to SMS when the LINE push is rejected", async () => {
    fetchMock.mockResolvedValueOnce(errResponse(401)).mockResolvedValue(okResponse());

    await expect(notifyHostAlert(lineHost(), "short", "Subject")).resolves.toEqual({
      success: true,
      channel: "sms",
    });
    expect(fetchMock.mock.calls[1][0]).toBe(SMS_ENDPOINT);
  });

  it("falls back to SMS when the LINE push throws", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValue(okResponse());

    await expect(notifyHostAlert(lineHost(), "short", "Subject")).resolves.toEqual({
      success: true,
      channel: "sms",
    });
  });

  it("skips LINE when the host prefers it but has not connected it", async () => {
    const partial = host({ notification_preference: "line", line_channel_access_token: "token", line_user_id: null });

    await expect(notifyHostAlert(partial, "short", "Subject")).resolves.toEqual({
      success: true,
      channel: "sms",
    });
    expect(fetchMock.mock.calls[0][0]).toBe(SMS_ENDPOINT);
  });

  it("truncates the SMS so the gateway cannot silently drop it", async () => {
    await notifyHostAlert(host(), "x".repeat(200), "Subject");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).message).toHaveLength(70);
  });

  it("falls back to email when the SMS fails", async () => {
    fetchMock.mockResolvedValue(errResponse(402));

    await expect(notifyHostAlert(host(), "short", "Subject", "long text")).resolves.toEqual({
      success: true,
      channel: "email",
    });
    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["host@peaksnature.com"], subject: "Subject", text: "long text" }),
    );
  });

  it("goes straight to email when the host has no phone", async () => {
    await expect(notifyHostAlert(host({ phone: null }), "short", "Subject")).resolves.toEqual({
      success: true,
      channel: "email",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives up when there is no channel left to try", async () => {
    await expect(
      notifyHostAlert(host({ phone: null, email: null }), "short", "Subject"),
    ).resolves.toEqual({ success: false, channel: null });
  });

  it("gives up when email is the only option but Resend is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(notifyHostAlert(host({ phone: null }), "short", "Subject")).resolves.toEqual({
      success: false,
      channel: null,
    });
    expect(console.warn).toHaveBeenCalled();
  });

  it("gives up when the email send throws", async () => {
    resendSend.mockRejectedValue(new Error("resend down"));
    await expect(notifyHostAlert(host({ phone: null }), "short", "Subject")).resolves.toEqual({
      success: false,
      channel: null,
    });
  });

  it("uses a configured from-address for the alert email", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", "Alerts <alerts@peaksnature.com>");
    await notifyHostAlert(host({ phone: null }), "short", "Subject");
    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Alerts <alerts@peaksnature.com>" }),
    );
  });
});
