import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGroupBookingMessage,
  dispatchGroupHostNotification,
  notifyAdminsNewHostRegistration,
  sendBookingConfirmationEmail,
  sendBookingStatusUpdateEmail,
  sendDateChangeEmailToGuest,
  sendDateChangeLineNotification,
  sendGroupBookingConfirmationEmail,
  sendGroupHostLineNotification,
  sendGroupHostSmsNotification,
  sendGroupQuickBookingEmail,
  sendQuickBookingEmail,
  sendHostApprovalEmail,
  sendHostCancellationLineNotification,
  sendHostLineNotification,
  sendHostRejectionEmail,
  sendRecommenderPromoUsedNotification,
  type GroupBookingDetails,
} from "@/lib/notifications";
import {
  makeBooking,
  makeBookingGroup,
  makeHomestay,
  makeHost,
  makePromoCode,
  makeRoom,
} from "../../test/fixtures/db";
import type { Booking, Host } from "@/types/database";
import { SITE_URL } from "@/lib/seo";

const { resendSend, localizeStrings, supabaseFrom } = vi.hoisted(() => ({
  resendSend: vi.fn(),
  localizeStrings: vi.fn(),
  supabaseFrom: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));
vi.mock("@/lib/translation/localize-strings", () => ({ localizeStrings }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: supabaseFrom }) }));

const LINE_ENDPOINT = "https://api.line.me/v2/bot/message/push";
const SMS_ENDPOINT = "https://console.sms-kub.com/api/messages";

const okResponse = () =>
  ({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve("{}") }) as unknown as Response;
const lineError = () =>
  ({ ok: false, status: 401, json: () => Promise.resolve({ message: "Invalid token" }) }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

const lineHost = (over: Partial<Host> = {}) =>
  makeHost({ line_channel_access_token: "line-token", line_user_id: "U123", ...over });

const details = (booking: Partial<Booking> = {}, host: Host = lineHost()) => ({
  booking: makeBooking(booking),
  homestay: makeHomestay(),
  host,
  room: makeRoom(),
});

const groupDetails = (over: Partial<GroupBookingDetails> = {}): GroupBookingDetails => ({
  group: makeBookingGroup(),
  homestay: makeHomestay(),
  host: lineHost(),
  items: [
    { booking: makeBooking({ id: "b-1", total_price: 2000 }), room: makeRoom({ name: "Pine House" }) },
    { booking: makeBooking({ id: "b-2", total_price: 2000 }), room: makeRoom({ id: "room-2", name: "Oak House" }) },
  ],
  ...over,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("RESEND_API_KEY", "resend-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "");
  vi.stubEnv("SMS_KUB_API_KEY", "sms-key");
  fetchMock = vi.fn(() => Promise.resolve(okResponse()));
  vi.stubGlobal("fetch", fetchMock);
  resendSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
  localizeStrings.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * Every Resend-backed email shares this contract, so assert it once per function.
 * `inspectsResendError` marks whether the function surfaces an error the Resend
 * API returns in its body (as opposed to only catching a thrown exception).
 */
function describeGuestEmail(
  name: string,
  send: () => Promise<unknown>,
  recipient: string,
  inspectsResendError = true,
) {
  describe(name, () => {
    it("sends through Resend to the guest", async () => {
      await expect(send()).resolves.toMatchObject({ success: true });
      expect(resendSend).toHaveBeenCalledWith(
        expect.objectContaining({ from: "Peaksnature <onboarding@resend.dev>" }),
      );
      const sent = resendSend.mock.calls[0][0] as { to: string | string[]; subject: string; html: string };
      expect(Array.isArray(sent.to) ? sent.to : [sent.to]).toContain(recipient);
      expect(sent.subject).toBeTruthy();
      expect(sent.html).toContain("<");
    });

    it("no-ops in demo mode when Resend is not configured", async () => {
      vi.stubEnv("RESEND_API_KEY", "");
      await expect(send()).resolves.toEqual({ success: true, demo: true });
      expect(resendSend).not.toHaveBeenCalled();
    });

    it(
      inspectsResendError
        ? "reports an error returned by Resend"
        : // KNOWN GAP: this sender ignores the error field Resend returns and only
          // catches thrown exceptions, so an API-level rejection reads as success.
          // Pinned deliberately and flagged for review.
          "reports success even when Resend returns an error in its body",
      async () => {
        resendSend.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
        await expect(send()).resolves.toMatchObject({ success: inspectsResendError ? false : true });
      },
    );

    it("reports an exception rather than throwing", async () => {
      resendSend.mockRejectedValue(new Error("network down"));
      await expect(send()).resolves.toMatchObject({ success: false });
    });
  });
}

describeGuestEmail(
  "sendBookingConfirmationEmail",
  () => sendBookingConfirmationEmail(details()),
  "guest@example.com",
);
describeGuestEmail(
  "sendBookingStatusUpdateEmail",
  () => sendBookingStatusUpdateEmail(details(), "confirmed"),
  "guest@example.com",
);
describeGuestEmail(
  "sendDateChangeEmailToGuest",
  () =>
    sendDateChangeEmailToGuest(details(), "approved", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3000),
  "guest@example.com",
);
describeGuestEmail(
  "sendHostApprovalEmail",
  () => sendHostApprovalEmail("new@host.com", "Somchai"),
  "new@host.com",
  false,
);
describeGuestEmail(
  "sendHostRejectionEmail",
  () => sendHostRejectionEmail("new@host.com", "Somchai"),
  "new@host.com",
  false,
);
describeGuestEmail(
  "sendGroupBookingConfirmationEmail",
  () => sendGroupBookingConfirmationEmail(groupDetails()),
  "guest@example.com",
);
describeGuestEmail("sendQuickBookingEmail", () => sendQuickBookingEmail(details()), "guest@example.com");
describeGuestEmail(
  "sendGroupQuickBookingEmail",
  () => sendGroupQuickBookingEmail(groupDetails()),
  "guest@example.com",
);

describe("guest quick booking email", () => {
  const sent = () => resendSend.mock.calls[0][0] as { subject: string; html: string };
  const withHomestay = (over: Parameters<typeof makeHomestay>[0], booking: Partial<Booking> = {}, host?: Host) => ({
    ...details(booking, host),
    homestay: makeHomestay(over),
  });

  it("tells the guest it is received and awaiting the host, never that it is confirmed", async () => {
    await sendQuickBookingEmail(details(), "th");
    const { subject, html } = sent();

    expect(subject).toContain("รอเจ้าของที่พักยืนยัน");
    expect(html).toContain("ได้รับการจองแล้ว — รอเจ้าของที่พักยืนยัน");
    expect(html).not.toContain("ได้รับการยืนยันแล้ว");
    expect(html).not.toContain("สลิปการชำระเงินไม่สามารถตรวจสอบอัตโนมัติได้");
  });

  it("shows the code the guest quotes in chat, the same one the host message prints", async () => {
    await sendQuickBookingEmail(details({ id: "3f2a9c1e-0000-4000-8000-123456789abc" }), "th");
    expect(sent().html).toContain("3f2a9c1e");
  });

  it("asks for the full amount as a transfer, not as paid", async () => {
    await sendQuickBookingEmail(details({ total_price: 2000 }), "th");
    const { html } = sent();
    expect(html).toContain("ยอดที่ต้องโอน");
    expect(html).toContain("฿2,000");
    expect(html).not.toContain("ยอดที่ชำระ");
    expect(html).not.toContain("ยอดค้างชำระ");
  });

  it("asks for the deposit and shows the balance for a deposit booking", async () => {
    await sendQuickBookingEmail(details({ payment_type: "deposit", amount_paid: 500, total_price: 2000 }), "th");
    const { html } = sent();
    expect(html).toMatch(/ยอดที่ต้องโอน[\s\S]*฿500/);
    expect(html).toMatch(/ยอดค้างชำระ[\s\S]*฿1,500/);
  });

  it("shows the discount and prices the house before it", async () => {
    await sendQuickBookingEmail(details({ total_price: 1800, amount_paid: 1800, discount_amount: 200 }), "th");
    const { html } = sent();
    expect(html).toContain("−฿200");
    expect(html).toContain("฿2,000"); // the house row, before the discount
    expect(html).toContain("฿1,800"); // the total
  });

  describe("how the guest reaches the host", () => {
    it("links Messenger when the homestay has a Facebook page username", async () => {
      await sendQuickBookingEmail(withHomestay({ facebook_url: "https://www.facebook.com/ingkhoacamp" }), "th");
      const { html } = sent();
      expect(html).toContain('href="https://m.me/ingkhoacamp"');
      expect(html).toContain("ส่งสลิปทาง Messenger");
    });

    it("links the Facebook page when it is not a clean username", async () => {
      await sendQuickBookingEmail(
        withHomestay({ facebook_url: "https://www.facebook.com/pages/Ing-Khoa/123456789" }),
        "th",
      );
      const { html } = sent();
      expect(html).toContain('href="https://www.facebook.com/pages/Ing-Khoa/123456789"');
      expect(html).toContain("เปิดเพจ Facebook");
      expect(html).not.toContain("m.me");
    });

    it("also gives the host's phone number", async () => {
      await sendQuickBookingEmail(withHomestay({ facebook_url: "https://www.facebook.com/ingkhoacamp" }), "th");
      expect(sent().html).toContain("0812345678");
    });

    it("falls back to the host's phone when there is no usable Facebook link", async () => {
      await sendQuickBookingEmail(withHomestay({ facebook_url: "https://www.instagram.com/ingkhoacamp" }), "th");
      const { html } = sent();
      expect(html).not.toContain("m.me");
      expect(html).not.toContain("instagram.com");
      expect(html).toContain("หรือโทรหาเจ้าของที่พัก");
      expect(html).toContain("0812345678");
    });

    it("says the host will call when there is neither a link nor a phone", async () => {
      await sendQuickBookingEmail(withHomestay({ facebook_url: null }, {}, lineHost({ phone: null })), "th");
      expect(sent().html).toContain("เจ้าของที่พักจะติดต่อกลับทางเบอร์โทรที่คุณให้ไว้");
    });
  });

  it("escapes what the guest typed instead of putting it in the HTML", async () => {
    await sendQuickBookingEmail(details({ guest_name: "<script>alert(1)</script>" }), "th");
    const { html } = sent();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("writes it in English on request, and translates the homestay details", async () => {
    localizeStrings.mockResolvedValue({ homestayName: "Doi Inthanon Retreat (EN)", roomName: "Pine House (EN)" });
    await sendQuickBookingEmail(details(), "en");
    const { subject, html } = sent();

    expect(subject).toBe("Booking Received — Awaiting Host Confirmation — Doi Inthanon Retreat (EN)");
    expect(html).toContain("Booking code");
    expect(html).toContain("Amount to transfer");
    expect(html).toContain("Pine House (EN)");
    expect(localizeStrings).toHaveBeenCalledWith("email:homestay:homestay-1", expect.any(Object), "en");
  });

  it("does not call the translator for a Thai email", async () => {
    await sendQuickBookingEmail(details(), "th");
    expect(localizeStrings).not.toHaveBeenCalled();
  });

  it("sends from the configured address, with stray quotes and spaces cleaned out", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", '"Peaksnature <no-reply@peaks nature.com>"');
    await sendQuickBookingEmail(details(), "th");
    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Peaksnature <no-reply@peaksnature.com>" }),
    );
  });

  describe("for a cart", () => {
    it("lists every house under one code and one total", async () => {
      const cart = groupDetails();
      await sendGroupQuickBookingEmail(cart, "th");
      const { subject, html } = sent();

      expect(subject).toContain("รอเจ้าของที่พักยืนยัน");
      expect(html).toContain("Pine House");
      expect(html).toContain("Oak House");
      expect(html).toContain(cart.group.id.slice(0, 8));
      expect(html).toContain("บ้านพัก (2)");
      expect(html).toContain("฿4,000");
      expect(html).not.toContain("ยอดค้างชำระ");
    });

    it("asks for the deposit across the houses and shows the balance", async () => {
      const cart = groupDetails({
        items: [
          { booking: makeBooking({ id: "b-1", total_price: 2000, amount_paid: 500, payment_type: "deposit" }), room: makeRoom({ name: "Pine House" }) },
          { booking: makeBooking({ id: "b-2", total_price: 2000, amount_paid: 500, payment_type: "deposit" }), room: makeRoom({ id: "room-2", name: "Oak House" }) },
        ],
      });
      await sendGroupQuickBookingEmail(cart, "th");
      const { html } = sent();
      expect(html).toMatch(/ยอดที่ต้องโอน[\s\S]*฿1,000/);
      expect(html).toMatch(/ยอดค้างชำระ[\s\S]*฿3,000/);
    });

    it("links Messenger for the cart too", async () => {
      await sendGroupQuickBookingEmail(
        { ...groupDetails(), homestay: makeHomestay({ facebook_url: "https://www.facebook.com/ingkhoacamp" }) },
        "th",
      );
      expect(sent().html).toContain('href="https://m.me/ingkhoacamp"');
    });

    it("translates the cart's names only for English", async () => {
      await sendGroupQuickBookingEmail(groupDetails(), "th");
      expect(localizeStrings).not.toHaveBeenCalled();
      await sendGroupQuickBookingEmail(groupDetails(), "en");
      expect(localizeStrings).toHaveBeenCalledTimes(1);
    });
  });
});

describe("guest email content", () => {
  it("writes a Thai email by default and an English one on request", async () => {
    await sendBookingConfirmationEmail(details(), "th");
    const thai = resendSend.mock.calls[0][0] as { html: string };
    expect(thai.html).toContain("2569"); // Buddhist Era year

    resendSend.mockClear();
    await sendBookingConfirmationEmail(details(), "en");
    const english = resendSend.mock.calls[0][0] as { html: string };
    expect(english.html).toContain("2026");
  });

  it("translates homestay details for an English email", async () => {
    localizeStrings.mockResolvedValue({
      homestayName: "Doi Inthanon Retreat (EN)",
      homestayLocation: "Chiang Mai (EN)",
      roomName: "Pine House (EN)",
    });

    await sendBookingConfirmationEmail(details(), "en");

    expect(localizeStrings).toHaveBeenCalledWith("email:homestay:homestay-1", expect.any(Object), "en");
    expect((resendSend.mock.calls[0][0] as { html: string }).html).toContain("Doi Inthanon Retreat (EN)");
  });

  it("does not call the translator for a Thai email", async () => {
    await sendBookingConfirmationEmail(details(), "th");
    expect(localizeStrings).not.toHaveBeenCalled();
  });

  it("keeps the original text when a translation is missing", async () => {
    localizeStrings.mockResolvedValue({});
    await sendBookingConfirmationEmail(details(), "en");
    expect((resendSend.mock.calls[0][0] as { html: string }).html).toContain("Doi Inthanon Retreat");
  });

  it("lists the chosen extras with per-night and per-stay pricing", async () => {
    await sendBookingConfirmationEmail(
      details({
        selected_options: [
          { id: "a", name: "Breakfast", price: 500, unit_price: 250, pricing_type: "per_night" },
          { id: "b", name: "BBQ", price: 800, pricing_type: "per_time" },
          { id: "c", name: "Legacy", price: 100 },
        ],
      }),
    );

    const html = (resendSend.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain("Breakfast");
    expect(html).toContain("฿250");
    expect(html).toContain("BBQ");
    expect(html).toContain("Legacy");
  });

  it("distinguishes a pending booking from a confirmed one", async () => {
    await sendBookingConfirmationEmail(details(), "th", "pending");
    const pending = (resendSend.mock.calls[0][0] as { html: string }).html;
    expect(pending).toContain("ไม่สามารถตรวจสอบอัตโนมัติ");
  });

  it("explains a cancellation and its reason to the guest", async () => {
    await sendBookingStatusUpdateEmail(details(), "cancelled", "th", "ห้องไม่ว่างแล้ว");
    const html = (resendSend.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain("ห้องไม่ว่างแล้ว");
  });

  it("omits the reason block when the host gave none", async () => {
    await sendBookingStatusUpdateEmail(details(), "cancelled", "th");
    expect((resendSend.mock.calls[0][0] as { html: string }).html).not.toContain("เหตุผล:");
  });

  it("tells the guest their date change was rejected, with the reason", async () => {
    await sendDateChangeEmailToGuest(
      details(), "rejected", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3000, "th", "เต็มแล้ว",
    );
    expect((resendSend.mock.calls[0][0] as { html: string }).html).toContain("เต็มแล้ว");
  });

  it("mentions a room change and the payment breakdown when supplied", async () => {
    await sendDateChangeEmailToGuest(
      details(), "approved", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3500, "th",
      undefined,
      { oldRoomName: "Pine House", newRoomName: "Oak House" },
      "Oak House",
      {
        oldTotalPrice: 2000,
        priceDifference: 1500,
        amountPaid: 2000,
        additionalPayment: 1500,
        newAmountPaid: 3500,
        remainingBalance: 0,
      },
    );

    const html = (resendSend.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain("Oak House");
    expect(html).toContain("Pine House");
  });
});

describe("LINE host notifications", () => {
  const pushCases: Array<[string, () => Promise<{ success: boolean; error?: unknown }>]> = [
    ["sendHostLineNotification", () => sendHostLineNotification(details())],
    ["sendHostCancellationLineNotification", () => sendHostCancellationLineNotification(details())],
    [
      "sendDateChangeLineNotification",
      () =>
        sendDateChangeLineNotification(
          details(), "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 1000, 3000,
        ),
    ],
    ["sendGroupHostLineNotification", () => sendGroupHostLineNotification(groupDetails())],
  ];

  it.each(pushCases)("%s pushes to the host's LINE account", async (_name, send) => {
    await expect(send()).resolves.toEqual({ success: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(LINE_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer line-token");
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("U123");
    expect(body.messages[0].type).toBe("text");
    expect(body.messages[0].text).toBeTruthy();
  });

  it.each(pushCases)("%s reports a LINE rejection", async (_name, send) => {
    fetchMock.mockResolvedValue(lineError());
    await expect(send()).resolves.toMatchObject({ success: false });
  });

  it.each(pushCases)("%s reports a network failure rather than throwing", async (_name, send) => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(send()).resolves.toMatchObject({ success: false });
  });

  it("does not push when the host has not connected LINE", async () => {
    const noLine = makeHost({ line_channel_access_token: null, line_user_id: null });
    const expected = { success: false, error: "Host LINE credentials not configured" };

    await expect(sendHostLineNotification(details({}, noLine))).resolves.toEqual(expected);
    await expect(sendHostCancellationLineNotification(details({}, noLine))).resolves.toEqual(expected);
    await expect(
      sendGroupHostLineNotification(groupDetails({ host: noLine })),
    ).resolves.toEqual(expected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks an unverified booking as needing review in the LINE message", async () => {
    await sendHostLineNotification(details(), "flagged");
    const text = JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0].text;
    expect(text).toContain("รอตรวจสอบ");
  });

  it("tells the host a quick booking awaits their check, in the LINE message", async () => {
    await sendHostLineNotification(details(), "quick");
    const text = JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0].text;
    expect(text).toContain("จองด่วน — รอตรวจสลิป");
    expect(text).not.toContain("ยืนยันสลิปไม่สำเร็จ");
  });

  it("tells the host a quick cart awaits their check, in the LINE message", async () => {
    await sendGroupHostLineNotification(groupDetails(), "quick");
    const text = JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0].text;
    expect(text).toContain("จองด่วน (2 หลัง) — รอตรวจสลิป");
  });
});

describe("buildGroupBookingMessage", () => {
  it("summarises every house in the cart", () => {
    const message = buildGroupBookingMessage(groupDetails());

    expect(message).toContain("🎉 การจองใหม่ (2 หลัง) — ยืนยันแล้ว!");
    expect(message).toContain("Pine House");
    expect(message).toContain("Oak House");
    expect(message).toContain("Nok Suwan");
  });

  it("flags an unverified cart", () => {
    expect(buildGroupBookingMessage(groupDetails(), "flagged")).toContain("รอตรวจสอบ");
  });

  describe("a quick cart", () => {
    it("says it awaits the host and points to the chat, never that the slip failed or was paid", () => {
      const message = buildGroupBookingMessage(groupDetails(), "quick");
      expect(message).toContain("🕒 จองด่วน (2 หลัง) — รอตรวจสลิป");
      expect(message).toContain("Messenger");
      expect(message).not.toContain("ยืนยันสลิปไม่สำเร็จ");
      expect(message).not.toContain("ชำระเงินแล้ว");
    });

    it("asks for the whole amount as one transfer", () => {
      const message = buildGroupBookingMessage(
        groupDetails({ group: makeBookingGroup({ payment_type: "full", total_price: 4000 }) }),
        "quick",
      );
      expect(message).toContain("ยอดที่ต้องโอน: ฿4,000");
    });

    it("shows the deposit to transfer and the balance for a deposit cart", () => {
      const message = buildGroupBookingMessage(
        groupDetails({ group: makeBookingGroup({ payment_type: "deposit", amount_paid: 1000, total_price: 4000 }) }),
        "quick",
      );
      expect(message).toContain("ยอดที่ต้องโอน: ฿1,000 (มัดจำ)");
      expect(message).toContain("ยอดค้าง: ฿3,000");
      expect(message).not.toContain("ยอดที่ชำระ");
    });
  });

  it("shows the outstanding balance for a deposit cart", () => {
    const message = buildGroupBookingMessage(
      groupDetails({ group: makeBookingGroup({ payment_type: "deposit", amount_paid: 1000, total_price: 4000 }) }),
    );
    expect(message).toContain("มัดจำ");
  });

  it("handles a cart line whose room is unknown", () => {
    const message = buildGroupBookingMessage(
      groupDetails({ items: [{ booking: makeBooking(), room: undefined }] }),
    );
    expect(message).toContain("Standard");
  });
});

describe("group host SMS and dispatch", () => {
  it("packs the cart into a single SMS segment", async () => {
    await expect(sendGroupHostSmsNotification(groupDetails())).resolves.toEqual({ success: true });
    const message = JSON.parse(fetchMock.mock.calls[0][1].body as string).message;
    expect(message.length).toBeLessThanOrEqual(70);
    expect(fetchMock.mock.calls[0][0]).toBe(SMS_ENDPOINT);
  });

  it("marks an unverified cart as awaiting review", async () => {
    await sendGroupHostSmsNotification(groupDetails(), "flagged");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).message).toContain("รอตรวจสอบ");
  });

  it("leads a quick cart's SMS with the quick marker", async () => {
    await sendGroupHostSmsNotification(groupDetails(), "quick");
    const message = JSON.parse(fetchMock.mock.calls[0][1].body as string).message;
    expect(message).toMatch(/^จองด่วน /);
    expect(message).not.toContain("จองใหม่");
    expect(message.length).toBeLessThanOrEqual(70);
  });

  it("does not send without a host phone number", async () => {
    await expect(
      sendGroupHostSmsNotification(groupDetails({ host: lineHost({ phone: null }) })),
    ).resolves.toEqual({ success: false, error: "Host phone not set" });
  });

  it("retries the preferred channel then falls back to email", async () => {
    vi.useFakeTimers();
    const sms = vi.fn().mockResolvedValue({ success: false });

    const promise = dispatchGroupHostNotification(groupDetails(), sms, vi.fn(), "New cart", () => "body");
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(sms).toHaveBeenCalledTimes(3);
    expect(resendSend).toHaveBeenCalledWith(expect.objectContaining({ subject: "New cart" }));
  });

  it("uses LINE when the host prefers it, and skips email on success", async () => {
    const line = vi.fn().mockResolvedValue({ success: true });
    const sms = vi.fn();

    await dispatchGroupHostNotification(
      groupDetails({ host: lineHost({ notification_preference: "line" }) }),
      sms, line, "New cart", () => "body",
    );

    expect(line).toHaveBeenCalledTimes(1);
    expect(sms).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });
});

describe("sendRecommenderPromoUsedNotification", () => {
  const args = (over = {}) => ({
    promo: makePromoCode({ code: "ANN10", recommender_phone: "0899999999" }),
    bookingId: "booking-1",
    guestName: "Nok Suwan",
    discountAmount: 200,
    commissionAmount: 100,
    ...over,
  });

  it("texts the recommender what they earned", async () => {
    await expect(sendRecommenderPromoUsedNotification(args())).resolves.toEqual({ success: true });

    const message = JSON.parse(fetchMock.mock.calls[0][1].body as string).message;
    expect(message).toContain("ANN10");
    expect(message).toContain("Nok Suwan");
    expect(message).toContain("฿100");
  });

  it("writes the message in English on request", async () => {
    await sendRecommenderPromoUsedNotification(args(), "en");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).message).toContain("Code ANN10 used by");
  });

  it("skips when the recommender has no phone number", async () => {
    const promo = makePromoCode({ code: "ANN10", recommender_phone: null });
    await expect(sendRecommenderPromoUsedNotification(args({ promo }))).resolves.toEqual({
      success: true,
      skipped: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips when there is no commission to report", async () => {
    await expect(sendRecommenderPromoUsedNotification(args({ commissionAmount: 0 }))).resolves.toEqual({
      success: true,
      skipped: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("notifyAdminsNewHostRegistration", () => {
  const info = { hostName: "Somchai", hostEmail: "new@host.com" };
  const admins = (rows: unknown[]) => {
    supabaseFrom.mockReturnValue({ select: () => Promise.resolve({ data: rows, error: null }) });
  };

  it("emails and LINE-pushes every admin", async () => {
    admins([
      { email: "admin@peaksnature.com", line_user_id: "U-admin", line_channel_access_token: "admin-token" },
    ]);

    await notifyAdminsNewHostRegistration({ ...info, appUrl: "https://peaksnature.com" });

    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admin@peaksnature.com" }),
    );
    const linePush = fetchMock.mock.calls.find((c) => c[0] === LINE_ENDPOINT);
    expect(linePush).toBeDefined();
    const text = JSON.parse(linePush![1].body as string).messages[0].text;
    expect(text).toContain("Somchai");
    expect(text).toContain("https://peaksnature.com/admin/hosts?status=pending");
  });

  it("falls back to the configured app URL for the review link", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fallback.test");
    admins([{ email: null, line_user_id: "U-admin", line_channel_access_token: "admin-token" }]);

    await notifyAdminsNewHostRegistration(info);

    const linePush = fetchMock.mock.calls.find((c) => c[0] === LINE_ENDPOINT);
    expect(JSON.parse(linePush![1].body as string).messages[0].text).toContain("https://fallback.test");
  });

  it("omits the link when no app URL is known", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    admins([{ email: null, line_user_id: "U-admin", line_channel_access_token: "admin-token" }]);

    await notifyAdminsNewHostRegistration(info);

    const linePush = fetchMock.mock.calls.find((c) => c[0] === LINE_ENDPOINT);
    expect(JSON.parse(linePush![1].body as string).messages[0].text).not.toContain("🔗");
  });

  it("includes the phone the host registered with", async () => {
    admins([
      { email: "admin@peaksnature.com", line_user_id: "U-admin", line_channel_access_token: "admin-token" },
    ]);

    await notifyAdminsNewHostRegistration({ ...info, hostPhone: "0812345678" });

    const linePush = fetchMock.mock.calls.find((c) => c[0] === LINE_ENDPOINT);
    expect(JSON.parse(linePush![1].body as string).messages[0].text).toContain("📱 เบอร์โทร: 0812345678");
    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.stringContaining("0812345678") }),
    );
  });

  it("leaves the phone line out for a host without one", async () => {
    admins([{ email: null, line_user_id: "U-admin", line_channel_access_token: "admin-token" }]);

    await notifyAdminsNewHostRegistration({ ...info, hostPhone: null });

    const linePush = fetchMock.mock.calls.find((c) => c[0] === LINE_ENDPOINT);
    expect(JSON.parse(linePush![1].body as string).messages[0].text).not.toContain("📱");
  });

  it("does nothing when there are no admins", async () => {
    admins([]);
    await notifyAdminsNewHostRegistration(info);
    expect(resendSend).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips email when Resend is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    admins([{ email: "admin@peaksnature.com", line_user_id: null, line_channel_access_token: null }]);

    await notifyAdminsNewHostRegistration(info);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("skips an admin who has not connected LINE", async () => {
    admins([{ email: "admin@peaksnature.com", line_user_id: null, line_channel_access_token: null }]);

    await notifyAdminsNewHostRegistration(info);
    expect(fetchMock.mock.calls.filter((c) => c[0] === LINE_ENDPOINT)).toHaveLength(0);
  });

  it("never throws when the lookup or a send fails", async () => {
    supabaseFrom.mockImplementation(() => {
      throw new Error("no database");
    });
    await expect(notifyAdminsNewHostRegistration(info)).resolves.toBeUndefined();

    admins([{ email: "admin@peaksnature.com", line_user_id: "U", line_channel_access_token: "t" }]);
    resendSend.mockRejectedValue(new Error("resend down"));
    fetchMock.mockRejectedValue(new Error("line down"));
    await expect(notifyAdminsNewHostRegistration(info)).resolves.toBeUndefined();
  });
});

/**
 * The email bodies are large templates whose every line branches on locale and
 * on the booking's shape. This sweep walks each sender through both locales and
 * every variant so a change to the Thai copy cannot silently break the English
 * one (or vice versa).
 */
describe("email template sweep across locales and variants", () => {
  const locales = ["th", "en"] as const;
  const withOptions = {
    selected_options: [
      { id: "a", name: "Breakfast", price: 500, unit_price: 250, pricing_type: "per_night" },
      { id: "b", name: "BBQ", price: 800, pricing_type: "per_time" },
      { id: "c", name: "Legacy", price: 100 },
    ],
  };

  const htmlOf = () => (resendSend.mock.calls.at(-1)![0] as { html: string }).html;

  beforeEach(() => {
    // Exercise the from-address normalisation inside each sender too.
    vi.stubEnv("RESEND_FROM_EMAIL", `"Peaks" <book @peaksnature.com>`);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://peaksnature.com");
  });

  describe.each(locales)("in %s", (locale) => {
    it.each(["confirmed", "pending"] as const)("sends a %s booking confirmation", async (type) => {
      await expect(sendBookingConfirmationEmail(details(), locale, type)).resolves.toMatchObject({ success: true });
      expect(htmlOf()).toBeTruthy();
      expect(resendSend.mock.calls.at(-1)![0]).toMatchObject({ from: "Peaks <book@peaksnature.com>" });
    });

    it.each([
      ["full payment", { payment_type: "full", amount_paid: 2000 }],
      ["deposit", { payment_type: "deposit", amount_paid: 500 }],
    ] as const)("renders a booking paid by %s, with extras", async (_label, payment) => {
      await sendBookingConfirmationEmail(details({ ...payment, ...withOptions }), locale);
      expect(htmlOf()).toContain("Breakfast");
    });

    it("renders a booking with a guest composition and a province", async () => {
      await sendBookingConfirmationEmail(
        details({ guest_province: "chiang_mai", guest_pricing_label: "ผู้ใหญ่ 4 เด็ก 2", num_guests: 6 }),
        locale,
      );
      expect(htmlOf()).toBeTruthy();
    });

    it("renders a booking whose room is unknown", async () => {
      const noRoom = { ...details(), room: undefined };
      await sendBookingConfirmationEmail(noRoom, locale);
      expect(htmlOf()).toBeTruthy();
    });

    it.each(["confirmed", "cancelled"] as const)("sends a %s status update", async (status) => {
      await expect(sendBookingStatusUpdateEmail(details(), status, locale)).resolves.toMatchObject({ success: true });
      expect(htmlOf()).toBeTruthy();
    });

    it("sends a cancellation with a reason and a deposit refund", async () => {
      await sendBookingStatusUpdateEmail(
        details({ payment_type: "deposit", amount_paid: 500, ...withOptions }),
        "cancelled",
        locale,
        "Fully booked",
      );
      expect(htmlOf()).toBeTruthy();
    });

    it.each(["approved", "rejected"] as const)("sends a %s date change", async (status) => {
      await expect(
        sendDateChangeEmailToGuest(
          details(), status, "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3000, locale, "Not available",
        ),
      ).resolves.toMatchObject({ success: true });
      expect(htmlOf()).toBeTruthy();
    });

    it("sends an approved date change with a room swap and payment breakdown", async () => {
      await sendDateChangeEmailToGuest(
        details(), "approved", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3500, locale,
        undefined,
        { oldRoomName: "Pine House", newRoomName: "Oak House" },
        "Oak House",
        {
          oldTotalPrice: 2000,
          priceDifference: 1500,
          amountPaid: 2000,
          additionalPayment: 1500,
          newAmountPaid: 3500,
          remainingBalance: 500,
        },
      );
      expect(htmlOf()).toContain("Oak House");
    });

    it("sends an approved date change that costs less, with nothing outstanding", async () => {
      await sendDateChangeEmailToGuest(
        details(), "approved", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-11", 1000, locale,
        undefined, undefined, undefined,
        {
          oldTotalPrice: 2000,
          priceDifference: -1000,
          amountPaid: 2000,
          additionalPayment: 0,
          newAmountPaid: 2000,
          remainingBalance: 0,
        },
      );
      expect(htmlOf()).toBeTruthy();
    });

    it.each(["confirmed", "pending"] as const)("sends a %s group confirmation", async (type) => {
      await expect(sendGroupBookingConfirmationEmail(groupDetails(), locale, type)).resolves.toMatchObject({
        success: true,
      });
      expect(htmlOf()).toBeTruthy();
    });

    it("sends a group confirmation paid by deposit, with extras and no room", async () => {
      await sendGroupBookingConfirmationEmail(
        groupDetails({
          group: makeBookingGroup({ payment_type: "deposit", amount_paid: 1000, discount_amount: 300 }),
          items: [
            { booking: makeBooking({ id: "b-1", ...withOptions }), room: makeRoom() },
            { booking: makeBooking({ id: "b-2" }), room: undefined },
          ],
        }),
        locale,
      );
      expect(htmlOf()).toBeTruthy();
    });
  });

  it("translates group email content only for English", async () => {
    localizeStrings.mockResolvedValue({ homestayName: "Retreat (EN)", room_0: "Pine (EN)" });

    await sendGroupBookingConfirmationEmail(groupDetails(), "en");
    expect(localizeStrings).toHaveBeenCalled();

    localizeStrings.mockClear();
    await sendGroupBookingConfirmationEmail(groupDetails(), "th");
    expect(localizeStrings).not.toHaveBeenCalled();
  });

  it.each(["", "https://peaksnature.com"])(
    "sends host approval and rejection emails with app URL %s",
    async (appUrl) => {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
      await expect(sendHostApprovalEmail("new@host.com", "Somchai")).resolves.toMatchObject({ success: true });
      await expect(sendHostRejectionEmail("new@host.com", "Somchai")).resolves.toMatchObject({ success: true });
    },
  );
});

/**
 * A cart's money lives on its house rows: /api/bookings/group splits the promo
 * and the deposit across them by price, and pay-balance settles one house
 * without touching booking_groups. These pin what the guest and host read.
 */
describe("cart money in the guest email and the host LINE text", () => {
  const baht = (n: number) => `฿${n.toLocaleString()}`;
  const pine = makeRoom({ name: "Pine House" });
  const oak = makeRoom({ id: "room-2", name: "Oak House" });
  const cart = (group: Partial<Parameters<typeof makeBookingGroup>[0]>, rows: Partial<Booking>[]) =>
    groupDetails({
      group: makeBookingGroup(group),
      items: rows.map((r, i) => ({ booking: makeBooking({ id: `b-${i + 1}`, ...r }), room: i === 0 ? pine : oak })),
    });
  const sentHtml = () => (resendSend.mock.calls[0][0] as { html: string }).html;

  // ฿6,000 + ฿3,000 houses with a ฿300 promo, split 200/100 across the rows.
  const promoCart = () =>
    cart({ total_price: 8700, discount_amount: 300, amount_paid: 8700 }, [
      { total_price: 5800, discount_amount: 200, amount_paid: 5800 },
      { total_price: 2900, discount_amount: 100, amount_paid: 2900 },
    ]);

  it("prices each house at its own price, so the lines add up to the subtotal", async () => {
    await sendGroupBookingConfirmationEmail(promoCart());
    const html = sentHtml();

    expect(html).toContain(baht(6000));
    expect(html).toContain(baht(3000));
    expect(html).toContain(baht(9000)); // subtotal
    expect(html).toContain(`−${baht(300)}`);
    expect(html).toContain(baht(8700)); // total
    expect(html).not.toContain(baht(5800));
    expect(html).not.toContain(baht(2900));
  });

  const depositCart = () =>
    cart({ payment_type: "deposit", amount_paid: 1000, total_price: 4000 }, [
      { total_price: 2000, amount_paid: 500, payment_type: "deposit" },
      { total_price: 2000, amount_paid: 500, payment_type: "deposit" },
    ]);

  it("tells a confirmed deposit cart what is left to pay on arrival", async () => {
    await sendGroupBookingConfirmationEmail(depositCart(), "th", "confirmed");
    const html = sentHtml();

    expect(html).toContain("ยอดค้างชำระ");
    expect(html).toContain(baht(3000));
    expect(html).toContain("ชำระเมื่อเข้าพัก");
  });

  it("does not ask a cancelled cart to pay a balance on arrival", async () => {
    await sendGroupBookingConfirmationEmail(depositCart(), "th", "cancelled", "ไม่ว่าง");
    const html = sentHtml();

    expect(html).not.toContain("ยอดค้างชำระ");
    expect(html).not.toContain("ชำระเมื่อเข้าพัก");
    expect(html).toContain(baht(4000)); // the total still shows
  });

  // pay-balance accepts a verified booking, so a guest can settle one house
  // before the host confirms the cart; booking_groups still says ฿1,000 paid.
  it("reads paid and balance from the houses, not the stale group row", async () => {
    await sendGroupBookingConfirmationEmail(
      cart({ payment_type: "deposit", amount_paid: 1000, total_price: 4000 }, [
        { total_price: 2000, amount_paid: 2000, payment_type: "full" },
        { total_price: 2000, amount_paid: 500, payment_type: "deposit" },
      ]),
      "th",
      "confirmed",
    );
    const html = sentHtml();

    expect(html).toContain(baht(2500)); // paid
    expect(html).toContain(baht(1500)); // balance
    expect(html).not.toContain(baht(1000));
  });

  it("shows no balance once every house is paid, even if the cart began as a deposit", async () => {
    await sendGroupBookingConfirmationEmail(
      cart({ payment_type: "deposit", amount_paid: 1000, total_price: 4000 }, [
        { total_price: 2000, amount_paid: 2000, payment_type: "full" },
        { total_price: 2000, amount_paid: 2000, payment_type: "full" },
      ]),
      "th",
      "confirmed",
    );
    expect(sentHtml()).not.toContain("ยอดค้างชำระ");
  });

  it("gives the host each house's own price and takes the promo off once in LINE", () => {
    const message = buildGroupBookingMessage(promoCart());

    expect(message).toContain(`· ${baht(6000)}`);
    expect(message).toContain(`· ${baht(3000)}`);
    expect(message).toContain(`ส่วนลด: −${baht(300)}`);
    expect(message).toContain(`ยอดรวมทั้งหมด: ${baht(8700)}`);
    expect(message).not.toContain(baht(5800));
  });

  it("adds no discount line to a LINE text without a promo", () => {
    expect(buildGroupBookingMessage(groupDetails())).not.toContain("ส่วนลด");
  });
});

// F-15: names and notes typed by guests (or hosts) went into email HTML as-is,
// so a booking could make Peaksnature's own sender deliver a phishing link to
// any address. HTML builders escape them; subjects and LINE text stay plain.
describe("HTML typed by guests or hosts", () => {
  const ATTACK = '<a href="https://evil.example">Claim your refund</a>';
  const sentHtml = () => (resendSend.mock.calls[0][0] as { html: string }).html;
  const sentSubject = () => (resendSend.mock.calls[0][0] as { subject: string }).subject;
  const expectEscaped = (html: string) => {
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;Claim your refund&lt;/a&gt;");
  };

  it("escapes the guest's name in the booking confirmation", async () => {
    await sendBookingConfirmationEmail(details({ guest_name: ATTACK }));
    expectEscaped(sentHtml());
  });

  it("escapes an add-on name in the booking confirmation", async () => {
    await sendBookingConfirmationEmail(
      details({ selected_options: [{ id: "o1", name: ATTACK, price: 100 }] as never }),
    );
    expectEscaped(sentHtml());
  });

  it("escapes the guest's name in the status update", async () => {
    await sendBookingStatusUpdateEmail(details({ guest_name: ATTACK }), "confirmed");
    expectEscaped(sentHtml());
  });

  it("escapes the host's reason in a refused date change", async () => {
    await sendDateChangeEmailToGuest(details(), "rejected", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3000, "th", ATTACK);
    expectEscaped(sentHtml());
  });

  it("escapes the guest's name in a cart confirmation", async () => {
    await sendGroupBookingConfirmationEmail(groupDetails({ group: makeBookingGroup({ guest_name: ATTACK }) }));
    expectEscaped(sentHtml());
  });

  it("escapes the name a new host registered with, in the admins' email", async () => {
    supabaseFrom.mockReturnValue({
      select: () => Promise.resolve({ data: [{ email: "admin@peaksnature.com", line_user_id: null, line_channel_access_token: null }], error: null }),
    });
    await notifyAdminsNewHostRegistration({ hostName: ATTACK, hostEmail: "new@host.com" });
    expectEscaped(sentHtml());
  });

  it("escapes the host's name in the approval email", async () => {
    await sendHostApprovalEmail("new@host.com", ATTACK);
    expectEscaped(sentHtml());
  });

  it("leaves the subject as plain text: an & in a homestay name stays an &", async () => {
    await sendBookingConfirmationEmail({ ...details(), homestay: makeHomestay({ name: "Coffee & Camping" }) });
    expect(sentSubject()).toContain("Coffee & Camping");
    expect(sentSubject()).not.toContain("&amp;");
  });

  it("leaves LINE text plain: the host reads the name as typed", async () => {
    await sendHostLineNotification(details({ guest_name: "Nok & Co" }), "confirmed");
    const linePush = fetchMock.mock.calls.find((c) => c[0] === LINE_ENDPOINT);
    const text = JSON.parse(linePush![1].body as string).messages[0].text as string;
    expect(text).toContain("Nok & Co");
    expect(text).not.toContain("&amp;");
  });
});

describe("HTML typed by hosts, in a cart confirmation", () => {
  it("escapes a house's pricing label", async () => {
    await sendGroupBookingConfirmationEmail(
      groupDetails({
        items: [{ booking: makeBooking({ id: "b-1", guest_pricing_label: "<b>VIP</b>" }), room: makeRoom({ name: "Pine House" }) }],
      }),
    );
    const html = (resendSend.mock.calls[0][0] as { html: string }).html;
    expect(html).not.toContain("<b>VIP</b>");
    expect(html).toContain("&lt;b&gt;VIP&lt;/b&gt;");
  });
});

// Colours that failed WCAG AA on the backgrounds they sat on (2026-11-16
// review): white on amber 2.15:1, grey footer 2.54:1, green text 3.15:1,
// amber text 3.05:1. A guest reads these on a phone in daylight.
describe("guest and host emails stay readable", () => {
  const LOW_CONTRAST = /#(f59e0b|9ca3af|16a34a|d97706)/i;
  const payment = { oldTotalPrice: 3000, priceDifference: 600, amountPaid: 1000, additionalPayment: 600, newAmountPaid: 1600, remainingBalance: 2000 };

  it.each([
    ["pending confirmation", () => sendBookingConfirmationEmail(details(), "th", "pending")],
    ["confirmed", () => sendBookingConfirmationEmail(details(), "th", "confirmed")],
    ["cancelled", () => sendBookingStatusUpdateEmail(details(), "cancelled", "th", "reason")],
    ["date change with payment summary", () =>
      sendDateChangeEmailToGuest(details(), "approved", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3600, "th", undefined, undefined, undefined, payment)],
    ["date change rejected", () =>
      sendDateChangeEmailToGuest(details(), "rejected", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3000, "th", "full")],
    ["cart pending", () => sendGroupBookingConfirmationEmail(groupDetails(), "th", "pending")],
    ["cart confirmed", () => sendGroupBookingConfirmationEmail(groupDetails(), "th", "confirmed")],
    ["quick booking", () => sendQuickBookingEmail(details(), "th")],
    ["host approval", () => sendHostApprovalEmail("new@host.com", "Somchai")],
    ["host rejection", () => sendHostRejectionEmail("new@host.com", "Somchai")],
  ])("%s uses no low-contrast colour", async (_name, send) => {
    await send();
    const html = (resendSend.mock.calls[0][0] as { html: string }).html;
    expect(html).not.toMatch(LOW_CONTRAST);
  });
});

// Guest-facing wording found unclear in the 2026-11-16 review. The app itself
// says "ยอดรวม" for the total and "ยอดที่ชำระ" for what was paid (messages/th.json);
// the confirmed email said "ยอดชำระรวม" for the total, which reads as the amount paid.
describe("guest email wording", () => {
  const html = () => (resendSend.mock.calls[0][0] as { html: string }).html;
  const deposit = { payment_type: "deposit", amount_paid: 1000, total_price: 3000 } as Partial<Booking>;

  it.each([
    ["confirmed", () => sendBookingConfirmationEmail(details(deposit), "th", "confirmed")],
    ["host-confirmed", () => sendBookingStatusUpdateEmail(details(deposit), "confirmed", "th")],
    ["cart confirmed", () => sendGroupBookingConfirmationEmail(groupDetails(), "th", "confirmed")],
  ])("%s labels the total 'ยอดรวม', never 'ยอดชำระรวม'", async (_name, send) => {
    await send();
    expect(html()).not.toContain("ยอดชำระรวม");
    expect(html()).toMatch(/ยอดรวม<\/td>/);
  });

  it.each([
    ["confirmed", "en", () => sendBookingConfirmationEmail(details({ num_guests: 2 }), "en", "confirmed"), "2 guests"],
    ["confirmed", "th", () => sendBookingConfirmationEmail(details({ num_guests: 2 }), "th", "confirmed"), "2 ท่าน"],
    ["pending", "en", () => sendBookingConfirmationEmail(details({ num_guests: 2 }), "en", "pending"), "2 guests"],
    ["pending", "th", () => sendBookingConfirmationEmail(details({ num_guests: 2 }), "th", "pending"), "2 ท่าน"],
    ["host-confirmed", "en", () => sendBookingStatusUpdateEmail(details({ num_guests: 2 }), "confirmed", "en"), "2 guests"],
  ])("%s email (%s) gives the guest count its unit", async (_name, _locale, send, expected) => {
    await send();
    expect(html()).toContain(expected);
  });

  it("says '1 guest', not '1 guests'", async () => {
    await sendBookingConfirmationEmail(details({ num_guests: 1 }), "en", "confirmed");
    expect(html()).toContain("1 guest<");
    expect(html()).not.toContain("1 guests");
  });

  // The header was solid #ef4444 with white text (3.76:1, readable only as large
  // text). Pending and cancelled now share one pattern: a pale tint, dark text.
  it.each([
    ["cancelled", () => sendBookingStatusUpdateEmail(details(), "cancelled", "th", "reason")],
    ["cart cancelled", () => sendGroupBookingConfirmationEmail(groupDetails(), "th", "cancelled", "reason")],
  ])("%s has a pale header, not solid red with white text", async (_name, send) => {
    await send();
    const html = (resendSend.mock.calls[0][0] as { html: string }).html;
    expect(html).not.toContain("background: #ef4444");
    expect(html).toContain("background: #fef2f2");
  });

  // The reason box had a 4px coloured stripe down its left edge.
  it.each([
    ["cancelled", () => sendBookingStatusUpdateEmail(details(), "cancelled", "th", "full")],
    ["cart cancelled", () => sendGroupBookingConfirmationEmail(groupDetails(), "th", "cancelled", "full")],
  ])("%s shows the reason in a bordered box, with no side stripe", async (_name, send) => {
    await send();
    const html = (resendSend.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain("full");
    expect(html).not.toContain("border-left: 4px");
  });

  // The discount row had no font size, so it rendered larger than its neighbours.
  it("sets the discount row in the pending email at the size of the rows around it", async () => {
    await sendBookingConfirmationEmail(details({ discount_amount: 300 }), "th", "pending");
    const html = (resendSend.mock.calls[0][0] as { html: string }).html;
    expect(html).toMatch(/font-size: 13px;[^"]*">ส่วนลด<\/td>/);
  });
});

// A host who confirms a booking by hand (a quick booking, or a slip EasySlip could
// not verify) triggers sendBookingStatusUpdateEmail. Its "confirmed" email was a
// copy of the automatic one that left out the discount and the amount still due
// on arrival, so a guest who paid a deposit was never told the balance.
describe("host-confirmed booking email", () => {
  const sentHtml = (n = 0) => (resendSend.mock.calls[n][0] as { html: string }).html;
  const confirmByHost = (over: Partial<Booking>) => sendBookingStatusUpdateEmail(details(over), "confirmed", "th");

  it("tells a guest who paid a deposit what is still due on arrival", async () => {
    await confirmByHost({ payment_type: "deposit", amount_paid: 1000, total_price: 3000 });
    const html = sentHtml();
    expect(html).toMatch(/ยอดที่ชำระ<\/td>[^]*?฿1,000/);
    expect(html).toMatch(/ยอดค้างชำระ<\/td>[^]*?฿2,000/);
    expect(html).toContain("ชำระเมื่อเข้าพัก");
  });

  it("shows no balance rows when the guest paid in full", async () => {
    await confirmByHost({ payment_type: "full", amount_paid: 3000, total_price: 3000 });
    expect(sentHtml()).not.toContain("ยอดค้างชำระ");
  });

  it("shows the subtotal and the discount a promo code gave", async () => {
    await confirmByHost({ discount_amount: 300, total_price: 2700 });
    const html = sentHtml();
    expect(html).toMatch(/ยอดก่อนหักส่วนลด<\/td>[^]*?฿3,000/);
    expect(html).toContain("−฿300");
  });

  it("is the same email the guest gets when the slip verifies on its own", async () => {
    const booking = { payment_type: "deposit", amount_paid: 1000, total_price: 3000, discount_amount: 300 } as Partial<Booking>;
    await sendBookingConfirmationEmail(details(booking), "th", "confirmed");
    await confirmByHost(booking);
    expect(sentHtml(1)).toBe(sentHtml(0));
    expect((resendSend.mock.calls[1][0] as { subject: string }).subject).toBe(
      (resendSend.mock.calls[0][0] as { subject: string }).subject,
    );
  });
});

// The confirmation email was a dead end: nothing in it led back to the booking
// site, where the guest can change dates or check in. The links are plain page
// URLs: those pages ask for the guest's phone and email themselves, and keep
// them out of URLs on purpose (api/bookings/search), so no booking id or contact
// detail may ride along in a link.
describe("links back to the booking site", () => {
  const SLUG = "doi-inthanon-retreat";
  const site = `${SITE_URL}/${SLUG}`;
  const html = (n = 0) => (resendSend.mock.calls[n][0] as { html: string }).html;
  const hrefs = (h: string) => [...h.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

  it.each([
    ["confirmed", "th", () => sendBookingConfirmationEmail(details(), "th", "confirmed"), "เปลี่ยนบ้านพัก / วันที่", "เช็คอิน / เช็คเอาท์"],
    ["confirmed", "en", () => sendBookingConfirmationEmail(details(), "en", "confirmed"), "Change House / Date", "Check-in / Check-out"],
    ["host-confirmed", "th", () => sendBookingStatusUpdateEmail(details(), "confirmed", "th"), "เปลี่ยนบ้านพัก / วันที่", "เช็คอิน / เช็คเอาท์"],
    ["cart confirmed", "th", () => sendGroupBookingConfirmationEmail(groupDetails(), "th", "confirmed"), "เปลี่ยนบ้านพัก / วันที่", "เช็คอิน / เช็คเอาท์"],
  ])("%s (%s) links to changing the booking and to check-in", async (_n, _l, send, changeLabel, checkInLabel) => {
    await send();
    expect(hrefs(html())).toEqual(expect.arrayContaining([`${site}/change-booking`, `${site}/check-in-out`]));
    expect(html()).toContain(`>${changeLabel}</a>`);
    expect(html()).toContain(`>${checkInLabel}</a>`);
  });

  it.each([
    ["cancelled", "th", () => sendBookingStatusUpdateEmail(details(), "cancelled", "th", "full"), "จองที่พักเลย"],
    ["cancelled", "en", () => sendBookingStatusUpdateEmail(details(), "cancelled", "en", "full"), "Book your stay"],
    ["cart cancelled", "th", () => sendGroupBookingConfirmationEmail(groupDetails(), "th", "cancelled", "full"), "จองที่พักเลย"],
  ])("%s (%s) links back to the homestay's booking page", async (_n, _l, send, label) => {
    await send();
    expect(hrefs(html())).toContain(site);
    expect(html()).toContain(`>${label}</a>`);
    expect(html()).not.toContain("change-booking");
  });

  it.each([
    ["pending", () => sendBookingConfirmationEmail(details(), "th", "pending")],
    ["cart pending", () => sendGroupBookingConfirmationEmail(groupDetails(), "th", "pending")],
    ["date change", () => sendDateChangeEmailToGuest(details(), "rejected", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3000)],
  ])("%s has no booking-management link: nothing is confirmed yet", async (_n, send) => {
    await send();
    expect(html()).not.toContain("change-booking");
    expect(html()).not.toContain("check-in-out");
  });

  it("never puts a booking id, name, phone or email in a link", async () => {
    const booking = { guest_name: "Somying Jaidee", guest_phone: "0812345678", guest_email: "somying@example.com" } as Partial<Booking>;
    const d = details(booking);
    await sendBookingConfirmationEmail(d, "th", "confirmed");
    await sendBookingStatusUpdateEmail(d, "cancelled", "th", "full");
    for (const n of [0, 1]) {
      for (const href of hrefs(html(n))) {
        expect(href).not.toMatch(/[?#=]/);
        for (const secret of [d.booking.id, "Somying", "0812345678", "somying@example.com"]) {
          expect(href).not.toContain(secret);
        }
      }
    }
  });

  it("keeps an odd slug inside its own link", async () => {
    const d = { ...details(), homestay: makeHomestay({ slug: 'a"b>c d' }) };
    await sendBookingConfirmationEmail(d, "th", "confirmed");
    expect(hrefs(html())).toContain(`${SITE_URL}/a%22b%3Ec%20d/change-booking`);
    expect(html()).not.toContain('a"b>c');
  });
});

// At 375px the label column (a fixed 38%) broke Thai labels across two lines
// ("ประเภทบ้าน / พัก", "ยอดชำระ / รวม"), and the booking id was a 36-character
// UUID wrapped over two lines that nobody can read out or type. The host's
// dashboard and the guest's own checkout already show the first 8 characters
// (bookingCode), so the emails show that.
describe("guest email layout on a phone", () => {
  const ID = "3f2a9c1e-aaaa-4bbb-8ccc-1234567890ab";
  const CODE = "3f2a9c1e";
  const html = () => (resendSend.mock.calls[0][0] as { html: string }).html;
  const withId = (over: Partial<Booking> = {}) => details({ id: ID, ...over });

  const guestEmails: [string, () => Promise<unknown>][] = [
    ["confirmed", () => sendBookingConfirmationEmail(withId(), "th", "confirmed")],
    ["pending", () => sendBookingConfirmationEmail(withId(), "th", "pending")],
    ["cancelled", () => sendBookingStatusUpdateEmail(withId(), "cancelled", "th", "full")],
    ["date change approved", () => sendDateChangeEmailToGuest(withId(), "approved", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3000)],
    ["date change rejected", () => sendDateChangeEmailToGuest(withId(), "rejected", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3000, "th", "full")],
  ];

  it.each(guestEmails)("%s shows the 8-character code, not the whole id", async (_n, send) => {
    await send();
    expect(html()).toContain(`>${CODE}<`);
    expect(html()).not.toContain(ID);
  });

  it("shows a cart by its 8-character code too", async () => {
    const cart = groupDetails({ group: makeBookingGroup({ id: ID }) });
    await sendGroupBookingConfirmationEmail(cart, "th", "confirmed");
    expect(html()).toContain(`>${CODE}<`);
    expect(html()).not.toContain(ID);
  });

  it.each([
    ...guestEmails,
    ["cart", () => sendGroupBookingConfirmationEmail(groupDetails(), "th", "confirmed")],
    ["quick booking", () => sendQuickBookingEmail(withId(), "th")],
  ] as [string, () => Promise<unknown>][])("%s keeps each label on one line", async (_n, send) => {
    await send();
    const labelCells = [...html().matchAll(/<td style="([^"]*color: #6b7280; font-size: 1[34]px[^"]*)"/g)].map((m) => m[1]);
    expect(labelCells.length).toBeGreaterThan(0);
    for (const style of labelCells.filter((s) => /vertical-align: (top|middle)/.test(s))) {
      expect(style).toContain("white-space: nowrap");
    }
    expect(html()).not.toContain("width: 38%");
  });
});

// One voice and one palette across the guest emails (2026-11-16 review): the same
// word was spelt two ways, two emails greeted "สวัสดีคุณ" while the rest opened
// "เรียน คุณ", and three buttons were near-black rather than the brand Forest.
describe("one voice and one palette across the emails", () => {
  const html = () => (resendSend.mock.calls[0][0] as { html: string }).html;
  const guestEmails: [string, () => Promise<unknown>][] = [
    ["confirmed", () => sendBookingConfirmationEmail(details(), "th", "confirmed")],
    ["pending", () => sendBookingConfirmationEmail(details(), "th", "pending")],
    ["cancelled", () => sendBookingStatusUpdateEmail(details(), "cancelled", "th", "full")],
    ["cart confirmed", () => sendGroupBookingConfirmationEmail(groupDetails(), "th", "confirmed")],
    ["quick booking", () => sendQuickBookingEmail(details(), "th")],
    ["date change", () => sendDateChangeEmailToGuest(details(), "approved", "2026-01-12", "2026-01-14", "2026-02-10", "2026-02-13", 3000)],
  ];

  it.each(guestEmails)("%s spells check-in/check-out as the app does, and names the house plainly", async (_n, send) => {
    await send();
    expect(html()).not.toContain("เช็ก");
    expect(html()).not.toContain("ประเภทบ้านพัก");
  });

  it("labels the house 'House', not 'House Type', in English", async () => {
    await sendBookingConfirmationEmail(details(), "en", "confirmed");
    expect(html()).not.toContain("House Type");
  });

  it.each([
    ["pending", () => sendBookingConfirmationEmail(details(), "th", "pending"), "เรียน คุณ"],
    ["cancelled", () => sendBookingStatusUpdateEmail(details(), "cancelled", "th", "full"), "เรียน คุณ"],
    ["pending (en)", () => sendBookingConfirmationEmail(details(), "en", "pending"), "Dear "],
    ["cancelled (en)", () => sendBookingStatusUpdateEmail(details(), "cancelled", "en", "full"), "Dear "],
  ])("%s opens the same way as every other guest email", async (_n, send, greeting) => {
    await send();
    expect(html()).toContain(greeting);
    expect(html()).not.toContain("สวัสดีคุณ");
    expect(html()).not.toMatch(/>Hi /);
  });

  it.each([
    // The button only shows when the host has a Facebook page to send the slip to.
    ["quick booking", () => sendQuickBookingEmail({ ...details(), homestay: makeHomestay({ facebook_url: "https://www.facebook.com/ingkhoacamp" }) }, "th")],
    ["host approval", () => sendHostApprovalEmail("new@host.com", "Somchai")],
  ])("%s has a Forest button, not a near-black one", async (_n, send) => {
    await send();
    expect(html()).not.toContain("background: #111827");
    expect(html()).toContain("background: #2F5D50");
  });

  it("gives the admin email a Forest button too", async () => {
    supabaseFrom.mockReturnValue({
      select: () => Promise.resolve({ data: [{ email: "admin@peaksnature.com", line_user_id: null, line_channel_access_token: null }], error: null }),
    });
    await notifyAdminsNewHostRegistration({ hostName: "Somchai", hostEmail: "new@host.com", appUrl: "https://peaksnature.com" });
    expect(html()).not.toContain("background: #111827");
    expect(html()).toContain("background: #2F5D50");
  });
});
